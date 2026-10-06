using System.Data.Common;

namespace VocalCoach.BuildingBlocks.Application.Abstractions;

/// <summary>Conexiones para las consultas con Dapper (lado de lectura).</summary>
public interface IDbConnectionFactory
{
    ValueTask<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}

/// <summary>Usuario autenticado de la petición actual.</summary>
public interface IUserContext
{
    Guid UserId { get; }
}

/// <summary>Unidad de trabajo de un módulo: guarda los cambios y despacha sus domain events.</summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
