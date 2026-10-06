using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application;

namespace VocalCoach.Modules.Progress.Application;

public static class ProgressModule
{
    public const string Schema = "progress";
}

public static class ProgressApplication
{
    public static IServiceCollection AddProgressApplication(this IServiceCollection services) =>
        services.AddApplicationHandlers(typeof(ProgressApplication).Assembly);
}
