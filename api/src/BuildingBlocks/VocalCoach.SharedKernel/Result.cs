namespace VocalCoach.SharedKernel;

public enum ErrorType
{
    Failure,
    Validation,
    NotFound,
    Conflict,
    Unauthorized,
    Unavailable,
}

/// <summary>Error de negocio esperado (no una excepción): se traduce a ProblemDetails en la API.</summary>
public sealed record Error(string Code, string Message, ErrorType Type = ErrorType.Failure)
{
    public static readonly Error None = new(string.Empty, string.Empty);

    public static Error Validation(string code, string message) => new(code, message, ErrorType.Validation);

    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);

    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);

    public static Error Unauthorized(string code, string message) => new(code, message, ErrorType.Unauthorized);

    public static Error Unavailable(string code, string message) => new(code, message, ErrorType.Unavailable);
}

public class Result
{
    protected Result(bool isSuccess, Error error)
    {
        if (isSuccess != (error == Error.None))
        {
            throw new ArgumentException("Un resultado correcto no lleva error y uno fallido sí.", nameof(error));
        }

        IsSuccess = isSuccess;
        Error = error;
    }

    public bool IsSuccess { get; }

    public bool IsFailure => !IsSuccess;

    public Error Error { get; }

    public static Result Success() => new(true, Error.None);

    public static Result Failure(Error error) => new(false, error);

    public static Result<T> Success<T>(T value) => new(value, true, Error.None);

    public static Result<T> Failure<T>(Error error) => new(default, false, error);
}

public sealed class Result<T> : Result
{
    private readonly T? _value;

    internal Result(T? value, bool isSuccess, Error error)
        : base(isSuccess, error) => _value = value;

    public T Value => IsSuccess ? _value! : throw new InvalidOperationException("Un resultado fallido no tiene valor.");

    public static implicit operator Result<T>(T value) => Success(value);

    public static implicit operator Result<T>(Error error) => Failure<T>(error);
}
