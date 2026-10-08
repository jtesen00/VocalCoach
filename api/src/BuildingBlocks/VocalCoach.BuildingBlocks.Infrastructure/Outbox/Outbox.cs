using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.BuildingBlocks.Infrastructure.Database;

namespace VocalCoach.BuildingBlocks.Infrastructure.Outbox;

/// <summary>Integration event pendiente de entregar, guardado en el esquema del módulo que lo publica.</summary>
public sealed class OutboxMessage
{
    public Guid Id { get; init; }

    public required string Type { get; init; }

    public required string Content { get; init; }

    public DateTime OccurredOnUtc { get; init; }

    public DateTime? ProcessedOnUtc { get; set; }

    public int Attempts { get; set; }

    public string? Error { get; set; }
}

internal sealed class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> builder)
    {
        builder.ToTable("outbox_messages");
        builder.HasKey(m => m.Id);
        builder.Property(m => m.Type).HasMaxLength(500);
        builder.Property(m => m.Content).HasColumnType("jsonb");
        builder.HasIndex(m => m.OccurredOnUtc).HasFilter("processed_on_utc IS NULL");
    }
}

/// <summary>Outbox de un módulo: añade el mensaje al mismo DbContext, así viaja en la misma transacción.</summary>
public sealed class ModuleOutbox(ModuleDbContext context) : IOutbox
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public void Add(IIntegrationEvent integrationEvent) =>
        context.OutboxMessages.Add(new OutboxMessage
        {
            Id = integrationEvent.Id,
            Type = integrationEvent.GetType().AssemblyQualifiedName!,
            Content = JsonSerializer.Serialize(integrationEvent, integrationEvent.GetType(), Json),
            OccurredOnUtc = integrationEvent.OccurredOnUtc,
        });
}
