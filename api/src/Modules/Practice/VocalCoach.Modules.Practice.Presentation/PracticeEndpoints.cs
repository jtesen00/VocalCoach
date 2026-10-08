using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Practice.Application.Features.GetAttempts;
using VocalCoach.Modules.Practice.Application.Features.SyncAttempts;
using VocalCoach.BuildingBlocks.Presentation;

namespace VocalCoach.Modules.Practice.Presentation;

public static class PracticeEndpoints
{
    public sealed record SyncRequest(IReadOnlyList<AttemptDto> Attempts);

    public static IEndpointRouteBuilder MapPracticeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/practice").WithTags("Practice").RequireAuthorization();

        group.MapPost("/attempts/sync", async (SyncRequest request, IUserContext user, ICommandHandler<SyncAttemptsCommand, SyncAttemptsResponse> handler, CancellationToken ct) =>
            (await handler.Handle(new SyncAttemptsCommand(user.UserId, request.Attempts ?? []), ct)).ToHttp())
            .WithName("SyncAttempts");

        group.MapGet("/attempts", async (DateTime? since, int? limit, IUserContext user, IQueryHandler<GetAttemptsQuery, AttemptsPage> handler, CancellationToken ct) =>
            (await handler.Handle(new GetAttemptsQuery(user.UserId, since?.ToUniversalTime(), limit ?? 500), ct)).ToHttp())
            .WithName("GetAttempts");

        return app;
    }
}
