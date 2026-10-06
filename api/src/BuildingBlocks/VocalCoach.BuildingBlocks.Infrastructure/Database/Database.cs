using System.Data.Common;
using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.BuildingBlocks.Infrastructure.Outbox;

namespace VocalCoach.BuildingBlocks.Infrastructure.Database;

internal sealed class DbConnectionFactory(NpgsqlDataSource dataSource) : IDbConnectionFactory
{
    public async ValueTask<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default) =>
        await dataSource.OpenConnectionAsync(cancellationToken);
}

internal sealed class HttpUserContext(IHttpContextAccessor accessor) : IUserContext
{
    public Guid UserId =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? accessor.HttpContext?.User.FindFirstValue("sub"), out var id)
            ? id
            : throw new InvalidOperationException("No hay usuario autenticado.");
}

internal sealed class DateOnlyHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override DateOnly Parse(object value) => value switch
    {
        DateOnly d => d,
        DateTime dt => DateOnly.FromDateTime(dt),
        _ => DateOnly.Parse((string)value, System.Globalization.CultureInfo.InvariantCulture),
    };

    public override void SetValue(System.Data.IDbDataParameter parameter, DateOnly value) => parameter.Value = value;
}

public static class DatabaseExtensions
{
    public const string ConnectionStringName = "Database";

    /// <summary>Servicios comunes: fuente de datos de PostgreSQL, Dapper, usuario actual y bucle de la outbox.</summary>
    public static IServiceCollection AddBuildingBlocksInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName)
            ?? throw new InvalidOperationException($"Falta la cadena de conexión '{ConnectionStringName}'.");
        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        // Dapper: columnas snake_case ↔ propiedades PascalCase; `date` de PostgreSQL ↔ DateOnly.
        DefaultTypeMap.MatchNamesWithUnderscores = true;
        SqlMapper.AddTypeHandler(new DateOnlyHandler());
        services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
        services.AddHttpContextAccessor();
        services.AddScoped<IUserContext, HttpUserContext>();
        services.AddOptions<OutboxOptions>().Bind(configuration.GetSection("Outbox"));
        services.AddHostedService<OutboxBackgroundService>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }

    /// <summary>
    /// DbContext de un módulo (esquema propio, nombres en snake_case, historial de migraciones
    /// en su esquema), su unidad de trabajo, su outbox (servicio con clave = esquema) y su dispatcher.
    /// </summary>
    public static IServiceCollection AddModuleDbContext<TContext>(this IServiceCollection services, string schema)
        where TContext : ModuleDbContext
    {
        services.AddDbContext<TContext>((sp, options) => options
            .UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(), npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", schema))
            .UseSnakeCaseNamingConvention());
        services.AddKeyedScoped<IUnitOfWork>(schema, (sp, _) => sp.GetRequiredService<TContext>());
        services.AddKeyedScoped<IOutbox>(schema, (sp, _) => new ModuleOutbox(sp.GetRequiredService<TContext>()));
        services.AddSingleton<IOutboxDispatcher>(sp => new OutboxDispatcher(
            schema,
            sp.GetRequiredService<NpgsqlDataSource>(),
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<IOptions<OutboxOptions>>(),
            sp.GetRequiredService<ILogger<OutboxDispatcher>>()));
        return services;
    }
}
