using VocalCoach.Modules.Practice.Domain;

namespace VocalCoach.Modules.Practice.Application.Abstractions;

public interface IAttemptRepository
{
    /// <summary>De los ids dados, los que ya existen y de quién son.</summary>
    Task<Dictionary<Guid, Guid>> GetOwnersAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken);

    void Add(Attempt attempt);
}
