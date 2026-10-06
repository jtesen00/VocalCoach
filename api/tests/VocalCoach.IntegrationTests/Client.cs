using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace VocalCoach.IntegrationTests;

public sealed record Auth(string AccessToken, DateTime AccessTokenExpiresAtUtc, string RefreshToken, UserDto User);

public sealed record UserDto(Guid Id, string Email, string DisplayName);

public sealed record Problem(string Title, int Status, string? Code);

internal static class Client
{
    public static async Task<(HttpClient Http, Auth Auth)> RegisterAsync(this ApiFactory api, string? email = null)
    {
        var http = api.CreateClient();
        var response = await http.PostAsJsonAsync("/api/identity/register", new { email = email ?? $"u{Guid.NewGuid():N}@prueba.com", password = "contraseña-segura", displayName = "Prueba" });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<Auth>())!;
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (http, auth);
    }

    public static object Attempt(Guid id, string itemId = "sustained-3s", int score = 90, bool passed = true, DateOnly? day = null, DateTime? at = null)
    {
        var when = at ?? DateTime.UtcNow.AddMinutes(-1);
        return new { id, kind = "exercise", itemId, performedAtUtc = when, localDay = day ?? DateOnly.FromDateTime(when), score, accuracy = score / 100.0, passed, durationSeconds = 30, details = (string?)null };
    }
}
