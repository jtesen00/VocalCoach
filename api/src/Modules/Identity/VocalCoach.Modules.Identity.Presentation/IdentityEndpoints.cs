using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.BuildingBlocks.Presentation;
using VocalCoach.Modules.Identity.Application.Features;
using VocalCoach.Modules.Identity.Application.Features.GetMe;
using VocalCoach.Modules.Identity.Application.Features.Login;
using VocalCoach.Modules.Identity.Application.Features.Logout;
using VocalCoach.Modules.Identity.Application.Features.Refresh;
using VocalCoach.Modules.Identity.Application.Features.Register;

namespace VocalCoach.Modules.Identity.Presentation;

public static class IdentityEndpoints
{
    /// <summary>Política de límite de peticiones para registro y login (definida en el host).</summary>
    public const string AuthRateLimit = "auth";

    public sealed record RefreshRequest(string RefreshToken);

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/identity").WithTags("Identity");

        group.MapPost("/register", async (RegisterCommand command, ICommandHandler<RegisterCommand, AuthResponse> handler, CancellationToken ct) =>
            (await handler.Handle(command, ct)).ToHttp()).RequireRateLimiting(AuthRateLimit);

        group.MapPost("/login", async (LoginCommand command, ICommandHandler<LoginCommand, AuthResponse> handler, CancellationToken ct) =>
            (await handler.Handle(command, ct)).ToHttp()).RequireRateLimiting(AuthRateLimit);

        group.MapPost("/refresh", async (RefreshRequest request, ICommandHandler<RefreshCommand, AuthResponse> handler, CancellationToken ct) =>
            (await handler.Handle(new RefreshCommand(request.RefreshToken), ct)).ToHttp()).RequireRateLimiting(AuthRateLimit);

        group.MapPost("/logout", async (RefreshRequest request, ICommandHandler<LogoutCommand> handler, CancellationToken ct) =>
            (await handler.Handle(new LogoutCommand(request.RefreshToken), ct)).ToHttp());

        group.MapGet("/me", async (IUserContext user, IQueryHandler<GetMeQuery, UserView> handler, CancellationToken ct) =>
            (await handler.Handle(new GetMeQuery(user.UserId), ct)).ToHttp()).RequireAuthorization();

        return app;
    }
}
