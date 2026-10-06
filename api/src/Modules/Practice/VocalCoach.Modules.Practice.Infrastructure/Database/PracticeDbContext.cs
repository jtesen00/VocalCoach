using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Practice.Application;
using VocalCoach.Modules.Practice.Domain;

namespace VocalCoach.Modules.Practice.Infrastructure.Database;

public sealed class PracticeDbContext(DbContextOptions<PracticeDbContext> options, IServiceProvider services) : ModuleDbContext(options, services)
{
    public override string Schema => PracticeModule.Schema;

    public DbSet<Attempt> Attempts => Set<Attempt>();
}

internal sealed class AttemptConfiguration : IEntityTypeConfiguration<Attempt>
{
    public void Configure(EntityTypeBuilder<Attempt> builder)
    {
        builder.ToTable("attempts");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.Kind).HasConversion<string>().HasMaxLength(20);
        builder.Property(a => a.ItemId).HasMaxLength(Attempt.MaxItemIdLength);
        builder.Property(a => a.Details).HasColumnType("jsonb");
        builder.HasIndex(a => new { a.UserId, a.ReceivedAtUtc });
        builder.HasIndex(a => new { a.UserId, a.ItemId });
    }
}
