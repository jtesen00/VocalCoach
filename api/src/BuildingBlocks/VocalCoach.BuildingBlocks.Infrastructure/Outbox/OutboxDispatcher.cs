using System.Text.Json;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using VocalCoach.BuildingBlocks.Application.Events;

namespace VocalCoach.BuildingBlocks.Infrastructure.Outbox;

public sealed class OutboxOptions
{
    public TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(2);

    public int BatchSize { get; set; } = 50;

    public int MaxAttempts { get; set; } = 5;

    /// <summary>false en los tests de integración, que vacían la outbox a demanda.</summary>
    public bool RunInBackground { get; set; } = true;
}

/// <summary>Entrega los integration events pendientes de la outbox de un esquema a sus handlers (en cualquier módulo).</summary>
public interface IOutboxDispatcher
{
    string Schema { get; }

    /// <summary>Procesa un lote. Devuelve cuántos mensajes se entregaron.</summary>
    Task<int> DispatchAsync(CancellationToken cancellationToken = default);
}

public sealed class OutboxDispatcher(
    string schema,
    NpgsqlDataSource dataSource,
    IServiceScopeFactory scopes,
    IOptions<OutboxOptions> options,
    ILogger<OutboxDispatcher> logger) : IOutboxDispatcher
{
    private sealed record Row(Guid Id, string Type, string Content, int Attempts);

    public string Schema => schema;

    public async Task<int> DispatchAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        // SKIP LOCKED: varias instancias de la API pueden procesar la misma outbox sin pisarse.
        var rows = (await connection.QueryAsync<Row>(
            $"""
            SELECT id, type, content, attempts FROM {schema}.outbox_messages
            WHERE processed_on_utc IS NULL
            ORDER BY occurred_on_utc
            LIMIT @Batch
            FOR UPDATE SKIP LOCKED
            """,
            new { Batch = options.Value.BatchSize },
            transaction)).ToList();

        foreach (var row in rows)
        {
            string? error = null;
            try
            {
                await PublishAsync(row, cancellationToken);
            }
            catch (Exception ex)
            {
                error = ex.ToString();
                logger.LogError(ex, "Error entregando el mensaje {Id} de {Schema}.outbox_messages", row.Id, schema);
            }

            var done = error is null || row.Attempts + 1 >= options.Value.MaxAttempts;
            await connection.ExecuteAsync(
                $"UPDATE {schema}.outbox_messages SET attempts = attempts + 1, error = @Error, processed_on_utc = @Processed WHERE id = @Id",
                new { row.Id, Error = error, Processed = done ? DateTime.UtcNow : (DateTime?)null },
                transaction);
        }

        await transaction.CommitAsync(cancellationToken);
        return rows.Count;
    }

    private async Task PublishAsync(Row row, CancellationToken cancellationToken)
    {
        var type = System.Type.GetType(row.Type) ?? throw new InvalidOperationException($"Tipo desconocido: {row.Type}");
        var integrationEvent = JsonSerializer.Deserialize(row.Content, type, ModuleOutbox.Json)!;
        var handlerType = typeof(IIntegrationEventHandler<>).MakeGenericType(type);
        await using var scope = scopes.CreateAsyncScope();
        foreach (var handler in scope.ServiceProvider.GetServices(handlerType))
        {
            await (Task)handlerType.GetMethod("Handle")!.Invoke(handler, [integrationEvent, cancellationToken])!;
        }
    }
}

/// <summary>Bucle en segundo plano que vacía todas las outbox.</summary>
public sealed class OutboxBackgroundService(IEnumerable<IOutboxDispatcher> dispatchers, IOptions<OutboxOptions> options, ILogger<OutboxBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.RunInBackground)
        {
            return;
        }

        using var timer = new PeriodicTimer(options.Value.Interval);
        do
        {
            foreach (var dispatcher in dispatchers)
            {
                try
                {
                    while (await dispatcher.DispatchAsync(stoppingToken) > 0)
                    {
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Error procesando la outbox de {Schema}", dispatcher.Schema);
                }
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
