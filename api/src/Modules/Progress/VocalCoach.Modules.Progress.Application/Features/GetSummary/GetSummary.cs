using Dapper;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Progress.Domain;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Progress.Application.Features.GetSummary;

/// <summary>Resumen del progreso. `Today` es el día local del cliente (la racha depende de su zona horaria).</summary>
public sealed record GetSummaryQuery(Guid UserId, DateOnly Today) : IQuery<ProgressSummary>;

public sealed record ProgressSummary(
    int Attempts,
    int Passed,
    double Minutes,
    int DaysPracticed,
    int CurrentStreak,
    int BestStreak,
    bool PracticedToday,
    IReadOnlyList<ItemBestView> Items);

public sealed record ItemBestView(string ItemId, string Kind, int Attempts, int BestScore, bool PassedEver, int LastScore, DateTime LastAtUtc);

internal sealed class GetSummaryHandler(IDbConnectionFactory db) : IQueryHandler<GetSummaryQuery, ProgressSummary>
{
    private sealed class Totals
    {
        public int Attempts { get; init; }

        public int Passed { get; init; }

        public double TotalSeconds { get; init; }
    }

    public async Task<Result<ProgressSummary>> Handle(GetSummaryQuery query, CancellationToken cancellationToken)
    {
        await using var connection = await db.OpenConnectionAsync(cancellationToken);
        using var grid = await connection.QueryMultipleAsync(new CommandDefinition(
            """
            SELECT attempts, passed, total_seconds FROM progress.learner_progress WHERE id = @UserId;
            SELECT day FROM progress.practice_days WHERE user_id = @UserId;
            SELECT item_id, kind, attempts, best_score, passed_ever, last_score, last_at_utc FROM progress.item_bests WHERE user_id = @UserId ORDER BY last_at_utc DESC;
            """,
            new { query.UserId },
            cancellationToken: cancellationToken));
        var totals = await grid.ReadSingleOrDefaultAsync<Totals>() ?? new Totals();
        var days = (await grid.ReadAsync<DateOnly>()).ToList();
        var items = (await grid.ReadAsync<ItemBestView>()).ToList();
        var (current, best, today) = Streak.Compute(days, query.Today);
        return new ProgressSummary(totals.Attempts, totals.Passed, totals.TotalSeconds / 60, days.Count, current, best, today, items);
    }
}
