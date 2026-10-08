using VocalCoach.BuildingBlocks.Application.Events;

namespace VocalCoach.Modules.Identity.IntegrationEvents;

/// <summary>Contrato público: se creó una cuenta.</summary>
public sealed record UserRegisteredIntegrationEvent(Guid Id, DateTime OccurredOnUtc, Guid UserId) : IntegrationEvent(Id, OccurredOnUtc);
