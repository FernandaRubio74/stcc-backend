const architectureService = require('./architecture.service');
const { InvalidArchitectureIdError } = require('./architecture.errors');
const { NoApprovedVersionError } = require('../data-model/data-model.errors');
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

function getCatalogController(req, res) {
  return res.status(200).json(architectureService.getCatalog());
}

async function getArchitectureController(req, res) {
  const state = await architectureService.getArchitectureState(req.params.projectId);
  return res.status(200).json(state);
}

async function recommendArchitectureController(req, res) {
  try {
    // "Ajustar con IA" (chatbot transversal): instruccion opcional en texto
    // libre (ej. "prefiero algo mas simple") que pesa en la recomendacion.
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : undefined;
    const result = await architectureService.recommendArchitecture(
      req.params.projectId,
      req.user.id,
      {},
      instruction || undefined
    );
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof NoApprovedVersionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof InvalidArchitectureIdError) {
      return res.status(502).json({ error: err.message });
    }
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'architecture', action: 'recommend', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
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
