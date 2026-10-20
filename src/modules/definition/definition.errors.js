class ProjectDefinitionNotFoundError extends Error {}

// T-017.2: avanzar de etapa estando bloqueado.
class StageBlockedError extends Error {
  constructor(message, blockingQuestions = []) {
    super(message);
    this.name = 'StageBlockedError';
    this.blockingQuestions = blockingQuestions;
  }
}

class NoNextStageError extends Error {}

module.exports = { ProjectDefinitionNotFoundError, StageBlockedError, NoNextStageError };
