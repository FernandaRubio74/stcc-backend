const definitionService = require('./definition.service');
const { StageBlockedError, NoNextStageError } = require('./definition.errors');
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

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
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'definition', action: 'message', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
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
