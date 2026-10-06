using VocalCoach.Modules.Identity.Domain;

namespace VocalCoach.Modules.Identity.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(string password);

    bool Verify(string hash, string password);
}

public sealed record AccessToken(string Token, DateTime ExpiresAtUtc);

public interface ITokenIssuer
{
    AccessToken CreateAccessToken(User user);

    /// <summary>Token de refresco aleatorio y su hash (solo el hash se guarda).</summary>
    (string Token, string Hash) CreateRefreshToken();

    string HashRefreshToken(string token);

    TimeSpan RefreshTokenLifetime { get; }
}

public interface IUserRepository
{
    Task<bool> EmailExistsAsync(string normalizedEmail, CancellationToken cancellationToken);

    Task<User?> GetByEmailAsync(string normalizedEmail, CancellationToken cancellationToken);

    Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    void Add(User user);
}

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByHashAsync(string hash, CancellationToken cancellationToken);

    Task<List<RefreshToken>> GetActiveByUserAsync(Guid userId, CancellationToken cancellationToken);

    void Add(RefreshToken token);
}
