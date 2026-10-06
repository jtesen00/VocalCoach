using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.BuildingBlocks.Presentation;
using VocalCoach.Modules.Progress.Application.Features.GetSummary;

namespace VocalCoach.Modules.Progress.Presentation;

public static class ProgressEndpoints
{
    public static IEndpointRouteBuilder MapProgressEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/progress/summary", async (DateOnly? today, IUserContext user, IQueryHandler<GetSummaryQuery, ProgressSummary> handler, TimeProvider time, CancellationToken ct) =>
                (await handler.Handle(new GetSummaryQuery(user.UserId, today ?? DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime)), ct)).ToHttp())
            .WithTags("Progress")
            .RequireAuthorization();
        return app;
    }
}
