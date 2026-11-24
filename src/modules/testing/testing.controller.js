const testingService = require('./testing.service');
const {
  InsufficientContextError,
  DraftNotFoundError,
  CoverageGapError,
  NoCurrentContentError,
} = require('./testing.errors');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../ai/ai.errors');

function handleDomainErrors(err) {
  if (err instanceof InsufficientContextError) {
    return { status: 409, body: { error: err.message } };
  }
  if (err instanceof CoverageGapError) {
    return { status: 409, body: { error: err.message, gaps: err.gaps } };
  }
  if (err instanceof DraftNotFoundError || err instanceof NoCurrentContentError) {
    return { status: 409, body: { error: err.message } };
  }
  if (err instanceof AiTimeoutError || err instanceof AiProviderError || err instanceof AiResponseValidationError) {
    return { status: 500, body: { error: 'El asistente de IA no esta disponible en este momento, intenta de nuevo' } };
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
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function refineTestPlanController(req, res) {
  try {
    const draft = await testingService.refineTestPlan(req.params.projectId, req.user.id, req.body.instruction);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function updateContentController(req, res) {
  try {
    const draft = await testingService.updateTestPlanContent(req.params.projectId, req.user.id, req.body.content);
    return res.status(200).json(draft);
  } catch (err) {
    const handled = handleDomainErrors(err);
    if (handled) return res.status(handled.status).json(handled.body);
    throw err;
  }
}

async function approveVersionController(req, res) {
  try {
    const approved = await testingService.approveVersion(req.params.projectId, req.user.id);
    return res.status(200).json(approved);
  } catch (err) {
    const handled = handleDomainErrors(err);
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
