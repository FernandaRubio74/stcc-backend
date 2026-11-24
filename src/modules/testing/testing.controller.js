const testingService = require('./testing.service');
const {
  InsufficientContextError,
  DraftNotFoundError,
  CoverageGapError,
  NoCurrentContentError,
} = require('./testing.errors');
const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure } = require('../ai/aiFailure');

// `context` solo lo usa la rama de fallas de IA, para que la linea de log
// diga en que accion de la etapa se corto (ver ai/aiFailure.js).
function handleDomainErrors(err, context = {}) {
  if (err instanceof InsufficientContextError) {
    return { status: 409, body: { error: err.message } };
  }
  if (err instanceof CoverageGapError) {
    return { status: 409, body: { error: err.message, gaps: err.gaps } };
  }
  if (err instanceof DraftNotFoundError || err instanceof NoCurrentContentError) {
    return { status: 409, body: { error: err.message } };
  }
  if (isAiFailure(err)) {
    logAiFailure(err, { stage: 'testing', ...context });
    return { status: 500, body: { error: AI_UNAVAILABLE_MESSAGE } };
  }
  return null;
}

async function getTestPlanController(req, res) {
  // Con cobertura: la pagina de la etapa necesita saber que falta cubrir
  // antes de poder aprobar, y ese aviso tiene que sobrevivir a un refresh.
  const state = await testingService.getTestPlanState(req.params.projectId, {}, { withCoverage: true });
  return res.status(200).json(state);
}

async function generateTestPlanController(req, res) {
  try {
    const draft = await testingService.generateTestPlan(req.params.projectId, req.user.id);
    return res.status(201).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'generate', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function refineTestPlanController(req, res) {
  try {
    const draft = await testingService.refineTestPlan(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'refine', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function updateContentController(req, res) {
  try {
    const draft = await testingService.updateTestPlanContent(req.params.projectId, req.user.id, req.body.content);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'update', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function approveVersionController(req, res) {
  try {
    const approved = await testingService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    const handled = handleDomainErrors(err, { action: 'approve', projectId: req.params.projectId });
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

module.exports = {
  getTestPlanController,
  generateTestPlanController,
  refineTestPlanController,
  updateContentController,
  approveVersionController,
};
