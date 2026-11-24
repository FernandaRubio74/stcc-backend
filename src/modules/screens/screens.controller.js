const screensService = require('./screens.service');
const {
  NoApprovedApiSpecError,
  MvpCoverageError,
  ScreenReferenceError,
  RoleCoverageError,
  InvalidNavigationError,
  DraftNotFoundError,
  NoCurrentContentError,
} = require('./screens.errors');
const { NoApprovedVersionError } = require('../data-model/data-model.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

function handleDomainErrors(err) {
  if (
    err instanceof NoApprovedApiSpecError ||
    err instanceof NoApprovedVersionError ||
    err instanceof DraftNotFoundError ||
    err instanceof NoCurrentContentError
  ) {
    return { status: 409, body: { error: err.message } };
  }
  if (
    err instanceof MvpCoverageError ||
    err instanceof ScreenReferenceError ||
    err instanceof RoleCoverageError ||
    err instanceof InvalidNavigationError
  ) {
    return { status: 502, body: { error: err.message } };
  }
  if (err instanceof AiTimeoutError || err instanceof AiProviderError || err instanceof AiResponseValidationError) {
    return { status: 500, body: { error: 'El asistente de IA no esta disponible en este momento, intenta de nuevo' } };
  }
  return null;
}

async function getScreenMapController(req, res) {
  const state = await screensService.getScreenMapState(req.params.projectId);
  return res.status(200).json(state);
}

async function generateScreenMapController(req, res) {
  try {
    const draft = await screensService.generateScreenMap(req.params.projectId, req.user.id);
    return res.status(201).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function refineScreensController(req, res) {
  try {
    const draft = await screensService.refineScreens(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function updateScreensController(req, res) {
  try {
    const draft = await screensService.updateScreens(
      req.params.projectId,
      req.user.id,
      req.body.screens,
      req.body.navigation
    );
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function approveVersionController(req, res) {
  try {
    const approved = await screensService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

module.exports = {
  getScreenMapController,
  generateScreenMapController,
  refineScreensController,
  updateScreensController,
  approveVersionController,
};
