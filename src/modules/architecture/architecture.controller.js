const architectureService = require('./architecture.service');
const { InvalidArchitectureIdError } = require('./architecture.errors');
const { NoApprovedVersionError } = require('../data-model/data-model.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

function getCatalogController(req, res) {
  return res.status(200).json(architectureService.getCatalog());
}

async function getArchitectureController(req, res) {
  const state = await architectureService.getArchitectureState(req.params.projectId);
  return res.status(200).json(state);
}

async function recommendArchitectureController(req, res) {
  try {
    const result = await architectureService.recommendArchitecture(req.params.projectId, req.user.id);
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof NoApprovedVersionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof InvalidArchitectureIdError) {
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

async function selectArchitectureController(req, res) {
  try {
    const result = await architectureService.selectArchitecture(
      req.params.projectId,
      req.user.id,
      req.body.architectureId
    );
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof InvalidArchitectureIdError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = {
  getCatalogController,
  getArchitectureController,
  recommendArchitectureController,
  selectArchitectureController,
};
