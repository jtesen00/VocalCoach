using Dapper;
using VocalCoach.BuildingBlocks.Application.Abstractions;
using VocalCoach.BuildingBlocks.Application.Messaging;
using VocalCoach.Modules.Identity.Domain;
using VocalCoach.SharedKernel;

namespace VocalCoach.Modules.Identity.Application.Features.GetMe;

public sealed record GetMeQuery(Guid UserId) : IQuery<UserView>;

internal sealed class GetMeHandler(IDbConnectionFactory db) : IQueryHandler<GetMeQuery, UserView>
{
    public async Task<Result<UserView>> Handle(GetMeQuery query, CancellationToken cancellationToken)
    {
        await using var connection = await db.OpenConnectionAsync(cancellationToken);
        var user = await connection.QuerySingleOrDefaultAsync<UserView>(
            new CommandDefinition("SELECT id, email, display_name AS DisplayName FROM identity.users WHERE id = @UserId", new { query.UserId }, cancellationToken: cancellationToken));
        return user is null ? UserErrors.NotFound : user;
    }
}
