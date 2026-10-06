using Microsoft.EntityFrameworkCore;
using VocalCoach.Modules.Practice.Application.Abstractions;
using VocalCoach.Modules.Practice.Domain;

namespace VocalCoach.Modules.Practice.Infrastructure.Database;

internal sealed class AttemptRepository(PracticeDbContext context) : IAttemptRepository
{
    public Task<Dictionary<Guid, Guid>> GetOwnersAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken) =>
        context.Attempts.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.UserId, cancellationToken);

    public void Add(Attempt attempt) => context.Attempts.Add(attempt);
}
