namespace VocalCoach.SharedKernel;

/// <summary>Algo que pasó en el dominio. Se maneja dentro del mismo módulo y transacción.</summary>
public interface IDomainEvent
{
    Guid Id { get; }

    DateTime OccurredOnUtc { get; }
}

public abstract record DomainEvent : IDomainEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public DateTime OccurredOnUtc { get; init; } = DateTime.UtcNow;
}
