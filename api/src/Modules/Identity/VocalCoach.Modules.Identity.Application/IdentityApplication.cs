using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application;
using VocalCoach.Modules.Identity.Application.Features;

namespace VocalCoach.Modules.Identity.Application;

public static class IdentityApplication
{
    public static IServiceCollection AddIdentityApplication(this IServiceCollection services)
    {
        services.AddApplicationHandlers(typeof(IdentityApplication).Assembly);
        services.AddScoped<SessionIssuer>();
        return services;
    }
}
