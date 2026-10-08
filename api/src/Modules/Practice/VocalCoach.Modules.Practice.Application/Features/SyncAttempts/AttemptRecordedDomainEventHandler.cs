using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.Modules.Practice.Domain;
using VocalCoach.Modules.Practice.IntegrationEvents;

namespace VocalCoach.Modules.Practice.Application.Features.SyncAttempts;

/// <summary>Publica el intento para otros módulos (Progress) a través de la outbox, en la misma transacción.</summary>
internal sealed class AttemptRecordedDomainEventHandler([FromKeyedServices(PracticeModule.Schema)] IOutbox outbox) : IDomainEventHandler<AttemptRecordedDomainEvent>
{
    public Task Handle(AttemptRecordedDomainEvent e, CancellationToken cancellationToken)
    {
        outbox.Add(new AttemptRecordedIntegrationEvent(
            e.Id, e.OccurredOnUtc, e.AttemptId, e.UserId, e.Kind.ToString().ToLowerInvariant(), e.ItemId, e.LocalDay, e.Score, e.Passed, e.DurationSeconds, e.PerformedAtUtc));
        return Task.CompletedTask;
    }
}
