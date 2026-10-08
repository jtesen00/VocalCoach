using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Practice.Domain;

public enum AttemptKind
{
    Exercise,
    Phrase,
}

/// <summary>
/// Un intento cantado (ejercicio o frase de canción). Inmutable y con id generado en el
/// cliente: sincronizar el mismo intento dos veces no lo duplica (ADR-005). Solo agregados:
/// nunca audio ni frames de pitch.
/// </summary>
public sealed class Attempt : AggregateRoot<Guid>
{
    public const int MaxItemIdLength = 200;
    public const int MaxDetailsLength = 32_000;

    private Attempt()
    {
    }

    public Guid UserId { get; private init; }

    public AttemptKind Kind { get; private init; }

    /// <summary>Id del ejercicio, o "canción/frase".</summary>
    public string ItemId { get; private init; } = string.Empty;

    public DateTime PerformedAtUtc { get; private init; }

    /// <summary>Día local del usuario (para la racha), tal como lo vio el cliente.</summary>
    public DateOnly LocalDay { get; private init; }

    /// <summary>0..100</summary>
    public int Score { get; private init; }

    /// <summary>0..1, o null (sirenas).</summary>
    public double? Accuracy { get; private init; }

    public bool Passed { get; private init; }

    public double DurationSeconds { get; private init; }

    /// <summary>Evaluación por nota en JSON (opaca para el servidor), opcional.</summary>
    public string? Details { get; private init; }

    public DateTime ReceivedAtUtc { get; private init; }

    public static Result<Attempt> Record(
        Guid id,
        Guid userId,
        AttemptKind kind,
        string itemId,
        DateTime performedAtUtc,
        DateOnly localDay,
        int score,
        double? accuracy,
        bool passed,
        double durationSeconds,
        string? details,
        DateTime nowUtc)
    {
        if (id == Guid.Empty)
        {
            return AttemptErrors.MissingId;
        }

        if (string.IsNullOrWhiteSpace(itemId) || itemId.Length > MaxItemIdLength)
        {
            return AttemptErrors.InvalidItem;
        }

        if (score is < 0 or > 100 || accuracy is < 0 or > 1 || durationSeconds is < 0 or > 3600)
        {
            return AttemptErrors.OutOfRange;
        }

        // Margen de un día por zonas horarias; nada del futuro.
        if (performedAtUtc > nowUtc.AddMinutes(5) || Math.Abs(localDay.DayNumber - DateOnly.FromDateTime(performedAtUtc).DayNumber) > 1)
        {
            return AttemptErrors.InvalidDate;
        }

        if (details is { Length: > MaxDetailsLength })
        {
            return AttemptErrors.DetailsTooLarge;
        }

        var attempt = new Attempt
        {
            Id = id,
            UserId = userId,
            Kind = kind,
            ItemId = itemId.Trim(),
            PerformedAtUtc = performedAtUtc,
            LocalDay = localDay,
            Score = score,
            Accuracy = accuracy,
            Passed = passed,
            DurationSeconds = durationSeconds,
            Details = details,
            ReceivedAtUtc = nowUtc,
        };
        attempt.Raise(new AttemptRecordedDomainEvent(attempt.Id, userId, kind, attempt.ItemId, localDay, score, passed, durationSeconds, performedAtUtc));
        return attempt;
    }
}

public sealed record AttemptRecordedDomainEvent(
    Guid AttemptId,
    Guid UserId,
    AttemptKind Kind,
    string ItemId,
    DateOnly LocalDay,
    int Score,
    bool Passed,
    double DurationSeconds,
    DateTime PerformedAtUtc) : DomainEvent;

public static class AttemptErrors
{
    public static readonly Error MissingId = Error.Validation("attempt.missing_id", "El intento no tiene id.");
    public static readonly Error InvalidItem = Error.Validation("attempt.invalid_item", "El ejercicio o frase no es válido.");
    public static readonly Error OutOfRange = Error.Validation("attempt.out_of_range", "Puntuación, precisión o duración fuera de rango.");
    public static readonly Error InvalidDate = Error.Validation("attempt.invalid_date", "La fecha del intento no es válida.");
    public static readonly Error DetailsTooLarge = Error.Validation("attempt.details_too_large", "El detalle del intento es demasiado grande.");
}
