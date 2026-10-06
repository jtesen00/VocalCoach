using VocalCoach.SharedKernel;

namespace VocalCoach.BuildingBlocks.Application.Messaging;

// CQRS ligero sin librería de mediación (ADR-004): los endpoints piden el handler a DI.
// Los comandos cambian estado (EF Core); las consultas solo leen (Dapper).

public interface ICommand;

public interface ICommand<TResponse>;

public interface IQuery<TResponse>;

public interface ICommandHandler<in TCommand>
    where TCommand : ICommand
{
    Task<Result> Handle(TCommand command, CancellationToken cancellationToken);
}

public interface ICommandHandler<in TCommand, TResponse>
    where TCommand : ICommand<TResponse>
{
    Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken);
}

public interface IQueryHandler<in TQuery, TResponse>
    where TQuery : IQuery<TResponse>
{
    Task<Result<TResponse>> Handle(TQuery query, CancellationToken cancellationToken);
}
