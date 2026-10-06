using VocalCoach.Modules.Identity.Domain;
using VocalCoach.Modules.Practice.Domain;
using VocalCoach.Modules.Progress.Domain;

namespace VocalCoach.UnitTests;

public sealed class AttemptTests
{
    private static readonly DateTime Now = new(2026, 10, 6, 12, 0, 0, DateTimeKind.Utc);

    private static VocalCoach.SharedKernel.Result<Attempt> Record(int score = 85, double? accuracy = 0.9, DateTime? at = null, DateOnly? day = null, string item = "sustained-3s", string? details = null) =>
        Attempt.Record(Guid.NewGuid(), Guid.NewGuid(), AttemptKind.Exercise, item, at ?? Now.AddMinutes(-1), day ?? new DateOnly(2026, 10, 6), score, accuracy, score >= 80, 3, details, Now);

    [Fact]
    public void Un_intento_valido_lanza_el_domain_event()
    {
        var result = Record();
        Assert.True(result.IsSuccess);
        var e = Assert.IsType<AttemptRecordedDomainEvent>(Assert.Single(result.Value.DomainEvents));
        Assert.Equal("sustained-3s", e.ItemId);
        Assert.True(e.Passed);
    }

    [Theory]
    [InlineData(101, 0.5)]
    [InlineData(-1, 0.5)]
    [InlineData(50, 1.5)]
    public void Fuera_de_rango_se_rechaza(int score, double accuracy) =>
        Assert.Equal(AttemptErrors.OutOfRange, Record(score, accuracy).Error);

    [Fact]
    public void Un_intento_del_futuro_o_con_dia_incoherente_se_rechaza()
    {
        Assert.Equal(AttemptErrors.InvalidDate, Record(at: Now.AddHours(1)).Error);
        Assert.Equal(AttemptErrors.InvalidDate, Record(day: new DateOnly(2026, 10, 1)).Error);
    }

    [Fact]
    public void El_dia_local_puede_diferir_un_dia_por_la_zona_horaria() =>
        Assert.True(Record(at: new DateTime(2026, 10, 6, 1, 0, 0, DateTimeKind.Utc), day: new DateOnly(2026, 10, 5)).IsSuccess);

    [Fact]
    public void Item_y_detalle_con_limites() =>
        Assert.Multiple(
            () => Assert.Equal(AttemptErrors.InvalidItem, Record(item: " ").Error),
            () => Assert.Equal(AttemptErrors.DetailsTooLarge, Record(details: new string('x', Attempt.MaxDetailsLength + 1)).Error));
}

public sealed class UserTests
{
    [Fact]
    public void El_email_se_normaliza_y_se_valida()
    {
        var user = User.Register("  Ana@Ejemplo.COM ", "Ana", "hash", DateTime.UtcNow);
        Assert.Equal("ana@ejemplo.com", user.Value.Email);
        Assert.Equal(UserErrors.InvalidEmail, User.Register("no-es-un-email", "Ana", "hash", DateTime.UtcNow).Error);
        Assert.Equal(UserErrors.InvalidDisplayName, User.Register("a@b.com", "   ", "hash", DateTime.UtcNow).Error);
    }

    [Fact]
    public void Un_refresh_token_caduca_y_se_revoca_una_sola_vez()
    {
        var now = DateTime.UtcNow;
        var token = RefreshToken.Issue(Guid.NewGuid(), "h", now, TimeSpan.FromDays(1));
        Assert.True(token.IsActive(now));
        Assert.False(token.IsActive(now.AddDays(2)));
        var next = Guid.NewGuid();
        token.Revoke(now, next);
        token.Revoke(now.AddMinutes(1), Guid.NewGuid());
        Assert.False(token.IsActive(now));
        Assert.Equal(next, token.ReplacedById);
    }
}

public sealed class ProgressTests
{
    private static readonly DateOnly Today = new(2026, 10, 6);

    [Fact]
    public void Racha_actual_y_mejor()
    {
        DateOnly[] days = [new(2026, 9, 1), new(2026, 9, 2), new(2026, 9, 3), new(2026, 10, 5), Today];
        Assert.Equal((2, 3, true), Streak.Compute(days, Today));
        Assert.Equal((1, 3, false), Streak.Compute(days[..4], Today)); // sigue viva desde ayer
        Assert.Equal(0, Streak.Compute([new(2026, 10, 1)], Today).Current);
    }

    [Fact]
    public void Registra_totales_dias_y_mejor_resultado()
    {
        var p = LearnerProgress.Start(Guid.NewGuid());
        var t = new DateTime(2026, 10, 6, 10, 0, 0, DateTimeKind.Utc);
        p.Record("exercise", "sustained-3s", Today, 60, false, 3, t);
        p.Record("exercise", "sustained-3s", Today, 90, true, 3, t.AddMinutes(1));
        p.Record("exercise", "sustained-3s", Today, 70, false, 3, t.AddMinutes(-5)); // llega tarde (otro dispositivo)

        Assert.Equal((3, 1, 9d), (p.Attempts, p.Passed, p.TotalSeconds));
        Assert.Single(p.Days);
        var item = Assert.Single(p.Items);
        Assert.Equal((3, 90, true, 90), (item.Attempts, item.BestScore, item.PassedEver, item.LastScore));
        Assert.Single(p.DomainEvents.OfType<ItemPassedFirstTimeDomainEvent>());
    }
}
