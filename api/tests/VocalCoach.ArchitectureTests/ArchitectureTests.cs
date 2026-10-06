using System.Reflection;
using NetArchTest.Rules;

namespace VocalCoach.ArchitectureTests;

/// <summary>Reglas de ADR-004: dependencias hacia el dominio y módulos aislados.</summary>
public sealed class ArchitectureTests
{
    private static readonly string[] Modules = ["Identity", "Practice", "Progress", "Coach"];
    private static readonly string[] Layers = ["Domain", "Application", "Infrastructure", "Presentation", "IntegrationEvents"];

    private static Assembly? Load(string module, string layer)
    {
        try
        {
            return Assembly.Load($"VocalCoach.Modules.{module}.{layer}");
        }
        catch (FileNotFoundException)
        {
            return null; // p. ej. Coach no tiene dominio propio
        }
    }

    public static TheoryData<string> AllModules() => [.. Modules];

    private static void AssertRule(NetArchTest.Rules.TestResult result, string rule) =>
        Assert.True(result.IsSuccessful, $"{rule}: {string.Join(", ", result.FailingTypeNames ?? [])}");

    [Theory]
    [MemberData(nameof(AllModules))]
    public void El_dominio_no_depende_de_otras_capas_ni_de_frameworks(string module)
    {
        var domain = Load(module, "Domain");
        if (domain is null)
        {
            return;
        }

        var forbidden = Layers.Where(l => l != "Domain").Select(l => $"VocalCoach.Modules.{module}.{l}")
            .Concat(["VocalCoach.BuildingBlocks", "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Npgsql", "Dapper"]).ToArray();
        AssertRule(Types.InAssembly(domain).ShouldNot().HaveDependencyOnAny(forbidden).GetResult(), $"{module}.Domain");
    }

    [Theory]
    [MemberData(nameof(AllModules))]
    public void La_aplicacion_no_depende_de_infraestructura_ni_presentacion(string module)
    {
        var application = Load(module, "Application")!;
        string[] forbidden =
        [
            $"VocalCoach.Modules.{module}.Infrastructure", $"VocalCoach.Modules.{module}.Presentation",
            "VocalCoach.BuildingBlocks.Infrastructure", "VocalCoach.BuildingBlocks.Presentation",
            "Microsoft.EntityFrameworkCore", "Microsoft.AspNetCore", "Npgsql",
        ];
        AssertRule(Types.InAssembly(application).ShouldNot().HaveDependencyOnAny(forbidden).GetResult(), $"{module}.Application");
    }

    [Theory]
    [MemberData(nameof(AllModules))]
    public void La_presentacion_no_depende_de_la_infraestructura(string module)
    {
        var presentation = Load(module, "Presentation")!;
        string[] forbidden = [$"VocalCoach.Modules.{module}.Infrastructure", "VocalCoach.BuildingBlocks.Infrastructure", "Microsoft.EntityFrameworkCore", "Npgsql"];
        AssertRule(Types.InAssembly(presentation).ShouldNot().HaveDependencyOnAny(forbidden).GetResult(), $"{module}.Presentation");
    }

    [Theory]
    [MemberData(nameof(AllModules))]
    public void Un_modulo_solo_conoce_los_integration_events_de_otros(string module)
    {
        var forbidden = Modules.Where(m => m != module)
            .SelectMany(other => Layers.Where(l => l != "IntegrationEvents").Select(l => $"VocalCoach.Modules.{other}.{l}"))
            .ToArray();
        foreach (var assembly in Layers.Select(l => Load(module, l)).OfType<Assembly>())
        {
            AssertRule(Types.InAssembly(assembly).ShouldNot().HaveDependencyOnAny(forbidden).GetResult(), assembly.GetName().Name!);
        }
    }

    [Theory]
    [MemberData(nameof(AllModules))]
    public void Los_integration_events_solo_dependen_de_bloques_comunes(string module)
    {
        var events = Load(module, "IntegrationEvents");
        if (events is null)
        {
            return;
        }

        var forbidden = Layers.Where(l => l != "IntegrationEvents").Select(l => $"VocalCoach.Modules.{module}.{l}").ToArray();
        AssertRule(Types.InAssembly(events).ShouldNot().HaveDependencyOnAny(forbidden).GetResult(), $"{module}.IntegrationEvents");
    }

    [Fact]
    public void Control_las_reglas_detectan_dependencias_reales()
    {
        // Si NetArchTest no viera las dependencias, todas las reglas pasarían en vacío:
        // Progress.Application sí usa el contrato de Practice, así que esta regla debe fallar.
        var result = Types.InAssembly(Load("Progress", "Application")!).ShouldNot().HaveDependencyOn("VocalCoach.Modules.Practice.IntegrationEvents").GetResult();
        Assert.False(result.IsSuccessful);
    }
}
