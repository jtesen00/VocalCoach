using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using VocalCoach.Modules.Identity.Infrastructure.Database;
using VocalCoach.Modules.Practice.Infrastructure.Database;
using VocalCoach.Modules.Progress.Infrastructure.Database;

namespace VocalCoach.Api;

public static class HostExtensions
{
    /// <summary>Aplica las migraciones de cada módulo (cada uno en su esquema).</summary>
    public static async Task MigrateModulesAsync(this IHost app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        foreach (var context in new DbContext[]
                 {
                     scope.ServiceProvider.GetRequiredService<IdentityDbContext>(),
                     scope.ServiceProvider.GetRequiredService<PracticeDbContext>(),
                     scope.ServiceProvider.GetRequiredService<ProgressDbContext>(),
                 })
        {
            await context.Database.MigrateAsync();
        }
    }
}

/// <summary>Errores no esperados: se registran y se responde un ProblemDetails genérico (sin detalles internos).</summary>
internal sealed class UnhandledExceptionHandler(IProblemDetailsService problems, ILogger<UnhandledExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is BadHttpRequestException bad)
        {
            http.Response.StatusCode = bad.StatusCode;
            return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = { Title = "request.invalid", Detail = "La petición no es válida.", Status = bad.StatusCode } });
        }

        logger.LogError(exception, "Error no controlado en {Path}", http.Request.Path);
        http.Response.StatusCode = StatusCodes.Status500InternalServerError;
        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = { Title = "server.error", Detail = "Ha ocurrido un error inesperado.", Status = 500 } });
    }
}
