using Microsoft.AspNetCore.Http;
using VocalCoach.SharedKernel;

namespace VocalCoach.BuildingBlocks.Presentation;

/// <summary>Traduce un Result a HTTP: el valor como JSON o un ProblemDetails con el código de error.</summary>
public static class ResultHttp
{
    public static IResult ToHttp<T>(this Result<T> result) => result.IsSuccess ? Results.Ok(result.Value) : Problem(result.Error);

    public static IResult ToHttp(this Result result) => result.IsSuccess ? Results.NoContent() : Problem(result.Error);

    public static IResult Problem(Error error) =>
        Results.Problem(
            title: error.Code,
            detail: error.Message,
            statusCode: error.Type switch
            {
                ErrorType.Validation => StatusCodes.Status400BadRequest,
                ErrorType.NotFound => StatusCodes.Status404NotFound,
                ErrorType.Conflict => StatusCodes.Status409Conflict,
                ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
                ErrorType.Unavailable => StatusCodes.Status503ServiceUnavailable,
                _ => StatusCodes.Status500InternalServerError,
            },
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
}
