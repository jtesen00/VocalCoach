using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.Modules.Identity.IntegrationEvents;
using VocalCoach.Modules.Practice.IntegrationEvents;
using VocalCoach.Modules.Progress.Application.Abstractions;
using VocalCoach.Modules.Progress.Domain;

namespace VocalCoach.Modules.Progress.Application.Features.TrackAttempt;

/// <summary>Cada intento registrado en Practice actualiza el progreso. Idempotente: la outbox entrega "al menos una vez".</summary>
internal sealed class AttemptRecordedHandler(ILearnerProgressRepository repository, [FromKeyedServices(ProgressModule.Schema)] IUnitOfWork unitOfWork)
    : IIntegrationEventHandler<AttemptRecordedIntegrationEvent>
{
    public async Task Handle(AttemptRecordedIntegrationEvent e, CancellationToken cancellationToken)
    {
        if (!await repository.TryMarkProcessedAsync(e.AttemptId, cancellationToken))
        {
            return;
        }

        var progress = await repository.GetAsync(e.UserId, cancellationToken);
        if (progress is null)
        {
            progress = LearnerProgress.Start(e.UserId);
            repository.Add(progress);
        }

        progress.Record(e.Kind, e.ItemId, e.LocalDay, e.Score, e.Passed, e.DurationSeconds, e.PerformedAtUtc);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>Cuenta nueva: se crea su progreso vacío.</summary>
internal sealed class UserRegisteredHandler(ILearnerProgressRepository repository, [FromKeyedServices(ProgressModule.Schema)] IUnitOfWork unitOfWork)
    : IIntegrationEventHandler<UserRegisteredIntegrationEvent>
{
    public async Task Handle(UserRegisteredIntegrationEvent e, CancellationToken cancellationToken)
    {
        if (await repository.GetAsync(e.UserId, cancellationToken) is null)
        {
            repository.Add(LearnerProgress.Start(e.UserId));
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }
}
