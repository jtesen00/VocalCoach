using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using VocalCoach.BuildingBlocks.Application.Events;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Identity.Application.Abstractions;
using VocalCoach.Modules.Identity.Domain;
using VocalCoach.Modules.Identity.IntegrationEvents;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Application.Features.Register;

public sealed record RegisterCommand(string Email, string Password, string DisplayName) : ICommand<AuthResponse>;

internal sealed class RegisterValidator : AbstractValidator<RegisterCommand>
{
    public RegisterValidator()
    {
        RuleFor(c => c.Email).NotEmpty().WithErrorCode("user.invalid_email").WithMessage("Escribe tu email.");
        RuleFor(c => c.Password).MinimumLength(8).WithErrorCode("user.weak_password").WithMessage("La contraseña debe tener al menos 8 caracteres.")
            .MaximumLength(128).WithErrorCode("user.weak_password").WithMessage("La contraseña es demasiado larga.");
        RuleFor(c => c.DisplayName).NotEmpty().WithErrorCode("user.invalid_name").WithMessage("Escribe tu nombre.");
    }
}

internal sealed class RegisterHandler(IUserRepository users, IPasswordHasher hasher, SessionIssuer sessions, TimeProvider time) : ICommandHandler<RegisterCommand, AuthResponse>
{
    public async Task<Result<AuthResponse>> Handle(RegisterCommand command, CancellationToken cancellationToken)
    {
        if (await users.EmailExistsAsync(User.NormalizeEmail(command.Email), cancellationToken))
        {
            return UserErrors.EmailTaken;
        }

        var result = User.Register(command.Email, command.DisplayName, hasher.Hash(command.Password), time.GetUtcNow().UtcDateTime);
        if (result.IsFailure)
        {
            return result.Error;
        }

        users.Add(result.Value);
        return await sessions.IssueAsync(result.Value, null, cancellationToken);
    }
}

internal sealed class UserRegisteredDomainEventHandler([FromKeyedServices(IdentityModule.Schema)] IOutbox outbox) : IDomainEventHandler<UserRegisteredDomainEvent>
{
    public Task Handle(UserRegisteredDomainEvent e, CancellationToken cancellationToken)
    {
        outbox.Add(new UserRegisteredIntegrationEvent(e.Id, e.OccurredOnUtc, e.UserId));
        return Task.CompletedTask;
    }
}
