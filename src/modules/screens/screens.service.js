/**
 * Servicio del mapa de pantallas (US-027).
 *
 * A diferencia de data-model/api-spec, no hay ciclo DRAFT/APPROVED: el DoD
 * no pide historial ni aprobacion para esta etapa, asi que es una fila
 * 1:1 por proyecto que se sobreescribe al regenerar.
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const apiSpecService = require('../api-spec/api-spec.service');
const { generateNavigationFlowchart } = require('./flowchart');
const { validateMvpCoverage } = require('./coverage');
const { aiScreenMapResponseSchema } = require('./screen.schema');
const { SCREEN_MAP_SYSTEM_PROMPT, buildScreenMapUserContent } = require('./prompts');
const { NoApprovedApiSpecError } = require('./screens.errors');

function serializeScreenMap(screenMap) {
  if (!screenMap) return null;
  return {
    screens: screenMap.screens,
    navigation: screenMap.navigation,
    diagram: screenMap.diagram,
    createdAt: screenMap.createdAt,
    updatedAt: screenMap.updatedAt,
    createdById: screenMap.createdById,
  };
}

async function getScreenMapState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const screenMap = await prismaClient.screenMap.findUnique({ where: { projectId } });
  return serializeScreenMap(screenMap);
}

/** T-027.1-3 - Genera (o regenera) el mapa de pantallas a partir del MVP y la API aprobada. */
async function generateScreenMap(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const apiSpec = await apiSpecService.getApiSpecState(projectId, deps);
  if (!apiSpec.approved) {
    throw new NoApprovedApiSpecError(
      'El proyecto todavia no tiene una version aprobada de la especificacion de API'
    );
  }

  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};

  const { screens, navigation } = await ai.requestStructuredJson({
    systemPrompt: SCREEN_MAP_SYSTEM_PROMPT,
    userContent: buildScreenMapUserContent({ mvpScope, endpoints: apiSpec.approved.endpoints }),
    schema: aiScreenMapResponseSchema,
    maxOutputTokens: 4096,
  });

  validateMvpCoverage(screens, mvpScope);
  const diagram = generateNavigationFlowchart(screens, navigation);

  const screenMap = await prismaClient.screenMap.upsert({
    where: { projectId },
    create: { projectId, screens, navigation, diagram, createdById: userId },
    update: { screens, navigation, diagram, createdById: userId },
  });

  return serializeScreenMap(screenMap);
}

module.exports = { getScreenMapState, generateScreenMap };
