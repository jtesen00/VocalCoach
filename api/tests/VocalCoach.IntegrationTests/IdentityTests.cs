using System.Net;
using System.Net.Http.Json;

namespace VocalCoach.IntegrationTests;

[Collection(ApiCollection.Name)]
public sealed class IdentityTests(ApiFactory api)
{
    [Fact]
    public async Task Registro_login_y_perfil()
    {
        var email = $"Ana{Guid.NewGuid():N}@Ejemplo.com";
        var (http, auth) = await api.RegisterAsync(email);
        Assert.Equal(email.ToLowerInvariant(), auth.User.Email);

        var me = await http.GetFromJsonAsync<UserDto>("/api/identity/me", TestContext.Current.CancellationToken);
        Assert.Equal(auth.User.Id, me!.Id);

        var login = await api.CreateClient().PostAsJsonAsync("/api/identity/login", new { email, password = "contraseña-segura" }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Email_repetido_contraseña_mala_y_sin_token()
    {
        var (_, auth) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var anon = api.CreateClient();

        var dup = await anon.PostAsJsonAsync("/api/identity/register", new { email = auth.User.Email, password = "otra-contraseña", displayName = "X" }, ct);
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
        Assert.Equal("user.email_taken", (await dup.Content.ReadFromJsonAsync<Problem>(ct))!.Code);

        var weak = await anon.PostAsJsonAsync("/api/identity/register", new { email = "nuevo@prueba.com", password = "corta", displayName = "X" }, ct);
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        var bad = await anon.PostAsJsonAsync("/api/identity/login", new { email = auth.User.Email, password = "incorrecta" }, ct);
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/identity/me", ct)).StatusCode);
    }

    [Fact]
    public async Task El_refresh_rota_y_reutilizar_uno_viejo_cierra_todas_las_sesiones()
    {
        var (_, auth) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var anon = api.CreateClient();

        var first = await anon.PostAsJsonAsync("/api/identity/refresh", new { refreshToken = auth.RefreshToken }, ct);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var rotated = (await first.Content.ReadFromJsonAsync<Auth>(ct))!;
        Assert.NotEqual(auth.RefreshToken, rotated.RefreshToken);

        // Reutilizar el token viejo (posible robo): se rechaza y se revoca también el nuevo.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/identity/refresh", new { refreshToken = auth.RefreshToken }, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/identity/refresh", new { refreshToken = rotated.RefreshToken }, ct)).StatusCode);
    }

    [Fact]
    public async Task Cerrar_sesion_invalida_el_refresh()
    {
        var (_, auth) = await api.RegisterAsync();
        var ct = TestContext.Current.CancellationToken;
        var anon = api.CreateClient();
        Assert.Equal(HttpStatusCode.NoContent, (await anon.PostAsJsonAsync("/api/identity/logout", new { refreshToken = auth.RefreshToken }, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/identity/refresh", new { refreshToken = auth.RefreshToken }, ct)).StatusCode);
    }
}
