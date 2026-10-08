using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Application.Features.Logout;

public sealed record LogoutCommand(string RefreshToken) : ICommand;

internal sealed class LogoutHandler(IRefreshTokenRepository refreshTokens, ITokenIssuer tokens, [FromKeyedServices(IdentityModule.Schema)] IUnitOfWork unitOfWork, TimeProvider time) : ICommandHandler<LogoutCommand>
{
    public async Task<Result> Handle(LogoutCommand command, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(command.RefreshToken) && await refreshTokens.GetByHashAsync(tokens.HashRefreshToken(command.RefreshToken), cancellationToken) is { } stored)
        {
            stored.Revoke(time.GetUtcNow().UtcDateTime);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result.Success();
    }
}
