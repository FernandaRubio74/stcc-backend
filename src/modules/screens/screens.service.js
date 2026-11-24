/**
 * Servicio del mapa de pantallas (US-027).
 *
 * Mismo invariante que data-model/api-spec: a lo sumo un DRAFT por
 * proyecto a la vez, las APPROVED son inmutables, editar actualiza el
 * DRAFT existente in place o crea una version nueva si la ultima esta
 * APPROVED. Depende de que existan versiones APROBADAS del modelo de
 * datos Y de la API (no solo la API, como antes): "dataField"/"endpointRef"
 * de cada elemento se validan contra ambas (ver coherence.js).
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const dataModelService = require('../data-model/data-model.service');
const apiSpecService = require('../api-spec/api-spec.service');
const { generateNavigationFlowchart } = require('./flowchart');
const { validateRoleCoverage } = require('./coverage');
const { validateScreenReferences } = require('./coherence');
const { aiScreenMapResponseSchema, screensSchema, navigationSchema } = require('./screen.schema');
const { SCREEN_MAP_SYSTEM_PROMPT, buildScreenMapUserContent } = require('./prompts');
const { buildRefineUserContent } = require('../ai/refinePrompt');
const {
  NoApprovedApiSpecError,
  InvalidNavigationError,
  DraftNotFoundError,
  NoCurrentContentError,
} = require('./screens.errors');

function serializeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    screens: version.screens,
    navigation: version.navigation,
    // Mismo criterio que data-model.service.js: el diagrama se re-deriva al
    // leer en vez de devolver el texto persistido, asi una version guardada
    // con un flowchart invalido (ej. un nombre de pantalla con comillas) se
    // sana sola, sin migracion.
    diagram: generateNavigationFlowchart(version.screens || [], version.navigation || []),
    createdAt: version.createdAt,
    createdById: version.createdById,
    approvedAt: version.approvedAt,
    approvedById: version.approvedById,
  };
}

async function getLatestVersion(prismaClient, projectId) {
  return prismaClient.screenMapVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: 'desc' },
  });
}

async function getScreenMapState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest) {
    return { draft: null, approved: null };
  }
  if (latest.status === 'DRAFT') {
    const approved = await prismaClient.screenMapVersion.findFirst({
      where: { projectId, status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
    });
    return { draft: serializeVersion(latest), approved: serializeVersion(approved) };
  }
  return { draft: null, approved: serializeVersion(latest) };
}

async function loadApprovedContext(projectId, deps) {
  const dataModel = await dataModelService.getApprovedVersionOrThrow(projectId, deps);
  const apiSpecState = await apiSpecService.getApiSpecState(projectId, deps);
  if (!apiSpecState.approved) {
    throw new NoApprovedApiSpecError(
      'El proyecto todavia no tiene una version aprobada de la especificacion de API'
    );
  }
  return { dataModel, apiSpec: apiSpecState.approved };
}

/**
 * Solo validaciones ESTRUCTURALES y exactas, que son las unicas que pueden
 * bloquear con certeza (hallazgo H-04 de la revision transversal): la
 * cobertura MVP<->pantallas se decidia por coincidencia de palabras sobre
 * texto libre y bloqueaba generaciones correctas, asi que dejo de ser un
 * gate (sigue disponible como diagnostico en coverage.js:
 * findUncoveredMvpFeatures). La fuga de alcance la detecta el motor de
 * consistencia por artefacto individual antes de la generacion final.
 */
function validateScreenMap(screens, navigation, { dataModel, apiSpec }) {
  validateRoleCoverage(screens);
  validateScreenReferences(screens, { entities: dataModel.entities, endpoints: apiSpec.endpoints });
  // "from"/"to" de navigation deben ser pantallas reales (igual chequeo
  // que ya hacia flowchart.js implicitamente al generar el diagrama, pero
  // ahora explicito y antes de persistir nada).
  const screenNames = new Set(screens.map((s) => s.name));
  const invalidEdges = navigation.filter((edge) => !screenNames.has(edge.from) || !screenNames.has(edge.to));
  if (invalidEdges.length > 0) {
    throw new InvalidNavigationError(
      `La navegacion referencia pantallas que no existen: ${invalidEdges.map((e) => `${e.from} -> ${e.to}`).join(', ')}`
    );
  }
}

async function persistDraft(prismaClient, projectId, userId, screens, navigation) {
  const diagram = generateNavigationFlowchart(screens, navigation);
  const latest = await getLatestVersion(prismaClient, projectId);

  if (latest && latest.status === 'DRAFT') {
    const updated = await prismaClient.screenMapVersion.update({
      where: { id: latest.id },
      data: { screens, navigation, diagram, createdById: userId },
    });
    return serializeVersion(updated);
  }

  const created = await prismaClient.screenMapVersion.create({
    data: {
      projectId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      screens,
      navigation,
      diagram,
      createdById: userId,
    },
  });
  return serializeVersion(created);
}

/** T-027.1-3 - Genera (o regenera) el mapa de pantallas a partir del MVP y el modelo/API aprobados. */
async function generateScreenMap(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const { dataModel, apiSpec } = await loadApprovedContext(projectId, deps);
  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};

  const { screens, navigation } = await ai.requestStructuredJson({
    systemPrompt: SCREEN_MAP_SYSTEM_PROMPT,
    userContent: buildScreenMapUserContent({ mvpScope, entities: dataModel.entities, endpoints: apiSpec.endpoints }),
    schema: aiScreenMapResponseSchema,
    maxOutputTokens: 16384,
  });

  validateScreenMap(screens, navigation, { mvpScope, dataModel, apiSpec });
  return persistDraft(prismaClient, projectId, userId, screens, navigation);
}

/** "Ajustar con IA" (chatbot transversal) - ver data-model.service.js:refineDataModel para el mismo patron. */
async function refineScreens(projectId, userId, instruction, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const { dataModel, apiSpec } = await loadApprovedContext(projectId, deps);
  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};

  const state = await getScreenMapState(projectId, deps);
  const current = state.draft ?? state.approved;
  if (!current) {
    throw new NoCurrentContentError(
      'Todavia no hay un mapa de pantallas generado para ajustar - genera uno primero'
    );
  }

  const { screens, navigation } = await ai.requestStructuredJson({
    systemPrompt: SCREEN_MAP_SYSTEM_PROMPT,
    userContent: buildRefineUserContent(
      buildScreenMapUserContent({ mvpScope, entities: dataModel.entities, endpoints: apiSpec.endpoints }),
      { screens: current.screens, navigation: current.navigation },
      instruction
    ),
    schema: aiScreenMapResponseSchema,
    maxOutputTokens: 16384,
  });

  validateScreenMap(screens, navigation, { mvpScope, dataModel, apiSpec });
  return persistDraft(prismaClient, projectId, userId, screens, navigation);
}

/** Edicion manual del DRAFT, revalidada contra el modelo/API/MVP/roles vigentes. */
async function updateScreens(projectId, userId, screens, navigation, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const parsedScreens = screensSchema.parse(screens);
  const parsedNavigation = navigationSchema.parse(navigation);

  const { dataModel, apiSpec } = await loadApprovedContext(projectId, deps);
  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : {};

  validateScreenMap(parsedScreens, parsedNavigation, { mvpScope, dataModel, apiSpec });
  return persistDraft(prismaClient, projectId, userId, parsedScreens, parsedNavigation);
}

/** Aprueba el DRAFT vigente: queda inmutable y es el que usan Pruebas y los documentos finales. */
async function approveVersion(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest || latest.status !== 'DRAFT') {
    throw new DraftNotFoundError('No hay una version en edicion para aprobar');
  }

  const approved = await prismaClient.screenMapVersion.update({
    where: { id: latest.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
  });
  return serializeVersion(approved);
}

module.exports = {
  getScreenMapState,
  generateScreenMap,
  refineScreens,
  updateScreens,
  approveVersion,
};
