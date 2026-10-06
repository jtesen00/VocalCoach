using System.Security.Claims;
using System.Threading.RateLimiting;
using VocalCoach.Api;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Coach.Infrastructure;
using VocalCoach.Modules.Coach.Presentation;
using VocalCoach.Modules.Identity.Infrastructure;
using VocalCoach.Modules.Identity.Presentation;
using VocalCoach.Modules.Practice.Infrastructure;
using VocalCoach.Modules.Practice.Presentation;
using VocalCoach.Modules.Progress.Infrastructure;
using VocalCoach.Modules.Progress.Presentation;

var builder = WebApplication.CreateBuilder(args);

// Monolito modular (ADR-004): cada módulo registra sus servicios y su esquema de base de datos.
builder.Services
    .AddBuildingBlocksInfrastructure(builder.Configuration)
    .AddIdentityModule(builder.Configuration)
    .AddPracticeModule()
    .AddProgressModule()
    .AddCoachModule(builder.Configuration);

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<UnhandledExceptionHandler>();
builder.Services.AddHealthChecks();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // Registro y login: por IP, contra fuerza bruta.
    o.AddPolicy(IdentityEndpoints.AuthRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimits:AuthPerMinute", 10), Window = TimeSpan.FromMinutes(1) }));
    // IA: por usuario, para no agotar el cupo del proveedor.
    o.AddPolicy(CoachEndpoints.AiRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
        http.User.FindFirstValue("sub") ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimits:AiPerMinute", 12), Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

if (app.Configuration.GetValue("Database:MigrateOnStartup", false))
{
    await app.MigrateModulesAsync();
}

app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/health");
app.MapIdentityEndpoints();
app.MapPracticeEndpoints();
app.MapProgressEndpoints();
app.MapCoachEndpoints();

await app.RunAsync();

/// <summary>Punto de entrada visible para los tests de integración (WebApplicationFactory).</summary>
public partial class Program;
