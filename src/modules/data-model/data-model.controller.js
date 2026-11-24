const dataModelService = require('./data-model.service');
const { InsufficientDefinitionError, DraftNotFoundError, NoCurrentContentError } = require('./data-model.errors');
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

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
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'data-model', action: 'generate', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
    }
    throw err;
  }
}

async function refineDataModelController(req, res) {
  try {
    const draft = await dataModelService.refineDataModel(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    if (err instanceof InsufficientDefinitionError || err instanceof NoCurrentContentError) {
      return res.status(409).json({ error: err.message });
    }
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'data-model', action: 'refine', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
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
  refineDataModelController,
  updateEntitiesController,
  approveVersionController,
};
