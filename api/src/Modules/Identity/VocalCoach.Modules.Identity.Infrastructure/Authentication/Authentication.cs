using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Domain;

namespace VocalCoach.Modules.Identity.Infrastructure.Authentication;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "vocalcoach";

    public string Audience { get; set; } = "vocalcoach-web";

    /// <summary>Clave HMAC de al menos 32 bytes. En producción, por variable de entorno o secreto, nunca en el repositorio.</summary>
    public string SigningKey { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 60;

    public int RefreshTokenDays { get; set; } = 30;

    public SymmetricSecurityKey Key() => new(Encoding.UTF8.GetBytes(SigningKey));
}

internal sealed class JwtTokenIssuer(IOptions<JwtOptions> options, TimeProvider time) : ITokenIssuer
{
    public TimeSpan RefreshTokenLifetime => TimeSpan.FromDays(options.Value.RefreshTokenDays);

    public AccessToken CreateAccessToken(User user)
    {
        var o = options.Value;
        var now = time.GetUtcNow().UtcDateTime;
        var expires = now.AddMinutes(o.AccessTokenMinutes);
        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = o.Issuer,
            Audience = o.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            Subject = new ClaimsIdentity([new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Name, user.DisplayName)]),
            SigningCredentials = new SigningCredentials(o.Key(), SecurityAlgorithms.HmacSha256),
        });
        return new AccessToken(token, expires);
    }

    public (string Token, string Hash) CreateRefreshToken()
    {
        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (token, HashRefreshToken(token));
    }

    public string HashRefreshToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

/// <summary>Hash de contraseñas de ASP.NET Core Identity (PBKDF2 con sal, iteraciones actualizables).</summary>
internal sealed class AspNetPasswordHasher : Application.Abstractions.IPasswordHasher
{
    private static readonly PasswordHasher<object> Hasher = new();
    private static readonly object Subject = new();

    public string Hash(string password) => Hasher.HashPassword(Subject, password);

    public bool Verify(string hash, string password) => Hasher.VerifyHashedPassword(Subject, hash, password) != PasswordVerificationResult.Failed;
}
