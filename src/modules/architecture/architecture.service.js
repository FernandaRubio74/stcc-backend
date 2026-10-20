/**
 * Servicio de seleccion de arquitectura (US-028).
 *
 * Fila 1:1 por proyecto (no hay historial): `recommendedId`/`justification`
 * son lo ultimo que recomendo la IA, `selectedId` es la decision final del
 * usuario (puede coincidir con la recomendacion o ser una eleccion
 * explicita de otra opcion del catalogo fijo). Regenerar la recomendacion
 * nunca borra una seleccion ya hecha.
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const dataModelService = require('../data-model/data-model.service');
const { ARCHITECTURE_CATALOG } = require('./catalog');
const { ARCHITECTURE_SYSTEM_PROMPT, aiArchitectureRecommendationSchema, buildArchitectureUserContent } = require('./prompts');
const { InvalidArchitectureIdError } = require('./architecture.errors');

function serialize(row) {
  if (!row) {
    return { recommendedId: null, justification: null, selectedId: null, selectedAt: null, selectedById: null };
  }
  return {
    recommendedId: row.recommendedId,
    justification: row.justification,
    selectedId: row.selectedId,
    selectedAt: row.selectedAt,
    selectedById: row.selectedById,
  };
}

function getCatalog() {
  return ARCHITECTURE_CATALOG;
}

async function getArchitectureState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const row = await prismaClient.projectArchitecture.findUnique({ where: { projectId } });
  return serialize(row);
}

/** T-028.2 - La IA elige entre el catalogo fijo y justifica la eleccion. */
async function recommendArchitecture(projectId, _userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const dataModel = await dataModelService.getApprovedVersionOrThrow(projectId, deps);
  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};

  const apiSpecCount = await prismaClient.apiSpecVersion.findFirst({
    where: { projectId, status: 'APPROVED' },
    orderBy: { versionNumber: 'desc' },
  });

  const { recommendedId, justification } = await ai.requestStructuredJson({
    systemPrompt: ARCHITECTURE_SYSTEM_PROMPT,
    userContent: buildArchitectureUserContent({
      problemSummary: definition?.problemSummary,
      mvpScope,
      entityNames: dataModel.entities.map((entity) => entity.name),
      endpointCount: apiSpecCount?.endpoints?.length ?? 0,
      catalog: ARCHITECTURE_CATALOG,
    }),
    schema: aiArchitectureRecommendationSchema,
    maxOutputTokens: 1024,
  });

  if (!ARCHITECTURE_CATALOG.some((scenario) => scenario.id === recommendedId)) {
    throw new InvalidArchitectureIdError(
      `La IA recomendo un id de arquitectura que no existe en el catalogo: ${recommendedId}`
    );
  }

  const row = await prismaClient.projectArchitecture.upsert({
    where: { projectId },
    create: { projectId, recommendedId, justification },
    update: { recommendedId, justification },
  });

  return serialize(row);
}

/** T-028.3 - El usuario acepta la recomendacion o elige explicitamente otra opcion del catalogo. */
async function selectArchitecture(projectId, userId, architectureId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  if (!ARCHITECTURE_CATALOG.some((scenario) => scenario.id === architectureId)) {
    throw new InvalidArchitectureIdError(`"${architectureId}" no es un id de arquitectura valido`);
  }

  const row = await prismaClient.projectArchitecture.upsert({
    where: { projectId },
    create: { projectId, selectedId: architectureId, selectedAt: new Date(), selectedById: userId },
    update: { selectedId: architectureId, selectedAt: new Date(), selectedById: userId },
  });

  return serialize(row);
}

module.exports = { getCatalog, getArchitectureState, recommendArchitecture, selectArchitecture };
