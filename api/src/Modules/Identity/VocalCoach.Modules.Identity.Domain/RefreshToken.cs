using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Domain;

/// <summary>
/// Sesión renovable. Solo se guarda el hash del token. Cada uso lo rota (se revoca y se
/// emite otro); si se reutiliza uno ya revocado, se cierran todas las sesiones del usuario.
/// </summary>
public sealed class RefreshToken : AggregateRoot<Guid>
{
    private RefreshToken()
    {
    }

    public Guid UserId { get; private init; }

    public string TokenHash { get; private init; } = string.Empty;

    public DateTime CreatedAtUtc { get; private init; }

    public DateTime ExpiresAtUtc { get; private init; }

    public DateTime? RevokedAtUtc { get; private set; }

    public Guid? ReplacedById { get; private set; }

    public static RefreshToken Issue(Guid userId, string tokenHash, DateTime nowUtc, TimeSpan lifetime) =>
        new() { Id = Guid.CreateVersion7(), UserId = userId, TokenHash = tokenHash, CreatedAtUtc = nowUtc, ExpiresAtUtc = nowUtc + lifetime };

    public bool IsActive(DateTime nowUtc) => RevokedAtUtc is null && nowUtc < ExpiresAtUtc;

    public void Revoke(DateTime nowUtc, Guid? replacedBy = null)
    {
        RevokedAtUtc ??= nowUtc;
        ReplacedById ??= replacedBy;
    }
}
