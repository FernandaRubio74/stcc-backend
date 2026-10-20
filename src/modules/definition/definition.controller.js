const definitionService = require('./definition.service');
const { StageBlockedError, NoNextStageError } = require('./definition.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

async function getDefinitionController(req, res) {
  const state = await definitionService.getDefinitionState(req.params.projectId);
  return res.status(200).json(state);
}

async function postMessageController(req, res) {
  try {
    const result = await definitionService.postMessage({
      projectId: req.params.projectId,
      userId: req.user.id,
      content: req.body.content,
    });
    return res.status(201).json(result);
  } catch (err) {
    // DoD T-014.2: timeout/sin respuesta del proveedor -> 500 controlado.
    if (
      err instanceof AiTimeoutError ||
      err instanceof AiProviderError ||
      err instanceof AiResponseValidationError
    ) {
      return res
        .status(500)
        .json({ error: 'El asistente de IA no esta disponible en este momento, intenta de nuevo' });
    }
    throw err;
  }
}

async function listBlockingQuestionsController(req, res) {
  const questions = await definitionService.listBlockingQuestions(req.params.projectId);
  return res.status(200).json(questions);
}

async function advanceStageController(req, res) {
  try {
    const definition = await definitionService.advanceStage(req.params.projectId);
    return res.status(200).json(definition);
  } catch (err) {
    if (err instanceof StageBlockedError) {
      return res.status(409).json({ error: err.message, blockingQuestions: err.blockingQuestions });
    }
    if (err instanceof NoNextStageError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = {
  getDefinitionController,
  postMessageController,
  listBlockingQuestionsController,
  advanceStageController,
};
