using FluentValidation;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Coach.Application.Features.AskTeacher;

/// <summary>
/// Intermediario del profe con IA: la app manda los mensajes (solo texto con el resumen del
/// intento) y el servidor añade la clave del proveedor, que nunca llega al navegador.
/// </summary>
public sealed record AskTeacherCommand(IReadOnlyList<ChatMessage> Messages) : ICommand<TeacherAnswer>;

public sealed record TeacherAnswer(string Content);

internal sealed class AskTeacherValidator : AbstractValidator<AskTeacherCommand>
{
    public const int MaxMessages = 16;
    public const int MaxChars = 4000;

    public AskTeacherValidator()
    {
        RuleFor(c => c.Messages).NotEmpty().WithErrorCode("coach.empty").WithMessage("No hay mensajes.")
            .Must(m => m.Count <= MaxMessages).WithErrorCode("coach.too_long").WithMessage($"Como máximo {MaxMessages} mensajes.");
        RuleForEach(c => c.Messages).Must(m => m.Role is "system" or "user" or "assistant").WithErrorCode("coach.role").WithMessage("Rol de mensaje no válido.")
            .Must(m => !string.IsNullOrWhiteSpace(m.Content) && m.Content.Length <= MaxChars).WithErrorCode("coach.content").WithMessage($"Cada mensaje debe tener entre 1 y {MaxChars} caracteres.");
        RuleFor(c => c.Messages).Must(m => m.Count(x => x.Role == "system") <= 1).WithErrorCode("coach.role").WithMessage("Solo un mensaje de sistema.");
    }
}

internal sealed class AskTeacherHandler(IChatModel model) : ICommandHandler<AskTeacherCommand, TeacherAnswer>
{
    private static readonly Error NotConfigured = Error.Unavailable("coach.not_configured", "El profe con IA no está configurado en el servidor.");
    private static readonly Error RateLimited = Error.Unavailable("coach.rate_limited", "La IA está saturada. Prueba en un minuto.");

    public async Task<Result<TeacherAnswer>> Handle(AskTeacherCommand command, CancellationToken cancellationToken)
    {
        if (!model.IsConfigured)
        {
            return NotConfigured;
        }

        try
        {
            return new TeacherAnswer(await model.CompleteAsync(command.Messages, cancellationToken));
        }
        catch (ChatModelException ex)
        {
            return ex.RateLimited ? RateLimited : Error.Unavailable("coach.provider_error", ex.Message);
        }
    }
}
