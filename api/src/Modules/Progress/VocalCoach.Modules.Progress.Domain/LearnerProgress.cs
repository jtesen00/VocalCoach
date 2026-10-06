using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Progress.Domain;

/// <summary>
/// Progreso de un usuario: totales, días practicados (para la racha) y mejor resultado por
/// ejercicio o frase. Se alimenta de los intentos que publica el módulo Practice.
/// </summary>
public sealed class LearnerProgress : AggregateRoot<Guid>
{
    private readonly List<ItemBest> _items = [];
    private readonly List<PracticeDay> _days = [];

    private LearnerProgress()
    {
    }

    public int Attempts { get; private set; }

    public int Passed { get; private set; }

    public double TotalSeconds { get; private set; }

    public IReadOnlyCollection<ItemBest> Items => _items;

    public IReadOnlyCollection<PracticeDay> Days => _days;

    public static LearnerProgress Start(Guid userId) => new() { Id = userId };

    public void Record(string kind, string itemId, DateOnly day, int score, bool passed, double durationSeconds, DateTime performedAtUtc)
    {
        Attempts++;
        TotalSeconds += durationSeconds;
        if (passed)
        {
            Passed++;
        }

        if (_days.All(d => d.Day != day))
        {
            _days.Add(new PracticeDay(Id, day));
        }

        var item = _items.Find(i => i.ItemId == itemId);
        if (item is null)
        {
            item = new ItemBest(Id, itemId, kind);
            _items.Add(item);
        }

        var firstPass = item.Register(score, passed, performedAtUtc);
        if (firstPass)
        {
            Raise(new ItemPassedFirstTimeDomainEvent(Id, itemId));
        }
    }
}

/// <summary>Mejor resultado y último intento de un ejercicio o frase.</summary>
public sealed class ItemBest
{
    private ItemBest()
    {
    }

    internal ItemBest(Guid userId, string itemId, string kind)
    {
        UserId = userId;
        ItemId = itemId;
        Kind = kind;
    }

    public Guid UserId { get; private init; }

    public string ItemId { get; private init; } = string.Empty;

    public string Kind { get; private init; } = string.Empty;

    public int Attempts { get; private set; }

    public int BestScore { get; private set; }

    public bool PassedEver { get; private set; }

    public int LastScore { get; private set; }

    public DateTime LastAtUtc { get; private set; }

    /// <summary>Registra un intento; true si es la primera vez que se supera.</summary>
    internal bool Register(int score, bool passed, DateTime atUtc)
    {
        var firstPass = passed && !PassedEver;
        Attempts++;
        BestScore = Math.Max(BestScore, score);
        PassedEver |= passed;
        // Los intentos pueden llegar desordenados (varios dispositivos): "último" es el más reciente.
        if (atUtc >= LastAtUtc)
        {
            LastScore = score;
            LastAtUtc = atUtc;
        }

        return firstPass;
    }
}

public sealed record PracticeDay(Guid UserId, DateOnly Day);

/// <summary>Un ejercicio o frase superado por primera vez (desbloquea pasos del camino).</summary>
public sealed record ItemPassedFirstTimeDomainEvent(Guid UserId, string ItemId) : DomainEvent;

/// <summary>Racha de días seguidos (misma regla que la app: si hoy aún no practicó, cuenta desde ayer).</summary>
public static class Streak
{
    public static (int Current, int Best, bool PracticedToday) Compute(IEnumerable<DateOnly> days, DateOnly today)
    {
        var set = days.ToHashSet();
        var practicedToday = set.Contains(today);
        var current = 0;
        for (var d = practicedToday ? today : today.AddDays(-1); set.Contains(d); d = d.AddDays(-1))
        {
            current++;
        }

        var best = 0;
        foreach (var start in set.Where(d => !set.Contains(d.AddDays(-1))))
        {
            var n = 0;
            for (var d = start; set.Contains(d); d = d.AddDays(1))
            {
                n++;
            }

            best = Math.Max(best, n);
        }

        return (current, best, practicedToday);
    }
}
