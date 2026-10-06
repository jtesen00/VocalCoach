using System.Net.Mail;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Domain;

/// <summary>Cuenta de usuario. El email se guarda normalizado (minúsculas, sin espacios).</summary>
public sealed class User : AggregateRoot<Guid>
{
    public const int MaxEmailLength = 254;
    public const int MaxDisplayNameLength = 50;

    private User()
    {
    }

    public string Email { get; private set; } = string.Empty;

    public string DisplayName { get; private set; } = string.Empty;

    public string PasswordHash { get; private set; } = string.Empty;

    public DateTime CreatedAtUtc { get; private init; }

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static bool IsValidEmail(string email) =>
        email.Length <= MaxEmailLength && MailAddress.TryCreate(email, out var parsed) && parsed.Address == email && email.Contains('.', StringComparison.Ordinal);

    public static Result<User> Register(string email, string displayName, string passwordHash, DateTime nowUtc)
    {
        var normalized = NormalizeEmail(email);
        if (!IsValidEmail(normalized))
        {
            return UserErrors.InvalidEmail;
        }

        var name = displayName.Trim();
        if (name.Length is 0 or > MaxDisplayNameLength)
        {
            return UserErrors.InvalidDisplayName;
        }

        var user = new User { Id = Guid.CreateVersion7(), Email = normalized, DisplayName = name, PasswordHash = passwordHash, CreatedAtUtc = nowUtc };
        user.Raise(new UserRegisteredDomainEvent(user.Id, normalized, name));
        return user;
    }
}

public sealed record UserRegisteredDomainEvent(Guid UserId, string Email, string DisplayName) : DomainEvent;

public static class UserErrors
{
    public static readonly Error InvalidEmail = Error.Validation("user.invalid_email", "El email no es válido.");
    public static readonly Error InvalidDisplayName = Error.Validation("user.invalid_name", $"El nombre debe tener entre 1 y {User.MaxDisplayNameLength} caracteres.");
    public static readonly Error EmailTaken = Error.Conflict("user.email_taken", "Ya existe una cuenta con ese email.");
    public static readonly Error InvalidCredentials = Error.Unauthorized("user.invalid_credentials", "Email o contraseña incorrectos.");
    public static readonly Error InvalidRefreshToken = Error.Unauthorized("user.invalid_refresh_token", "La sesión caducó. Vuelve a entrar.");
    public static readonly Error NotFound = Error.NotFound("user.not_found", "No existe el usuario.");
}
