using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.BuildingBlocks.Infrastructure.Outbox;
using VocalCoach.SharedKernel;

namespace VocalCoach.BuildingBlocks.Infrastructure.Database;

/// <summary>
/// DbContext de un módulo: su propio esquema de PostgreSQL y su outbox. Al guardar, despacha
/// los domain events de los agregados (sus handlers pueden cambiar más datos o escribir
/// integration events en la outbox) y guarda todo en una sola transacción.
/// </summary>
public abstract class ModuleDbContext(DbContextOptions options, IServiceProvider services) : DbContext(options), IUnitOfWork
{
    public abstract string Schema { get; }

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfiguration(new OutboxMessageConfiguration());
        modelBuilder.ApplyConfigurationsFromAssembly(GetType().Assembly, t => t.Namespace?.StartsWith(GetType().Namespace!, StringComparison.Ordinal) == true);
    }

    async Task IUnitOfWork.SaveChangesAsync(CancellationToken cancellationToken) => await SaveChangesAsync(cancellationToken);

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Un handler puede provocar nuevos domain events: se repite hasta que no quede ninguno.
        for (var round = 0; round < 10; round++)
        {
            var events = ChangeTracker.Entries<IHasDomainEvents>()
                .SelectMany(e =>
                {
                    var list = e.Entity.DomainEvents.ToList();
                    e.Entity.ClearDomainEvents();
                    return list;
                })
                .ToList();
            if (events.Count == 0)
            {
                break;
            }

            foreach (var domainEvent in events)
            {
                await DispatchAsync(domainEvent, cancellationToken);
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }

    private async Task DispatchAsync(IDomainEvent domainEvent, CancellationToken cancellationToken)
    {
        var handlerType = typeof(IDomainEventHandler<>).MakeGenericType(domainEvent.GetType());
        foreach (var handler in services.GetServices(handlerType))
        {
            await (Task)handlerType.GetMethod(nameof(IDomainEventHandler<IDomainEvent>.Handle))!.Invoke(handler, [domainEvent, cancellationToken])!;
        }
    }
}
