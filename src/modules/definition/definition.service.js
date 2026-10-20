/**
 * Servicio del wizard conversacional (US-015/US-016/US-017).
 *
 * Una sola conversacion por proyecto, dividida en etapas secuenciales
 * (`STAGE_ORDER`). Cada etapa tiene su propio historial de mensajes y su
 * propio set de preguntas bloqueantes: avanzar de etapa exige que no haya
 * bloqueos abiertos Y que los datos estructurados minimos de la etapa
 * existan (chequeo por reglas, independiente de lo que haya dicho la IA
 * en el ultimo turno — ver `isStageDataComplete`).
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const { getSystemPromptForStage } = require('./prompts');
const { StageBlockedError, NoNextStageError } = require('./definition.errors');

const STAGE_ORDER = ['PROBLEM_CONTEXT', 'TARGET_USERS_SCOPE'];

async function getOrCreateDefinition(projectId, prismaClient) {
  return prismaClient.projectDefinition.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
}

function serializeDefinition(definition) {
  return {
    currentStage: definition.currentStage,
    problemSummary: definition.problemSummary,
    targetUsers: definition.targetUsers,
    mvpScope: definition.mvpScope,
    userJourney: definition.userJourney,
    updatedAt: definition.updatedAt,
  };
}

// Solo copia los campos que la IA efectivamente devolvio: `undefined` hace
// que Prisma deje el valor existente intacto en vez de pisarlo con null.
function buildDefinitionUpdateFromExtracted(stage, extracted = {}) {
  if (stage === 'PROBLEM_CONTEXT') {
    return {
      problemSummary: typeof extracted.problemSummary === 'string' ? extracted.problemSummary : undefined,
    };
  }
  if (stage === 'TARGET_USERS_SCOPE') {
    return {
      targetUsers: Array.isArray(extracted.targetUsers) ? extracted.targetUsers : undefined,
      mvpScope:
        extracted.mvpScope && typeof extracted.mvpScope === 'object' ? extracted.mvpScope : undefined,
      userJourney: Array.isArray(extracted.userJourney) ? extracted.userJourney : undefined,
    };
  }
  return {};
}

// Chequeo por reglas (T-017.1): independiente de si la IA marco blocking
// questions, una etapa no se considera completa si sus campos minimos no
// estan poblados.
function isStageDataComplete(stage, definition) {
  if (stage === 'PROBLEM_CONTEXT') {
    return Boolean(definition.problemSummary && definition.problemSummary.trim().length > 0);
  }
  if (stage === 'TARGET_USERS_SCOPE') {
    const targetUsers = Array.isArray(definition.targetUsers) ? definition.targetUsers : [];
    const mvpScope = definition.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};
    const userJourney = Array.isArray(definition.userJourney) ? definition.userJourney : [];
    return targetUsers.length > 0 && Array.isArray(mvpScope.in) && mvpScope.in.length > 0 && userJourney.length > 0;
  }
  return false;
}

function describeMissingData(stage) {
  if (stage === 'PROBLEM_CONTEXT') {
    return 'Todavia no se definio con claridad el problema, el contexto y la situacion a mejorar';
  }
  if (stage === 'TARGET_USERS_SCOPE') {
    return 'Todavia falta definir los usuarios objetivo, el alcance del MVP o el recorrido principal';
  }
  return 'Falta informacion para completar esta etapa';
}

// Reconcilia las blocking questions persistidas de la etapa contra la lista
// que acaba de devolver la IA: resuelve las que ya no aparecen y crea las
// nuevas (sin duplicar por texto). Devuelve las que quedan abiertas.
async function reconcileBlockingQuestions(prismaClient, projectId, stage, aiBlockingQuestions) {
  const normalized = [...new Set(aiBlockingQuestions.map((q) => q.trim()).filter(Boolean))];

  const openRows = await prismaClient.blockingQuestion.findMany({
    where: { projectId, stage, resolvedAt: null },
  });

  const toResolve = openRows.filter((row) => !normalized.includes(row.question));
  const existingTexts = new Set(openRows.map((row) => row.question));
  const toCreate = normalized.filter((q) => !existingTexts.has(q));

  await Promise.all([
    ...toResolve.map((row) =>
      prismaClient.blockingQuestion.update({ where: { id: row.id }, data: { resolvedAt: new Date() } })
    ),
    ...toCreate.map((question) => prismaClient.blockingQuestion.create({ data: { projectId, stage, question } })),
  ]);

  return prismaClient.blockingQuestion.findMany({
    where: { projectId, stage, resolvedAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * T-015.3 - Estado completo del wizard: etapa actual, datos estructurados,
 * historial completo (todas las etapas) y preguntas bloqueantes abiertas.
 * Permite retomar la conversacion exactamente donde se dejo.
 */
async function getDefinitionState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const definition = await getOrCreateDefinition(projectId, prismaClient);

  const [messages, blockingQuestions] = await Promise.all([
    prismaClient.definitionMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, stage: true, role: true, content: true, createdAt: true },
    }),
    prismaClient.blockingQuestion.findMany({
      where: { projectId, resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, stage: true, question: true, createdAt: true },
    }),
  ]);

  return { ...serializeDefinition(definition), messages, blockingQuestions };
}

/**
 * T-015.2/T-016.1-3/T-017.1 - Procesa un turno del wizard: persiste el
 * mensaje del usuario, llama a la IA con el historial de la etapa actual,
 * persiste la respuesta, actualiza los datos estructurados y reconcilia las
 * preguntas bloqueantes de la etapa.
 */
async function postMessage({ projectId, userId, content }, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const definition = await getOrCreateDefinition(projectId, prismaClient);
  const stage = definition.currentStage;

  const history = await prismaClient.definitionMessage.findMany({
    where: { projectId, stage },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });

  await prismaClient.definitionMessage.create({
    data: { projectId, stage, role: 'user', content, createdById: userId },
  });

  const result = await ai.requestStructuredTurn({
    systemPrompt: getSystemPromptForStage(stage),
    messages: [...history, { role: 'user', content }],
  });

  await prismaClient.definitionMessage.create({
    data: { projectId, stage, role: 'assistant', content: result.reply },
  });

  const updatedDefinition = await prismaClient.projectDefinition.update({
    where: { projectId },
    data: buildDefinitionUpdateFromExtracted(stage, result.extracted),
  });

  const openBlockingQuestions = await reconcileBlockingQuestions(
    prismaClient,
    projectId,
    stage,
    result.blockingQuestions
  );

  return {
    stage,
    reply: result.reply,
    stageComplete: result.stageComplete,
    blockingQuestions: openBlockingQuestions.map((q) => q.question),
    definition: serializeDefinition(updatedDefinition),
  };
}

/** T-017.3 - Preguntas bloqueantes abiertas del proyecto, en cualquier etapa. */
async function listBlockingQuestions(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  return prismaClient.blockingQuestion.findMany({
    where: { projectId, resolvedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, stage: true, question: true, createdAt: true },
  });
}

/**
 * T-017.2 - Avanza a la siguiente etapa si no hay bloqueos (ni de la IA ni
 * de las reglas de completitud); 409 (via StageBlockedError) en caso
 * contrario.
 */
async function advanceStage(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const definition = await getOrCreateDefinition(projectId, prismaClient);
  const stage = definition.currentStage;

  const openQuestions = await prismaClient.blockingQuestion.findMany({
    where: { projectId, stage, resolvedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (openQuestions.length > 0) {
    throw new StageBlockedError(
      'No se puede avanzar de etapa: hay preguntas bloqueantes sin resolver',
      openQuestions.map((q) => q.question)
    );
  }

  if (!isStageDataComplete(stage, definition)) {
    throw new StageBlockedError('No se puede avanzar de etapa: todavia falta informacion de esta etapa', [
      describeMissingData(stage),
    ]);
  }

  const nextIndex = STAGE_ORDER.indexOf(stage) + 1;
  if (nextIndex >= STAGE_ORDER.length) {
    throw new NoNextStageError('Ya se completaron todas las etapas definidas');
  }

  const updated = await prismaClient.projectDefinition.update({
    where: { projectId },
    data: { currentStage: STAGE_ORDER[nextIndex] },
  });

  return serializeDefinition(updated);
}

module.exports = {
  STAGE_ORDER,
  getDefinitionState,
  postMessage,
  listBlockingQuestions,
  advanceStage,
  isStageDataComplete,
};
