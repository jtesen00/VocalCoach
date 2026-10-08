using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;
using VocalCoach.BuildingBlocks.Infrastructure.Outbox;

namespace VocalCoach.IntegrationTests;

/// <summary>
/// La API completa contra un PostgreSQL real. Por defecto con Testcontainers; si existe
/// VOCALCOACH_TEST_PG (cadena de conexión a un servidor), se crea allí una base temporal.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private PostgreSqlContainer? _container;
    private string? _tempDatabase;
    private string _serverConnection = string.Empty;
    private string _connectionString = string.Empty;

    public async ValueTask InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("VOCALCOACH_TEST_PG");
        if (external is null)
        {
            _container = new PostgreSqlBuilder("postgres:16-alpine").Build();
            await _container.StartAsync();
            _connectionString = _container.GetConnectionString();
            return;
        }

        _serverConnection = external;
        _tempDatabase = $"vocalcoach_test_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(external);
        await connection.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE {_tempDatabase}", connection))
        {
            await create.ExecuteNonQueryAsync();
        }

        _connectionString = new NpgsqlConnectionStringBuilder(external) { Database = _tempDatabase }.ConnectionString;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Database", _connectionString);
        builder.UseSetting("Jwt:SigningKey", "clave-de-pruebas-de-integracion-0123456789-abcdef");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Outbox:RunInBackground", "false");
        builder.UseSetting("RateLimits:AuthPerMinute", "1000");
        builder.UseSetting("RateLimits:AiPerMinute", "1000");
    }

    /// <summary>Entrega todos los integration events pendientes (en los tests no corre el bucle de fondo).</summary>
    public async Task DrainOutboxAsync()
    {
        var dispatchers = Services.GetServices<IOutboxDispatcher>().ToList();
        bool any;
        do
        {
            any = false;
            foreach (var d in dispatchers)
            {
                any |= await d.DispatchAsync() > 0;
            }
        }
        while (any);
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }

        if (_tempDatabase is not null)
        {
            NpgsqlConnection.ClearAllPools();
            await using var connection = new NpgsqlConnection(_serverConnection);
            await connection.OpenAsync();
            await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS {_tempDatabase} WITH (FORCE)", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
