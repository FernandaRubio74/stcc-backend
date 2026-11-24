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
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

// `context` solo lo usa la rama de fallas de IA, para que la linea de log
// diga en que accion de la etapa se corto (ver ai/aiFailure.js).
function handleDomainErrors(err, context = {}) {
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
  if (isAiFailure(err)) {
    logAiFailure(err, { stage: 'screens', ...context });
    return { status: 500, body: { error: AI_UNAVAILABLE_MESSAGE } };
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
    const handled = handleDomainErrors(err, { action: 'generate', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function refineScreensController(req, res) {
  try {
    const draft = await screensService.refineScreens(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'refine', projectId: req.params.projectId });
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
    const handled = handleDomainErrors(err, { action: 'update', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function approveVersionController(req, res) {
  try {
    const approved = await screensService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'approve', projectId: req.params.projectId });
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
