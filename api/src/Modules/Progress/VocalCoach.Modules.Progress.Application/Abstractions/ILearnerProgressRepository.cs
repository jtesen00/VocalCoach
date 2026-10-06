using VocalCoach.Modules.Progress.Domain;

namespace VocalCoach.Modules.Progress.Application.Abstractions;

public interface ILearnerProgressRepository
{
    Task<LearnerProgress?> GetAsync(Guid userId, CancellationToken cancellationToken);

    void Add(LearnerProgress progress);

    /// <summary>Idempotencia: marca el intento como procesado; false si ya lo estaba.</summary>
    Task<bool> TryMarkProcessedAsync(Guid attemptId, CancellationToken cancellationToken);
}
