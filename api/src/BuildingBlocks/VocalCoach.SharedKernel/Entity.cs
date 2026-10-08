namespace VocalCoach.SharedKernel;

/// <summary>Entidad con identidad propia.</summary>
public abstract class Entity<TId>
    where TId : notnull
{
    public TId Id { get; protected init; } = default!;
}

/// <summary>
/// Raíz de agregado: frontera de consistencia. Acumula domain events que se despachan
/// al guardar, dentro de la misma transacción (BuildingBlocks.Infrastructure).
/// </summary>
public abstract class AggregateRoot<TId> : Entity<TId>, IHasDomainEvents
    where TId : notnull
{
    private readonly List<IDomainEvent> _domainEvents = [];

    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents;

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    public void ClearDomainEvents() => _domainEvents.Clear();
}

public interface IHasDomainEvents
{
    IReadOnlyCollection<IDomainEvent> DomainEvents { get; }

    void ClearDomainEvents();
}
