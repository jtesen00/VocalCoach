using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Domain;

namespace VocalCoach.Modules.Identity.Application.Features;

public sealed record UserView(Guid Id, string Email, string DisplayName);

public sealed record AuthResponse(string AccessToken, DateTime AccessTokenExpiresAtUtc, string RefreshToken, UserView User);

/// <summary>Emite el par de tokens de una sesión nueva.</summary>
internal sealed class SessionIssuer(ITokenIssuer tokens, IRefreshTokenRepository refreshTokens, [FromKeyedServices(IdentityModule.Schema)] IUnitOfWork unitOfWork, TimeProvider time)
{
    public async Task<AuthResponse> IssueAsync(User user, RefreshToken? replacing, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var access = tokens.CreateAccessToken(user);
        var (refresh, hash) = tokens.CreateRefreshToken();
        var entity = RefreshToken.Issue(user.Id, hash, now, tokens.RefreshTokenLifetime);
        refreshTokens.Add(entity);
        replacing?.Revoke(now, entity.Id);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new AuthResponse(access.Token, access.ExpiresAtUtc, refresh, new UserView(user.Id, user.Email, user.DisplayName));
    }
}
