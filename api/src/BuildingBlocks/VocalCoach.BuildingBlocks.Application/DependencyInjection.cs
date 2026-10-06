using System.Reflection;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.BuildingBlocks.Application.Messaging;

namespace VocalCoach.BuildingBlocks.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registra los handlers de un módulo (comandos, consultas y eventos) y sus validadores.
    /// Los comandos y consultas se envuelven con validación y registro.
    /// </summary>
    public static IServiceCollection AddApplicationHandlers(this IServiceCollection services, Assembly assembly)
    {
        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);

        var types = assembly.GetTypes().Where(t => t is { IsAbstract: false, IsInterface: false, IsGenericTypeDefinition: false });
        foreach (var type in types)
        {
            foreach (var iface in type.GetInterfaces().Where(i => i.IsGenericType))
            {
                var def = iface.GetGenericTypeDefinition();
                var args = iface.GetGenericArguments();
                if (def == typeof(ICommandHandler<>))
                {
                    Decorate(services, iface, type, typeof(CommandDecorator<>).MakeGenericType(args));
                }
                else if (def == typeof(ICommandHandler<,>))
                {
                    Decorate(services, iface, type, typeof(CommandDecorator<,>).MakeGenericType(args));
                }
                else if (def == typeof(IQueryHandler<,>))
                {
                    Decorate(services, iface, type, typeof(QueryDecorator<,>).MakeGenericType(args));
                }
                else if (def == typeof(IDomainEventHandler<>) || def == typeof(IIntegrationEventHandler<>))
                {
                    services.AddScoped(iface, type);
                }
            }
        }

        return services;
    }

    private static void Decorate(IServiceCollection services, Type service, Type implementation, Type decorator)
    {
        services.AddScoped(implementation);
        services.AddScoped(service, sp => ActivatorUtilities.CreateInstance(sp, decorator, sp.GetRequiredService(implementation)));
    }
}
