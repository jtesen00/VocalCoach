using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Progress.Application;
using VocalCoach.Modules.Progress.Application.Abstractions;
using VocalCoach.Modules.Progress.Infrastructure.Database;

namespace VocalCoach.Modules.Progress.Infrastructure;

public static class ProgressInfrastructure
{
    public static IServiceCollection AddProgressModule(this IServiceCollection services)
    {
        services.AddProgressApplication();
        services.AddModuleDbContext<ProgressDbContext>(ProgressModule.Schema);
        services.AddScoped<ILearnerProgressRepository, LearnerProgressRepository>();
        return services;
    }
}
