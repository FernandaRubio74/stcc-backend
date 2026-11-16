const dataModelService = require('./data-model.service');
const { InsufficientDefinitionError, DraftNotFoundError } = require('./data-model.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

async function getDataModelController(req, res) {
  const state = await dataModelService.getDataModelState(req.params.projectId);
  return res.status(200).json(state);
}

async function generateDataModelController(req, res) {
  try {
    const draft = await dataModelService.generateDataModel(req.params.projectId, req.user.id);
    return res.status(201).json(draft);
  } catch (err) {
    if (err instanceof InsufficientDefinitionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof AiTimeoutError || err instanceof AiProviderError || err instanceof AiResponseValidationError) {
      return res
        .status(500)
        .json({ error: 'El asistente de IA no esta disponible en este momento, intenta de nuevo' });
    }
    throw err;
  }
}

async function updateEntitiesController(req, res) {
  const draft = await dataModelService.updateEntities(req.params.projectId, req.user.id, req.body.entities);
  return res.status(200).json(draft);
}

async function approveVersionController(req, res) {
  try {
    const approved = await dataModelService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    if (err instanceof DraftNotFoundError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = {
  getDataModelController,
  generateDataModelController,
  updateEntitiesController,
  approveVersionController,
};
