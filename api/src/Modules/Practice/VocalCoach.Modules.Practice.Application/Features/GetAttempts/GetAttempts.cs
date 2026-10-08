using Dapper;
using FluentValidation;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Practice.Application.Features.GetAttempts;

/// <summary>Intentos del usuario recibidos después de `Since` (para traer al dispositivo lo hecho en otros). Paginado.</summary>
public sealed record GetAttemptsQuery(Guid UserId, DateTime? Since, int Limit = 500) : IQuery<AttemptsPage>;

public sealed record AttemptView(
    Guid Id,
    string Kind,
    string ItemId,
    DateTime PerformedAtUtc,
    DateOnly LocalDay,
    int Score,
    double? Accuracy,
    bool Passed,
    double DurationSeconds,
    string? Details,
    DateTime ReceivedAtUtc);

/// <summary>`Next`: valor de `Since` para pedir la página siguiente (null si no hay más).</summary>
public sealed record AttemptsPage(IReadOnlyList<AttemptView> Attempts, DateTime? Next);

internal sealed class GetAttemptsValidator : AbstractValidator<GetAttemptsQuery>
{
    public GetAttemptsValidator() =>
        RuleFor(q => q.Limit).InclusiveBetween(1, 1000).WithErrorCode("attempts.limit").WithMessage("El límite debe estar entre 1 y 1000.");
}

internal sealed class GetAttemptsHandler(IDbConnectionFactory db) : IQueryHandler<GetAttemptsQuery, AttemptsPage>
{
    public async Task<Result<AttemptsPage>> Handle(GetAttemptsQuery query, CancellationToken cancellationToken)
    {
        await using var connection = await db.OpenConnectionAsync(cancellationToken);
        var rows = (await connection.QueryAsync<AttemptRow>(
            new CommandDefinition(
                """
                SELECT id, lower(kind) AS kind, item_id, performed_at_utc, local_day, score, accuracy, passed, duration_seconds, details, received_at_utc
                FROM practice.attempts
                WHERE user_id = @UserId AND (@Since::timestamptz IS NULL OR received_at_utc > @Since)
                ORDER BY received_at_utc, id
                LIMIT @Take
                """,
                new { query.UserId, query.Since, Take = query.Limit + 1 },
                cancellationToken: cancellationToken))).ToList();

        var page = rows.Take(query.Limit).Select(r => r.ToView()).ToList();
        // Varios intentos pueden compartir received_at_utc (llegan en el mismo lote): se corta antes del último instante si hay más.
        DateTime? next = null;
        if (rows.Count > query.Limit)
        {
            var last = page[^1].ReceivedAtUtc;
            var cut = page.FindLastIndex(a => a.ReceivedAtUtc < last);
            if (cut >= 0)
            {
                page = page[..(cut + 1)];
                next = page[^1].ReceivedAtUtc;
            }
            else
            {
                next = last; // un lote enorme con el mismo instante: se entrega entero en esta página
            }
        }

        return new AttemptsPage(page, next);
    }

    private sealed record AttemptRow(Guid Id, string Kind, string ItemId, DateTime PerformedAtUtc, DateOnly LocalDay, int Score, double? Accuracy, bool Passed, double DurationSeconds, string? Details, DateTime ReceivedAtUtc)
    {
        public AttemptView ToView() => new(Id, Kind, ItemId, PerformedAtUtc, LocalDay, Score, Accuracy, Passed, DurationSeconds, Details, ReceivedAtUtc);
    }
}
