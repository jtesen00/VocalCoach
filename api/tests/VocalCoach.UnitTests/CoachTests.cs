using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using VocalCoach.Modules.Coach.Application;
using VocalCoach.Modules.Coach.Infrastructure;

namespace VocalCoach.UnitTests;

public sealed class ModelPickerTests
{
    [Fact]
    public void Gemini_elige_el_flash_mas_nuevo_sin_variantes()
    {
        string[] ids = ["models/gemini-2.5-flash", "models/gemini-3.6-flash", "models/gemini-3.6-flash-image", "models/gemini-3.6-flash-lite", "models/gemini-3.6-pro-preview"];
        Assert.Equal("gemini-3.6-flash", ModelPickers.Pick("gemini", ids));
    }

    [Fact]
    public void Grok_prefiere_el_rapido_sin_razonamiento()
    {
        Assert.Equal("grok-4-1-fast-non-reasoning", ModelPickers.Pick("xai", ["grok-4.6", "grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-imagine-image"]));
        Assert.Equal("grok-4.6", ModelPickers.Pick("xai", ["grok-4.5", "grok-4.6", "grok-build-0.1"]));
    }

    [Fact]
    public void Groq_usa_la_lista_de_preferidos()
    {
        Assert.Equal("llama-3.3-70b-versatile", ModelPickers.Pick("groq", ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]));
        Assert.Null(ModelPickers.Pick("groq", ["whisper-large-v3"]));
    }
}

public sealed class MultiAiTests
{
    private static readonly ChatMessage[] Messages = [new("user", "Hola")];

    private sealed class Fake(string answer, bool configured = true, bool fail = false, bool rateLimited = false) : IChatModel
    {
        public int Calls { get; private set; }

        public bool IsConfigured => configured;

        public Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, int maxTokens, CancellationToken cancellationToken)
        {
            Calls++;
            return fail ? throw new ChatModelException($"{answer} falló", rateLimited) : Task.FromResult(answer);
        }
    }

    private static FallbackChatModel Fallback(params IChatModel[] models) => new(models, NullLogger<FallbackChatModel>.Instance);

    [Fact]
    public async Task Si_el_primero_falla_responde_el_siguiente_y_se_saltan_los_no_configurados()
    {
        var groq = new Fake("groq", fail: true, rateLimited: true);
        var gemini = new Fake("gemini", configured: false);
        var grok = new Fake("grok");
        var answer = await Fallback(groq, gemini, grok).CompleteAsync(Messages, 400, TestContext.Current.CancellationToken);
        Assert.Equal("grok", answer);
        Assert.Equal(1, groq.Calls);
        Assert.Equal(0, gemini.Calls);
    }

    [Fact]
    public async Task Si_todos_estan_saturados_se_informa_como_limite()
    {
        var ex = await Assert.ThrowsAsync<ChatModelException>(() =>
            Fallback(new Fake("a", fail: true, rateLimited: true), new Fake("b", fail: true, rateLimited: true)).CompleteAsync(Messages, 400, TestContext.Current.CancellationToken));
        Assert.True(ex.RateLimited);
        Assert.False(Fallback(new Fake("a", configured: false)).IsConfigured);
    }

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add($"{request.Method} {request.RequestUri!.AbsolutePath} {(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken))}");
            return respond(request);
        }
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Sin_modelo_configurado_lo_elige_de_la_lista_una_sola_vez()
    {
        var handler = new Handler(r => r.RequestUri!.AbsolutePath.EndsWith("/models", StringComparison.Ordinal)
            ? Json("""{"data":[{"id":"models/gemini-2.5-flash"},{"id":"models/gemini-3.6-flash"}]}""")
            : Json("""{"choices":[{"message":{"content":"<think>x</think> ¡Bien!"}}]}"""));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://example.test/v1beta/openai/") };
        var model = new OpenAiCompatibleChatModel("gemini", http, new AiProviderOptions { ApiKey = "k" });
        var ct = TestContext.Current.CancellationToken;
        Assert.Equal("¡Bien!", await model.CompleteAsync(Messages, 300, ct));
        Assert.Equal("¡Bien!", await model.CompleteAsync(Messages, 300, ct));
        Assert.Single(handler.Requests, r => r.StartsWith("GET", StringComparison.Ordinal));
        Assert.Contains("\"model\":\"gemini-3.6-flash\"", handler.Requests[1], StringComparison.Ordinal);
        Assert.Contains("\"max_tokens\":300", handler.Requests[1], StringComparison.Ordinal);
    }

    [Fact]
    public async Task Un_429_se_marca_como_limite()
    {
        var http = new HttpClient(new Handler(_ => Json("{}", HttpStatusCode.TooManyRequests))) { BaseAddress = new Uri("https://example.test/") };
        var model = new OpenAiCompatibleChatModel("groq", http, new AiProviderOptions { ApiKey = "k", Model = "m" });
        var ex = await Assert.ThrowsAsync<ChatModelException>(() => model.CompleteAsync(Messages, 400, TestContext.Current.CancellationToken));
        Assert.True(ex.RateLimited);
    }
}
