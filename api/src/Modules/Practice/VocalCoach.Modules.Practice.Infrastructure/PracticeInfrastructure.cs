using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Practice.Application;
using VocalCoach.Modules.Practice.Application.Abstractions;
using VocalCoach.Modules.Practice.Infrastructure.Database;

namespace VocalCoach.Modules.Practice.Infrastructure;

public static class PracticeInfrastructure
{
    public static IServiceCollection AddPracticeModule(this IServiceCollection services)
    {
        services.AddApplicationHandlers(typeof(PracticeModule).Assembly);
        services.AddModuleDbContext<PracticeDbContext>(PracticeModule.Schema);
        services.AddScoped<IAttemptRepository, AttemptRepository>();
        return services;
    }
}
