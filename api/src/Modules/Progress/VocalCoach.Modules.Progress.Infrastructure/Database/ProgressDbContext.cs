using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Progress.Application;
using VocalCoach.Modules.Progress.Application.Abstractions;
using VocalCoach.Modules.Progress.Domain;

namespace VocalCoach.Modules.Progress.Infrastructure.Database;

public sealed class ProgressDbContext(DbContextOptions<ProgressDbContext> options, IServiceProvider services) : ModuleDbContext(options, services)
{
    public override string Schema => ProgressModule.Schema;

    public DbSet<LearnerProgress> Learners => Set<LearnerProgress>();

    public DbSet<ProcessedAttempt> ProcessedAttempts => Set<ProcessedAttempt>();
}

/// <summary>Intentos ya contabilizados (idempotencia del consumidor).</summary>
public sealed class ProcessedAttempt
{
    public Guid AttemptId { get; init; }

    public DateTime ProcessedAtUtc { get; init; }
}

internal sealed class LearnerProgressConfiguration : IEntityTypeConfiguration<LearnerProgress>
{
    public void Configure(EntityTypeBuilder<LearnerProgress> builder)
    {
        builder.ToTable("learner_progress");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
        builder.HasMany(p => p.Items).WithOne().HasForeignKey(i => i.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(p => p.Days).WithOne().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(p => p.Items).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Navigation(p => p.Days).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ItemBestConfiguration : IEntityTypeConfiguration<ItemBest>
{
    public void Configure(EntityTypeBuilder<ItemBest> builder)
    {
        builder.ToTable("item_bests");
        builder.HasKey(i => new { i.UserId, i.ItemId });
        builder.Property(i => i.ItemId).HasMaxLength(200);
        builder.Property(i => i.Kind).HasMaxLength(20);
    }
}

internal sealed class PracticeDayConfiguration : IEntityTypeConfiguration<PracticeDay>
{
    public void Configure(EntityTypeBuilder<PracticeDay> builder)
    {
        builder.ToTable("practice_days");
        builder.HasKey(d => new { d.UserId, d.Day });
    }
}

internal sealed class ProcessedAttemptConfiguration : IEntityTypeConfiguration<ProcessedAttempt>
{
    public void Configure(EntityTypeBuilder<ProcessedAttempt> builder)
    {
        builder.ToTable("processed_attempts");
        builder.HasKey(p => p.AttemptId);
    }
}

internal sealed class LearnerProgressRepository(ProgressDbContext context, TimeProvider time) : ILearnerProgressRepository
{
    public Task<LearnerProgress?> GetAsync(Guid userId, CancellationToken cancellationToken) =>
        context.Learners.Include(p => p.Items).Include(p => p.Days).AsSplitQuery().SingleOrDefaultAsync(p => p.Id == userId, cancellationToken);

    public void Add(LearnerProgress progress) => context.Learners.Add(progress);

    public async Task<bool> TryMarkProcessedAsync(Guid attemptId, CancellationToken cancellationToken)
    {
        if (await context.ProcessedAttempts.AnyAsync(p => p.AttemptId == attemptId, cancellationToken))
        {
            return false;
        }

        // Se guarda junto con el progreso (misma transacción): si algo falla, se reintenta entero.
        context.ProcessedAttempts.Add(new ProcessedAttempt { AttemptId = attemptId, ProcessedAtUtc = time.GetUtcNow().UtcDateTime });
        return true;
    }
}
