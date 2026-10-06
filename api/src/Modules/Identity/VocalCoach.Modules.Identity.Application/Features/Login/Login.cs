using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Domain;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Application.Features.Login;

public sealed record LoginCommand(string Email, string Password) : ICommand<AuthResponse>;

internal sealed class LoginHandler(IUserRepository users, IPasswordHasher hasher, SessionIssuer sessions) : ICommandHandler<LoginCommand, AuthResponse>
{
    public async Task<Result<AuthResponse>> Handle(LoginCommand command, CancellationToken cancellationToken)
    {
        var user = await users.GetByEmailAsync(User.NormalizeEmail(command.Email ?? string.Empty), cancellationToken);
        // Mismo error si no existe o si la contraseña falla: no se revela qué emails tienen cuenta.
        if (user is null || !hasher.Verify(user.PasswordHash, command.Password ?? string.Empty))
        {
            return UserErrors.InvalidCredentials;
        }

        return await sessions.IssueAsync(user, null, cancellationToken);
    }
}
