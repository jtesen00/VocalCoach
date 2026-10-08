using VocalCoach.SharedKernel;

namespace VocalCoach.BuildingBlocks.Application.Events;

/// <summary>Reacción a un domain event, dentro del mismo módulo y de la misma transacción.</summary>
public interface IDomainEventHandler<in TEvent>
    where TEvent : IDomainEvent
{
    Task Handle(TEvent domainEvent, CancellationToken cancellationToken);
}

/// <summary>Contrato público entre módulos. Viaja por la outbox del módulo que lo publica.</summary>
public interface IIntegrationEvent
{
    Guid Id { get; }

    DateTime OccurredOnUtc { get; }
}

public abstract record IntegrationEvent(Guid Id, DateTime OccurredOnUtc) : IIntegrationEvent;

/// <summary>Reacción de otro módulo a un integration event. Debe ser idempotente (entrega "al menos una vez").</summary>
public interface IIntegrationEventHandler<in TEvent>
    where TEvent : IIntegrationEvent
{
    Task Handle(TEvent integrationEvent, CancellationToken cancellationToken);
}

/// <summary>
/// Publica un integration event en la outbox del módulo actual: se guarda en la misma
/// transacción que el cambio que lo provoca y se entrega después.
/// </summary>
public interface IOutbox
{
    void Add(IIntegrationEvent integrationEvent);
}
