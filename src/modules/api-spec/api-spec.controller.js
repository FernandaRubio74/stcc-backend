const apiSpecService = require('./api-spec.service');
const { DraftNotFoundError, EndpointEntityMismatchError, NoCurrentContentError } = require('./api-spec.errors');
const { NoApprovedVersionError } = require('../data-model/data-model.errors');
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

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
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'api-spec', action: 'generate', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
    }
    throw err;
  }
}

async function refineApiSpecController(req, res) {
  try {
    const draft = await apiSpecService.refineApiSpec(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    if (err instanceof NoApprovedVersionError || err instanceof NoCurrentContentError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof EndpointEntityMismatchError) {
      return res.status(502).json({ error: err.message });
    }
    if (isAiFailure(err)) {
      logAiFailure(err, { stage: 'api-spec', action: 'refine', projectId: req.params.projectId });
      return res.status(500).json({ error: AI_UNAVAILABLE_MESSAGE });
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
  refineApiSpecController,
  updateEndpointsController,
  approveVersionController,
};
