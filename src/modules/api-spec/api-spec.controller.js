const apiSpecService = require('./api-spec.service');
const { DraftNotFoundError, EndpointEntityMismatchError } = require('./api-spec.errors');
const { NoApprovedVersionError } = require('../data-model/data-model.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

async function getApiSpecController(req, res) {
  const state = await apiSpecService.getApiSpecState(req.params.projectId);
  return res.status(200).json(state);
}

async function generateApiSpecController(req, res) {
  try {
    const draft = await apiSpecService.generateApiSpec(req.params.projectId, req.user.id);
    return res.status(201).json(draft);
  } catch (err) {
    if (err instanceof NoApprovedVersionError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof EndpointEntityMismatchError) {
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

async function updateEndpointsController(req, res) {
  try {
    const draft = await apiSpecService.updateEndpoints(req.params.projectId, req.user.id, req.body.endpoints);
    return res.status(200).json(draft);
  } catch (err) {
    if (err instanceof NoApprovedVersionError || err instanceof EndpointEntityMismatchError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

async function approveVersionController(req, res) {
  try {
    const approved = await apiSpecService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    if (err instanceof DraftNotFoundError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = {
  getApiSpecController,
  generateApiSpecController,
  updateEndpointsController,
  approveVersionController,
};
