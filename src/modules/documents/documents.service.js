/**
 * Servicio de documentos finales (US-035).
 *
 * Dos decisiones centrales:
 *
 * 1. La generacion es **deterministica**: se arma a partir del estado ya
 *    aprobado de cada etapa (ver spec.template.js). La IA no participa, asi
 *    que el mismo proyecto genera siempre el mismo documento.
 * 2. La precondicion se delega a la revision consolidada de US-032
 *    (`readyToGenerate`) en vez de recalcular reglas aca: una sola fuente de
 *    verdad para "el proyecto esta listo" (etapas completas + sin preguntas
 *    bloqueantes + sin inconsistencias).
 *
 * Regenerar no sobreescribe: crea una version nueva por tipo de documento,
 * porque US-037 pide poder consultar el historial.
 */
const defaultPrisma = require('../../database/client');
const reviewService = require('../review/review.service');
const dataModelService = require('../data-model/data-model.service');
const apiSpecService = require('../api-spec/api-spec.service');
const screensService = require('../screens/screens.service');
const architectureService = require('../architecture/architecture.service');
const { ARCHITECTURE_CATALOG } = require('../architecture/catalog');
const { buildSpecDocument } = require('./spec.template');
const { ProjectNotReadyError, DocumentNotFoundError } = require('./documents.errors');

const SPEC = 'SPEC';

const LIST_FIELDS = {
  id: true,
  kind: true,
  versionNumber: true,
  createdAt: true,
  createdById: true,
};

function serializeDocument(document) {
  if (!document) return null;
  return {
    id: document.id,
    kind: document.kind,
    versionNumber: document.versionNumber,
    content: document.content,
    createdAt: document.createdAt,
    createdById: document.createdById,
  };
}

/** T-035.3 - Guard de precondicion: solo se genera si el proyecto esta listo (US-032). */
async function assertReadyOrThrow(projectId, deps = {}) {
  const summary = await reviewService.getReviewSummary(projectId, deps);

  if (!summary.readyToGenerate) {
    throw new ProjectNotReadyError({
      stages: summary.stages,
      blockingQuestions: summary.blockingQuestions,
      inconsistencies: summary.inconsistencies,
    });
  }

  return summary;
}

async function loadProjectContext(projectId, prismaClient, deps) {
  const [project, definition, dataModelState, apiSpecState, screenMap, architecture] = await Promise.all([
    prismaClient.project.findUnique({ where: { id: projectId } }),
    prismaClient.projectDefinition.findUnique({ where: { projectId } }),
    dataModelService.getDataModelState(projectId, deps),
    apiSpecService.getApiSpecState(projectId, deps),
    screensService.getScreenMapState(projectId, deps),
    architectureService.getArchitectureState(projectId, deps),
  ]);

  return {
    project,
    definition,
    dataModel: dataModelState.approved,
    apiSpec: apiSpecState.approved,
    screenMap,
    architecture,
    catalogEntry: ARCHITECTURE_CATALOG.find((entry) => entry.id === architecture?.selectedId) ?? null,
  };
}

async function nextVersionNumber(prismaClient, projectId, kind) {
  const latest = await prismaClient.generatedDocument.findFirst({
    where: { projectId, kind },
    orderBy: { versionNumber: 'desc' },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/** T-035.1/T-035.2 - Genera (versiona) el documento de especificacion del producto. */
async function generateSpecDocument(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  await assertReadyOrThrow(projectId, deps);

  const context = await loadProjectContext(projectId, prismaClient, deps);
  const versionNumber = await nextVersionNumber(prismaClient, projectId, SPEC);
  const content = buildSpecDocument({
    ...context,
    versionNumber,
    generatedAt: deps.now ? deps.now() : new Date(),
  });

  const created = await prismaClient.generatedDocument.create({
    data: { projectId, kind: SPEC, versionNumber, content, createdById: userId },
  });

  return serializeDocument(created);
}

/** Historial de versiones generadas (sin el contenido: lo pide US-037 por separado). */
async function listDocuments(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  return prismaClient.generatedDocument.findMany({
    where: { projectId },
    orderBy: [{ kind: 'asc' }, { versionNumber: 'desc' }],
    select: LIST_FIELDS,
  });
}

/**
 * El `projectId` va en el where (no solo el id) a proposito: impide leer un
 * documento de otro proyecto conociendo su id.
 */
async function getDocument(projectId, documentId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const document = await prismaClient.generatedDocument.findFirst({
    where: { id: documentId, projectId },
  });

  if (!document) {
    throw new DocumentNotFoundError('El documento solicitado no existe en este proyecto');
  }

  return serializeDocument(document);
}

module.exports = { generateSpecDocument, listDocuments, getDocument, assertReadyOrThrow };
