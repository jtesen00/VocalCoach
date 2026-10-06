using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Practice.Application.Abstractions;
using VocalCoach.Modules.Practice.Domain;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Practice.Application.Features.SyncAttempts;

/// <summary>
/// Sube un lote de intentos hechos en el dispositivo. Idempotente: los que ya estaban se
/// ignoran, así el cliente puede reintentar sin miedo a duplicar.
/// </summary>
public sealed record SyncAttemptsCommand(Guid UserId, IReadOnlyList<AttemptDto> Attempts) : ICommand<SyncAttemptsResponse>;

public sealed record AttemptDto(
    Guid Id,
    string Kind,
    string ItemId,
    DateTime PerformedAtUtc,
    DateOnly LocalDay,
    int Score,
    double? Accuracy,
    bool Passed,
    double DurationSeconds,
    string? Details);

public sealed record SyncAttemptsResponse(int Accepted, int AlreadySynced, IReadOnlyList<RejectedAttempt> Rejected);

public sealed record RejectedAttempt(Guid Id, string Code, string Message);

internal sealed class SyncAttemptsValidator : AbstractValidator<SyncAttemptsCommand>
{
    public const int MaxBatch = 500;

    public SyncAttemptsValidator()
    {
        RuleFor(c => c.Attempts).NotEmpty().WithErrorCode("sync.empty").WithMessage("No hay intentos que sincronizar.");
        RuleFor(c => c.Attempts.Count).LessThanOrEqualTo(MaxBatch).WithErrorCode("sync.too_many").WithMessage($"Como máximo {MaxBatch} intentos por petición.");
    }
}

internal sealed class SyncAttemptsHandler(
    IAttemptRepository attempts,
    [FromKeyedServices(PracticeModule.Schema)] IUnitOfWork unitOfWork,
    TimeProvider time) : ICommandHandler<SyncAttemptsCommand, SyncAttemptsResponse>
{
    public async Task<Result<SyncAttemptsResponse>> Handle(SyncAttemptsCommand command, CancellationToken cancellationToken)
    {
        var batch = command.Attempts.DistinctBy(a => a.Id).ToList();
        var owners = await attempts.GetOwnersAsync(batch.Select(a => a.Id).ToList(), cancellationToken);
        var now = time.GetUtcNow().UtcDateTime;
        int accepted = 0, already = 0;
        var rejected = new List<RejectedAttempt>();

        foreach (var dto in batch)
        {
            if (owners.TryGetValue(dto.Id, out var owner))
            {
                if (owner == command.UserId)
                {
                    already++;
                }
                else
                {
                    rejected.Add(new RejectedAttempt(dto.Id, "attempt.id_taken", "Ese id ya está en uso."));
                }

                continue;
            }

            if (!Enum.TryParse<AttemptKind>(dto.Kind, ignoreCase: true, out var kind))
            {
                rejected.Add(new RejectedAttempt(dto.Id, "attempt.invalid_kind", "Tipo de intento desconocido."));
                continue;
            }

            var result = Attempt.Record(dto.Id, command.UserId, kind, dto.ItemId, DateTime.SpecifyKind(dto.PerformedAtUtc, DateTimeKind.Utc), dto.LocalDay, dto.Score, dto.Accuracy, dto.Passed, dto.DurationSeconds, dto.Details, now);
            if (result.IsFailure)
            {
                rejected.Add(new RejectedAttempt(dto.Id, result.Error.Code, result.Error.Message));
                continue;
            }

            attempts.Add(result.Value);
            accepted++;
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new SyncAttemptsResponse(accepted, already, rejected);
    }
}
