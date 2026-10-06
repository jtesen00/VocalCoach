using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.BuildingBlocks.Presentation;
using VocalCoach.Modules.Coach.Application.Features.AskTeacher;

namespace VocalCoach.Modules.Coach.Presentation;

public static class CoachEndpoints
{
    /// <summary>Política de límite por usuario (definida en el host): protege el cupo gratuito del proveedor.</summary>
    public const string AiRateLimit = "ai";

    public static IEndpointRouteBuilder MapCoachEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/coach/teacher", async (AskTeacherCommand command, ICommandHandler<AskTeacherCommand, TeacherAnswer> handler, CancellationToken ct) =>
                (await handler.Handle(command, ct)).ToHttp())
            .WithTags("Coach")
            .RequireAuthorization()
            .RequireRateLimiting(AiRateLimit);
        return app;
    }
}
