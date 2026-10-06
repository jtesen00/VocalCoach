using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using VocalCoach.Modules.Coach.Application;

namespace VocalCoach.Modules.Coach.Infrastructure;

public sealed class GroqOptions
{
    public const string Section = "Coach:Groq";

    /// <summary>Clave de Groq. Por variable de entorno (Coach__Groq__ApiKey) o user-secrets; nunca en el repositorio.</summary>
    public string ApiKey { get; set; } = string.Empty;

    public string Model { get; set; } = "llama-3.3-70b-versatile";

    public Uri BaseUrl { get; set; } = new("https://api.groq.com/openai/v1/");
}

internal sealed partial class GroqChatModel(HttpClient http, IOptions<GroqOptions> options) : IChatModel
{
    private sealed record Choice(Message? Message);

    private sealed record Message(string? Content);

    private sealed record Completion(List<Choice>? Choices);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.ApiKey);

    public async Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = JsonContent.Create(new
            {
                model = options.Value.Model,
                messages = messages.Select(m => new { role = m.Role, content = m.Content }),
                temperature = 0.5,
                max_tokens = 400,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        using var response = await http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            throw new ChatModelException("Límite de peticiones del proveedor.", rateLimited: true);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new ChatModelException($"El proveedor de IA respondió {(int)response.StatusCode}.");
        }

        var completion = await response.Content.ReadFromJsonAsync<Completion>(cancellationToken);
        var text = completion?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            throw new ChatModelException("La IA no devolvió respuesta.");
        }

        return ThinkBlock().Replace(text, string.Empty).Trim();
    }

    [GeneratedRegex(@"<think>[\s\S]*?</think>")]
    private static partial Regex ThinkBlock();
}

public static class CoachInfrastructure
{
    public static IServiceCollection AddCoachModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCoachApplication();
        services.AddOptions<GroqOptions>().Bind(configuration.GetSection(GroqOptions.Section));
        services.AddHttpClient<IChatModel, GroqChatModel>((sp, http) =>
        {
            http.BaseAddress = sp.GetRequiredService<IOptions<GroqOptions>>().Value.BaseUrl;
            http.Timeout = TimeSpan.FromSeconds(30);
        });
        return services;
    }
}
