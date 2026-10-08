using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VocalCoach.Modules.Coach.Application;

namespace VocalCoach.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class CoachTests(ApiFactory api)
{
    private sealed class FakeModel : IChatModel
    {
        public List<IReadOnlyList<ChatMessage>> Calls { get; } = [];

        public bool IsConfigured => true;

        public Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, int maxTokens, CancellationToken cancellationToken)
        {
            Calls.Add(messages);
            return Task.FromResult("¡Bien! Mantén la nota firme.");
        }
    }

    private sealed record Answer(string Content);

    private static readonly object Body = new { messages = new[] { new { role = "system", content = "Eres un profe." }, new { role = "user", content = "Resumen: Mantén una nota, superado." } } };

    [Fact]
    public async Task Sin_clave_en_el_servidor_responde_no_disponible()
    {
        var (http, _) = await api.RegisterAsync();
        var response = await http.PostAsJsonAsync("/api/coach/teacher", Body, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Con_modelo_configurado_responde_y_exige_sesion()
    {
        var fake = new FakeModel();
        using var app = api.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IChatModel>(fake))));
        var ct = TestContext.Current.CancellationToken;
        var anon = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/coach/teacher", Body, ct)).StatusCode);

        var (_, auth) = await api.RegisterAsync();
        var http = app.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var answer = await (await http.PostAsJsonAsync("/api/coach/teacher", Body, ct)).Content.ReadFromJsonAsync<Answer>(ct);
        Assert.Equal("¡Bien! Mantén la nota firme.", answer!.Content);
        Assert.Equal("user", fake.Calls.Single()[1].Role);

        var invalid = new { messages = new[] { new { role = "tool", content = "x" } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsJsonAsync("/api/coach/teacher", invalid, ct)).StatusCode);
    }
}
