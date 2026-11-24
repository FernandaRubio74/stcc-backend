/**
 * Servicio de la etapa "Pruebas" (entre Arquitectura y Revision final):
 * plan de pruebas + casos derivados de todo lo ya aprobado en las etapas
 * anteriores. Mismo invariante de versionado que data-model/api-spec: a lo
 * sumo un DRAFT por proyecto a la vez, las APPROVED son inmutables.
 *
 * A diferencia de esas dos etapas, aca la cobertura se valida SIEMPRE
 * (generar y editar a mano) contra los requisitos del MVP, los endpoints y
 * las pantallas reales del proyecto (ver coverage.js) - es el pedido
 * explicito de que no se pueda avanzar con algo sin probar.
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const dataModelService = require('../data-model/data-model.service');
const apiSpecService = require('../api-spec/api-spec.service');
const screensService = require('../screens/screens.service');
const architectureService = require('../architecture/architecture.service');
const { ARCHITECTURE_CATALOG } = require('../architecture/catalog');
const { testPlanContentSchema, aiTestPlanResponseSchema } = require('./schema');
const { TESTING_SYSTEM_PROMPT, buildTestingUserContent } = require('./prompts');
const { assertFullCoverageOrThrow, findCoverageGaps, hasCoverageGaps } = require('./coverage');
const { buildRefineUserContent } = require('../ai/refinePrompt');
const { InsufficientContextError, DraftNotFoundError, NoCurrentContentError } = require('./testing.errors');

function serializeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    content: version.content,
    createdAt: version.createdAt,
    createdById: version.createdById,
    approvedAt: version.approvedAt,
    approvedById: version.approvedById,
  };
}

async function getLatestVersion(prismaClient, projectId) {
  return prismaClient.testPlanVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: 'desc' },
  });
}

/**
 * Estado para el frontend: la version vigente (aprobada) y, si existe, la
 * que esta en edicion.
 *
 * `withCoverage` agrega `coverageGaps` al borrador, para que el aviso de
 * "falta cubrir estas pantallas/endpoints" sobreviva a un refresh y no
 * exista solo en la respuesta de generar. Es opcional a proposito: calcular
 * los huecos exige cargar el contexto aprobado de 4 etapas, y
 * `loadGatingStages` (review/listado de proyectos) llama a esta funcion por
 * cada proyecto, donde ese costo no se justifica.
 */
async function getTestPlanState(projectId, deps = {}, { withCoverage = false } = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest) {
    return { draft: null, approved: null };
  }
  if (latest.status === 'DRAFT') {
    const approved = await prismaClient.testPlanVersion.findFirst({
      where: { projectId, status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
    });
    const draft = serializeVersion(latest);
    if (withCoverage) {
      draft.coverageGaps = await computeCoverageGaps(projectId, latest.content, deps);
    }
    return { draft, approved: serializeVersion(approved) };
  }
  return { draft: null, approved: serializeVersion(latest) };
}

/**
 * Devuelve los huecos de cobertura, o null si no hay. Tolera que todavia
 * falte alguna etapa previa (sin contexto no hay nada que exigir).
 */
async function computeCoverageGaps(projectId, content, deps) {
  try {
    const context = await loadApprovedContext(projectId, deps);
    const gaps = findCoverageGaps(content, buildCoverageContext(context));
    return hasCoverageGaps(gaps) ? gaps : null;
  } catch {
    return null;
  }
}

/**
 * Contexto aprobado de las 4 etapas previas. Esta etapa va DESPUES de
 * Arquitectura, asi que exige las 4 (no solo el modelo de datos, como
 * api-spec): sin alguna de ellas no hay endpoints, pantallas o arquitectura
 * reales de las que derivar pruebas.
 */
async function loadApprovedContext(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const [definition, dataModelState, apiSpecState, screenMapState, architecture] = await Promise.all([
    prismaClient.projectDefinition.findUnique({ where: { projectId } }),
    dataModelService.getDataModelState(projectId, deps),
    apiSpecService.getApiSpecState(projectId, deps),
    screensService.getScreenMapState(projectId, deps),
    architectureService.getArchitectureState(projectId, deps),
  ]);

  return {
    definition,
    dataModel: dataModelState.approved,
    apiSpec: apiSpecState.approved,
    screenMap: screenMapState.approved,
    architecture,
    catalogEntry: ARCHITECTURE_CATALOG.find((entry) => entry.id === architecture?.selectedId) ?? null,
  };
}

function assertContextIsUsable({ dataModel, apiSpec, screenMap, architecture }) {
  const missing = [];
  if (!dataModel) missing.push('el modelo de datos aprobado');
  if (!apiSpec) missing.push('la especificacion de API aprobada');
  if (!screenMap) missing.push('el mapa de pantallas');
  if (!architecture?.selectedId) missing.push('la arquitectura confirmada');

  if (missing.length > 0) {
    throw new InsufficientContextError(
      `Todavia falta completar antes de generar el plan de pruebas: ${missing.join(', ')}`
    );
  }
}

function buildCoverageContext({ definition, apiSpec, screenMap }) {
  return {
    mvpScopeIn: definition?.mvpScope?.in || [],
    endpoints: apiSpec?.endpoints || [],
    screenNames: (screenMap?.screens || []).map((screen) => screen.name),
  };
}

async function persistDraft(prismaClient, projectId, userId, content) {
  const latest = await getLatestVersion(prismaClient, projectId);

  if (latest && latest.status === 'DRAFT') {
    const updated = await prismaClient.testPlanVersion.update({
      where: { id: latest.id },
      data: { content, createdById: userId },
    });
    return serializeVersion(updated);
  }

  const created = await prismaClient.testPlanVersion.create({
    data: {
      projectId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      content,
      createdById: userId,
    },
  });
  return serializeVersion(created);
}

/** Genera (o regenera, si ya hay un DRAFT) el plan de pruebas con la IA. */
/**
 * Guarda el borrador SIEMPRE y devuelve los huecos de cobertura como dato
 * (`coverageGaps`), en vez de descartar todo el plan generado.
 *
 * Bug reportado: si la IA se saltaba una pantalla ("Dashboard Owner",
 * "Inventario", "Registro de Ventas"), la generacion entera se tiraba con
 * un 409 y no se persistia nada - volver a generar era repetir la misma
 * loteria, sin forma de avanzar ni de corregir a mano lo que faltaba. El
 * hueco es real y hay que resolverlo, pero el lugar para exigirlo es la
 * APROBACION (que es lo que las etapas siguientes consumen), no el momento
 * de generar.
 */
async function persistDraftWithCoverage(prismaClient, projectId, userId, content, context) {
  const draft = await persistDraft(prismaClient, projectId, userId, content);
  const gaps = findCoverageGaps(content, buildCoverageContext(context));
  return { ...draft, coverageGaps: hasCoverageGaps(gaps) ? gaps : null };
}

async function generateTestPlan(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const context = await loadApprovedContext(projectId, deps);
  assertContextIsUsable(context);

  const { testPlan } = await ai.requestStructuredJson({
    systemPrompt: TESTING_SYSTEM_PROMPT,
    userContent: buildTestingUserContent(context),
    schema: aiTestPlanResponseSchema,
    maxOutputTokens: 16384,
  });

  return persistDraftWithCoverage(prismaClient, projectId, userId, testPlan, context);
}

/** "Ajustar con IA" (chatbot transversal) - ver data-model.service.js:refineDataModel para el mismo patron. */
async function refineTestPlan(projectId, userId, instruction, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const context = await loadApprovedContext(projectId, deps);
  assertContextIsUsable(context);

  const state = await getTestPlanState(projectId, deps);
  const current = state.draft ?? state.approved;
  if (!current) {
    throw new NoCurrentContentError(
      'Todavia no hay un plan de pruebas generado para ajustar - genera uno primero'
    );
  }

  const { testPlan } = await ai.requestStructuredJson({
    systemPrompt: TESTING_SYSTEM_PROMPT,
    userContent: buildRefineUserContent(buildTestingUserContent(context), current.content, instruction),
    schema: aiTestPlanResponseSchema,
    maxOutputTokens: 16384,
  });

  return persistDraftWithCoverage(prismaClient, projectId, userId, testPlan, context);
}

/** Edicion manual del DRAFT. Igual que al generar: se guarda y se informan los huecos. */
async function updateTestPlanContent(projectId, userId, content, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const parsed = testPlanContentSchema.parse(content);

  const context = await loadApprovedContext(projectId, deps);
  return persistDraftWithCoverage(prismaClient, projectId, userId, parsed, context);
}

/** Aprueba el DRAFT vigente: queda inmutable y es el que se usa en el documento final. */
async function approveVersion(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest || latest.status !== 'DRAFT') {
    throw new DraftNotFoundError('No hay una version en edicion para aprobar');
  }

  // La cobertura completa se exige ACA, no al generar: una version
  // aprobada es la que consumen las etapas siguientes y la revision final,
  // asi que "aprobado implica cobertura completa" tiene que seguir siendo
  // cierto. Generar con huecos ahora si se permite (ver
  // persistDraftWithCoverage), para no perder el plan y poder completarlo.
  const context = await loadApprovedContext(projectId, deps);
  assertFullCoverageOrThrow(latest.content, buildCoverageContext(context));

  const approved = await prismaClient.testPlanVersion.update({
    where: { id: latest.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
  });
  return serializeVersion(approved);
}

module.exports = {
  getTestPlanState,
  generateTestPlan,
  refineTestPlan,
  updateTestPlanContent,
  approveVersion,
};
