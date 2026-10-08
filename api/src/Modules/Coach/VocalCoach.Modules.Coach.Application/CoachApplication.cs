using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application;

namespace VocalCoach.Modules.Coach.Application;

public static class CoachApplication
{
    public static IServiceCollection AddCoachApplication(this IServiceCollection services) =>
        services.AddApplicationHandlers(typeof(CoachApplication).Assembly);
}

public sealed record ChatMessage(string Role, string Content);

/// <summary>
/// Modelo de lenguaje. En el servidor puede haber varios proveedores (Groq, Gemini, Grok) con
/// respaldo automático; el caso de uso no sabe cuál responde.
/// </summary>
public interface IChatModel
{
    bool IsConfigured { get; }

    Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, int maxTokens, CancellationToken cancellationToken);
}

public sealed class ChatModelException(string message, bool rateLimited = false) : Exception(message)
{
    public bool RateLimited { get; } = rateLimited;
}
