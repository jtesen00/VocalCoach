using System.Net;
using System.Net.Http.Json;

namespace VocalCoach.IntegrationTests;

public sealed record SyncResult(int Accepted, int AlreadySynced, List<Rejected> Rejected);

public sealed record Rejected(Guid Id, string Code, string Message);

public sealed record AttemptView(Guid Id, string Kind, string ItemId, int Score, bool Passed, DateOnly LocalDay, DateTime ReceivedAtUtc);

public sealed record AttemptsPage(List<AttemptView> Attempts, DateTime? Next);

public sealed record ItemBest(string ItemId, string Kind, int Attempts, int BestScore, bool PassedEver, int LastScore);

public sealed record Summary(int Attempts, int Passed, double Minutes, int DaysPracticed, int CurrentStreak, int BestStreak, bool PracticedToday, List<ItemBest> Items);

[Collection(ApiCollection.Name)]
public sealed class PracticeAndProgressTests(ApiFactory api)
{
    [Fact]
    public async Task Sincronizar_es_idempotente_y_el_progreso_se_actualiza_por_la_outbox()
    {
        var (http, _) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = DateTime.UtcNow.AddDays(-1);
        object[] batch =
        [
            Client.Attempt(Guid.NewGuid(), score: 60, passed: false),
            Client.Attempt(Guid.NewGuid(), score: 92),
            Client.Attempt(Guid.NewGuid(), itemId: "steps-do-re-mi", score: 70, passed: false, at: yesterday),
        ];

        var first = await (await http.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = batch }, ct)).Content.ReadFromJsonAsync<SyncResult>(ct);
        Assert.Equal((3, 0), (first!.Accepted, first.AlreadySynced));
        // Reintento del mismo lote (p. ej. se cortó la conexión): nada se duplica.
        var again = await (await http.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = batch }, ct)).Content.ReadFromJsonAsync<SyncResult>(ct);
        Assert.Equal((0, 3), (again!.Accepted, again.AlreadySynced));

        await api.DrainOutboxAsync();
        await api.DrainOutboxAsync(); // entregar dos veces tampoco duplica

        var summary = await http.GetFromJsonAsync<Summary>($"/api/progress/summary?today={today:yyyy-MM-dd}", ct);
        Assert.Equal((3, 1, 2, 2, true), (summary!.Attempts, summary.Passed, summary.DaysPracticed, summary.CurrentStreak, summary.PracticedToday));
        Assert.Equal(1.5, summary.Minutes, 3);
        var sustained = summary.Items.Single(i => i.ItemId == "sustained-3s");
        Assert.Equal((2, 92, true), (sustained.Attempts, sustained.BestScore, sustained.PassedEver));

        var page = await http.GetFromJsonAsync<AttemptsPage>("/api/practice/attempts", ct);
        Assert.Equal(3, page!.Attempts.Count);
    }

    [Fact]
    public async Task Intentos_no_validos_se_rechazan_uno_a_uno()
    {
        var (http, _) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var bad = Guid.NewGuid();
        var result = await (await http.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = new[] { Client.Attempt(Guid.NewGuid()), Client.Attempt(bad, score: 150) } }, ct)).Content.ReadFromJsonAsync<SyncResult>(ct);
        Assert.Equal(1, result!.Accepted);
        Assert.Equal(("attempt.out_of_range", bad), (result.Rejected.Single().Code, result.Rejected.Single().Id));

        var empty = await http.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = Array.Empty<object>() }, ct);
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }

    [Fact]
    public async Task Cada_usuario_solo_ve_y_toca_lo_suyo()
    {
        var (ana, _) = await api.RegisterAsync();
        var (luis, _) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var id = Guid.NewGuid();
        await ana.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = new[] { Client.Attempt(id) } }, ct);

        // Luis no puede "apropiarse" del id de un intento de Ana ni ver sus intentos.
        var steal = await (await luis.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = new[] { Client.Attempt(id) } }, ct)).Content.ReadFromJsonAsync<SyncResult>(ct);
        Assert.Equal("attempt.id_taken", steal!.Rejected.Single().Code);
        Assert.Empty((await luis.GetFromJsonAsync<AttemptsPage>("/api/practice/attempts", ct))!.Attempts);
        Assert.Single((await ana.GetFromJsonAsync<AttemptsPage>("/api/practice/attempts", ct))!.Attempts);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().GetAsync("/api/practice/attempts", ct)).StatusCode);
    }

    [Fact]
    public async Task Los_intentos_se_traen_por_paginas()
    {
        var (http, _) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        for (var i = 0; i < 3; i++)
        {
            await http.PostAsJsonAsync("/api/practice/attempts/sync", new { attempts = new[] { Client.Attempt(Guid.NewGuid()), Client.Attempt(Guid.NewGuid()) } }, ct);
        }

        var seen = new HashSet<Guid>();
        DateTime? since = null;
        do
        {
            var url = since is null ? "/api/practice/attempts?limit=3" : $"/api/practice/attempts?limit=3&since={since.Value:O}";
            var page = (await http.GetFromJsonAsync<AttemptsPage>(url, ct))!;
            foreach (var a in page.Attempts)
            {
                Assert.True(seen.Add(a.Id), "un intento no debe repetirse entre páginas");
            }

            since = page.Next;
        }
        while (since is not null);

        Assert.Equal(6, seen.Count);
    }
}
