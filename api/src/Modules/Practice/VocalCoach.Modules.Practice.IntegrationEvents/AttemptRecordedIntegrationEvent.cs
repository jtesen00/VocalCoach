using VocalCoach.BuildingBlocks.Application.Events;

namespace VocalCoach.Modules.Practice.IntegrationEvents;

/// <summary>Contrato público: se registró un intento nuevo (no se repite al re-sincronizar).</summary>
public sealed record AttemptRecordedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    Guid AttemptId,
    Guid UserId,
    string Kind,
    string ItemId,
    DateOnly LocalDay,
    int Score,
    bool Passed,
    double DurationSeconds,
    DateTime PerformedAtUtc) : IntegrationEvent(Id, OccurredOnUtc);
