using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VocalCoach.Modules.Coach.Application;

namespace VocalCoach.Modules.Coach.Infrastructure;

/// <summary>Un proveedor con API compatible con OpenAI (Groq, Gemini, Grok).</summary>
public sealed class AiProviderOptions
{
    /// <summary>Clave del proveedor. Por variable de entorno (p. ej. Coach__Gemini__ApiKey) o user-secrets; nunca en el repositorio.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Modelo fijo. Vacío: se elige solo, de la lista del proveedor (los catálogos rotan).</summary>
    public string Model { get; set; } = string.Empty;

    public Uri? BaseUrl { get; set; }
}

public sealed class CoachOptions
{
    public const string Section = "Coach";

    public AiProviderOptions Groq { get; set; } = new();

    public AiProviderOptions Gemini { get; set; } = new();

    public AiProviderOptions Xai { get; set; } = new();

    /// <summary>Orden en que se prueban los proveedores configurados (respaldo automático).</summary>
    public string[] Order { get; set; } = ["groq", "gemini", "xai"];
}

/// <summary>Elección del modelo de texto según la lista de cada proveedor (misma lógica que web/src/core/ai/models.ts).</summary>
public static partial class ModelPickers
{
    public static readonly string[] GroqModels = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];

    public static string? Pick(string provider, IReadOnlyList<string> ids) => provider switch
    {
        "groq" => GroqModels.FirstOrDefault(ids.Contains),
        "gemini" => Rank(
            ids.Select(id => id.StartsWith("models/", StringComparison.Ordinal) ? id[7..] : id).ToList(),
            [@"^gemini-[\d.]+-flash$", "^gemini-flash-latest$", @"^gemini-[\d.]+-flash-lite$", "^gemini-.*flash"],
            "image|tts|audio|live|embedding|thinking|exp|preview"),
        "xai" => Rank(ids, ["^grok-.*fast.*non-reasoning", "^grok-.*non-reasoning", "^grok-.*fast", "^grok-.*mini", @"^grok-\d"], "image|vision|imagine|code|build|voice"),
        _ => null,
    };

    /// <summary>El primer patrón que encaje gana; dentro de un patrón, la versión más alta.</summary>
    public static string? Rank(IReadOnlyList<string> ids, string[] patterns, string? exclude = null)
    {
        var ok = ids.Where(id => exclude is null || !Regex.IsMatch(id, exclude)).ToList();
        foreach (var pattern in patterns)
        {
            var hit = ok.Where(id => Regex.IsMatch(id, pattern)).OrderByDescending(Version).ThenBy(id => id.Length).FirstOrDefault();
            if (hit is not null)
            {
                return hit;
            }
        }

        return null;
    }

    private static double Version(string id)
    {
        var m = VersionNumber().Match(id);
        return m.Success ? double.Parse(m.Value, System.Globalization.CultureInfo.InvariantCulture) : 0;
    }

    [GeneratedRegex(@"\d+(\.\d+)?")]
    private static partial Regex VersionNumber();
}

/// <summary>Un proveedor con API compatible con OpenAI.</summary>
public sealed partial class OpenAiCompatibleChatModel(string name, HttpClient http, AiProviderOptions options) : IChatModel
{
    private sealed record Choice(Message? Message);

    private sealed record Message(string? Content);

    private sealed record Completion(List<Choice>? Choices);

    private sealed record ModelInfo(string Id);

    private sealed record ModelList(List<ModelInfo>? Data);

    private readonly SemaphoreSlim _pick = new(1, 1);
    private string? _model = string.IsNullOrWhiteSpace(options.Model) ? null : options.Model;

    public string Name => name;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.ApiKey);

    public async Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, int maxTokens, CancellationToken cancellationToken)
    {
        var model = await ModelAsync(cancellationToken);
        using var request = Authorized(HttpMethod.Post, "chat/completions");
        request.Content = JsonContent.Create(new
        {
            model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }),
            temperature = 0.5,
            max_tokens = maxTokens,
        });
        using var response = await http.SendAsync(request, cancellationToken);
        Check(response);
        var completion = await response.Content.ReadFromJsonAsync<Completion>(cancellationToken);
        var text = completion?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            throw new ChatModelException($"{name}: la IA no devolvió respuesta.");
        }

        return ThinkBlock().Replace(text, string.Empty).Trim();
    }

    /// <summary>Modelo configurado o, si no hay, el mejor de la lista del proveedor (se recuerda).</summary>
    private async Task<string> ModelAsync(CancellationToken cancellationToken)
    {
        if (_model is not null)
        {
            return _model;
        }

        await _pick.WaitAsync(cancellationToken);
        try
        {
            if (_model is not null)
            {
                return _model;
            }

            using var request = Authorized(HttpMethod.Get, "models");
            using var response = await http.SendAsync(request, cancellationToken);
            Check(response);
            var list = await response.Content.ReadFromJsonAsync<ModelList>(cancellationToken);
            var ids = list?.Data?.Select(m => m.Id).ToList() ?? [];
            return _model = ModelPickers.Pick(name, ids) ?? throw new ChatModelException($"{name}: no hay un modelo de texto adecuado.");
        }
        finally
        {
            _pick.Release();
        }
    }

    private HttpRequestMessage Authorized(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        return request;
    }

    private void Check(HttpResponseMessage response)
    {
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            throw new ChatModelException($"{name}: límite de peticiones del proveedor.", rateLimited: true);
        }

        if (response.StatusCode == HttpStatusCode.NotFound && string.IsNullOrWhiteSpace(options.Model))
        {
            _model = null; // modelo retirado: se vuelve a elegir en la siguiente petición
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new ChatModelException($"{name}: el proveedor de IA respondió {(int)response.StatusCode}.");
        }
    }

    [GeneratedRegex(@"<think>[\s\S]*?</think>")]
    private static partial Regex ThinkBlock();
}

/// <summary>Multi-IA: prueba los proveedores configurados en orden hasta que uno responde.</summary>
public sealed class FallbackChatModel(IReadOnlyList<IChatModel> models, ILogger<FallbackChatModel> logger) : IChatModel
{
    public bool IsConfigured => models.Any(m => m.IsConfigured);

    public async Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, int maxTokens, CancellationToken cancellationToken)
    {
        var errors = new List<ChatModelException>();
        foreach (var model in models.Where(m => m.IsConfigured))
        {
            try
            {
                return await model.CompleteAsync(messages, maxTokens, cancellationToken);
            }
            catch (ChatModelException ex)
            {
                logger.LogWarning("Proveedor de IA sin respuesta, se prueba el siguiente: {Message}", ex.Message);
                errors.Add(ex);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Proveedor de IA inalcanzable, se prueba el siguiente.");
                errors.Add(new ChatModelException("Proveedor de IA inalcanzable."));
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                errors.Add(new ChatModelException("El proveedor de IA tardó demasiado."));
            }
        }

        if (errors.Count == 0)
        {
            throw new ChatModelException("No hay ningún proveedor de IA configurado.");
        }

        throw new ChatModelException(string.Join(" ", errors.Select(e => e.Message)), rateLimited: errors.All(e => e.RateLimited));
    }
}

public static class CoachInfrastructure
{
    private static readonly Dictionary<string, Uri> DefaultBaseUrls = new()
    {
        ["groq"] = new("https://api.groq.com/openai/v1/"),
        ["gemini"] = new("https://generativelanguage.googleapis.com/v1beta/openai/"),
        ["xai"] = new("https://api.x.ai/v1/"),
    };

    public static IServiceCollection AddCoachModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCoachApplication();
        services.AddOptions<CoachOptions>().Bind(configuration.GetSection(CoachOptions.Section));
        foreach (var name in DefaultBaseUrls.Keys)
        {
            services.AddHttpClient($"coach-{name}", (sp, http) =>
            {
                http.BaseAddress = Provider(sp.GetRequiredService<IOptions<CoachOptions>>().Value, name).BaseUrl ?? DefaultBaseUrls[name];
                http.Timeout = TimeSpan.FromSeconds(30);
            });
        }

        services.AddSingleton<IChatModel>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<CoachOptions>>().Value;
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var models = options.Order.Select(n => n.Trim().ToLowerInvariant()).Distinct().Where(DefaultBaseUrls.ContainsKey)
                .Select(n => (IChatModel)new OpenAiCompatibleChatModel(n, factory.CreateClient($"coach-{n}"), Provider(options, n)))
                .ToList();
            return new FallbackChatModel(models, sp.GetRequiredService<ILogger<FallbackChatModel>>());
        });
        return services;
    }

    private static AiProviderOptions Provider(CoachOptions o, string name) => name switch
    {
        "groq" => o.Groq,
        "gemini" => o.Gemini,
        _ => o.Xai,
    };
}
