const screensService = require('./screens.service');
const { NoApprovedApiSpecError, MvpCoverageError } = require('./screens.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

async function getScreenMapController(req, res) {
  const state = await screensService.getScreenMapState(req.params.projectId);
  return res.status(200).json(state);
}

async function generateScreenMapController(req, res) {
  try {
    const screenMap = await screensService.generateScreenMap(req.params.projectId, req.user.id);
    return res.status(201).json(screenMap);
  } catch (err) {
    if (err instanceof NoApprovedApiSpecError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof MvpCoverageError) {
      return res.status(502).json({ error: err.message });
    }
    if (err instanceof AiTimeoutError || err instanceof AiProviderError || err instanceof AiResponseValidationError) {
      return res
        .status(500)
        .json({ error: 'El asistente de IA no esta disponible en este momento, intenta de nuevo' });
    }
    throw err;
  }
}

module.exports = { getScreenMapController, generateScreenMapController };
