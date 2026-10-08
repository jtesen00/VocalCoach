using System.Diagnostics;
using FluentValidation;
using Microsoft.Extensions.Logging;
using VocalCoach.SharedKernel;

namespace VocalCoach.BuildingBlocks.Application.Messaging;

/// <summary>Valida el mensaje con FluentValidation antes del handler; devuelve un error de validación sin lanzar.</summary>
internal static class Validation
{
    public static async Task<Error?> Validate<T>(IEnumerable<IValidator<T>> validators, T message, CancellationToken ct)
    {
        foreach (var validator in validators)
        {
            var result = await validator.ValidateAsync(message, ct);
            if (!result.IsValid)
            {
                var first = result.Errors[0];
                return Error.Validation(first.ErrorCode, first.ErrorMessage);
            }
        }

        return null;
    }
}

internal sealed class CommandDecorator<TCommand>(
    ICommandHandler<TCommand> inner,
    IEnumerable<IValidator<TCommand>> validators,
    ILogger<TCommand> logger) : ICommandHandler<TCommand>
    where TCommand : ICommand
{
    public async Task<Result> Handle(TCommand command, CancellationToken cancellationToken)
    {
        if (await Validation.Validate(validators, command, cancellationToken) is { } error)
        {
            return Result.Failure(error);
        }

        var watch = Stopwatch.StartNew();
        var result = await inner.Handle(command, cancellationToken);
        Log(logger, typeof(TCommand).Name, result, watch.ElapsedMilliseconds);
        return result;
    }

    internal static void Log(ILogger logger, string name, Result result, long ms)
    {
        if (result.IsSuccess)
        {
            logger.LogInformation("{Message} completado en {Ms} ms", name, ms);
        }
        else
        {
            logger.LogWarning("{Message} falló: {Code} {Error}", name, result.Error.Code, result.Error.Message);
        }
    }
}

internal sealed class CommandDecorator<TCommand, TResponse>(
    ICommandHandler<TCommand, TResponse> inner,
    IEnumerable<IValidator<TCommand>> validators,
    ILogger<TCommand> logger) : ICommandHandler<TCommand, TResponse>
    where TCommand : ICommand<TResponse>
{
    public async Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken)
    {
        if (await Validation.Validate(validators, command, cancellationToken) is { } error)
        {
            return Result.Failure<TResponse>(error);
        }

        var watch = Stopwatch.StartNew();
        var result = await inner.Handle(command, cancellationToken);
        CommandDecorator<ICommand>.Log(logger, typeof(TCommand).Name, result, watch.ElapsedMilliseconds);
        return result;
    }
}

internal sealed class QueryDecorator<TQuery, TResponse>(
    IQueryHandler<TQuery, TResponse> inner,
    IEnumerable<IValidator<TQuery>> validators) : IQueryHandler<TQuery, TResponse>
    where TQuery : IQuery<TResponse>
{
    public async Task<Result<TResponse>> Handle(TQuery query, CancellationToken cancellationToken)
    {
        if (await Validation.Validate(validators, query, cancellationToken) is { } error)
        {
            return Result.Failure<TResponse>(error);
        }

        return await inner.Handle(query, cancellationToken);
    }
}
