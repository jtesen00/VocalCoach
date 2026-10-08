using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Domain;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Application.Features.Refresh;

public sealed record RefreshCommand(string RefreshToken) : ICommand<AuthResponse>;

internal sealed class RefreshHandler(
    IRefreshTokenRepository refreshTokens,
    IUserRepository users,
    ITokenIssuer tokens,
    SessionIssuer sessions,
    [FromKeyedServices(IdentityModule.Schema)] IUnitOfWork unitOfWork,
    TimeProvider time) : ICommandHandler<RefreshCommand, AuthResponse>
{
    public async Task<Result<AuthResponse>> Handle(RefreshCommand command, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var stored = string.IsNullOrEmpty(command.RefreshToken) ? null : await refreshTokens.GetByHashAsync(tokens.HashRefreshToken(command.RefreshToken), cancellationToken);
        if (stored is null)
        {
            return UserErrors.InvalidRefreshToken;
        }

        if (!stored.IsActive(now))
        {
            // Reutilizar un token ya rotado indica robo: se cierran todas las sesiones.
            if (stored.ReplacedById is not null)
            {
                foreach (var token in await refreshTokens.GetActiveByUserAsync(stored.UserId, cancellationToken))
                {
                    token.Revoke(now);
                }

                await unitOfWork.SaveChangesAsync(cancellationToken);
            }

            return UserErrors.InvalidRefreshToken;
        }

        var user = await users.GetByIdAsync(stored.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.InvalidRefreshToken;
        }

        return await sessions.IssueAsync(user, stored, cancellationToken);
    }
}
