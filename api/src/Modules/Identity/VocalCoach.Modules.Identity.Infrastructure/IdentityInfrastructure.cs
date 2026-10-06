using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using VocalCoach.BuildingBlocks.Infrastructure.Database;
using VocalCoach.Modules.Identity.Application;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Infrastructure.Authentication;
using VocalCoach.Modules.Identity.Infrastructure.Database;

namespace VocalCoach.Modules.Identity.Infrastructure;

public static class IdentityInfrastructure
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddIdentityApplication();
        services.AddModuleDbContext<IdentityDbContext>(IdentityModule.Schema);
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();
        services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
        services.AddSingleton<Application.Abstractions.IPasswordHasher, AspNetPasswordHasher>();

        var jwt = configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
        if (System.Text.Encoding.UTF8.GetByteCount(jwt.SigningKey) < 32)
        {
            throw new InvalidOperationException("Jwt:SigningKey debe tener al menos 32 bytes (configúrala por variable de entorno Jwt__SigningKey).");
        }

        services.AddOptions<JwtOptions>().Bind(configuration.GetSection(JwtOptions.Section));
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = jwt.Issuer,
                ValidAudience = jwt.Audience,
                IssuerSigningKey = jwt.Key(),
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                NameClaimType = "name",
            };
        });
        services.AddAuthorization();
        return services;
    }
}
