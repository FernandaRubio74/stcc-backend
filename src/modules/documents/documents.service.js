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
const testingService = require('../testing/testing.service');
const { ARCHITECTURE_CATALOG } = require('../architecture/catalog');
const { buildSpecDocument } = require('./spec.template');
const { buildArchitectureDocument } = require('./architecture.template');
const { ProjectNotReadyError, DocumentNotFoundError, MissingDocumentsError } = require('./documents.errors');

const SPEC = 'SPEC';
const ARCHITECTURE = 'ARCHITECTURE';

const BUNDLE_FILENAMES = {
  [SPEC]: 'especificacion.md',
  [ARCHITECTURE]: 'arquitectura.md',
};

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

// Etiquetas para el mensaje de precondicion. Hallazgo H-06 de la revision
// transversal: el error decia solo "el proyecto todavia no esta listo" y el
// detalle venia en `blockers`, asi que quien consumiera la API (o leyera el
// log) no sabia QUE faltaba. Regla A: el mensaje tiene que decir cual falta.
const STAGE_LABELS = {
  definition: 'la definicion del producto',
  dataModel: 'el modelo de datos',
  apiSpec: 'la especificacion de API',
  screens: 'el mapa de pantallas',
  architecture: 'la arquitectura',
  testing: 'el plan de pruebas',
};

function describeNotReady(summary) {
  const pending = Object.entries(summary.stages)
    .filter(([, stage]) => !stage.complete)
    .map(([key]) => STAGE_LABELS[key] || key);

  const reasons = [];
  if (pending.length > 0) reasons.push(`falta generar ${pending.join(', ')}`);
  if (summary.blockingQuestions.length > 0) {
    reasons.push(`hay ${summary.blockingQuestions.length} pregunta(s) bloqueante(s) sin resolver`);
  }
  const errors = summary.inconsistencies.filter((issue) => issue.status !== 'advertencia');
  if (errors.length > 0) reasons.push(`hay ${errors.length} inconsistencia(s) entre etapas sin resolver`);

  if (reasons.length === 0) return 'El proyecto todavia no esta listo para generar la documentacion final';
  return `El proyecto todavia no esta listo para generar la documentacion final: ${reasons.join('; ')}`;
}

/** T-035.3 - Guard de precondicion: solo se genera si el proyecto esta listo (US-032). */
async function assertReadyOrThrow(projectId, deps = {}) {
  const summary = await reviewService.getReviewSummary(projectId, deps);

  if (!summary.readyToGenerate) {
    throw new ProjectNotReadyError(
      {
        stages: summary.stages,
        blockingQuestions: summary.blockingQuestions,
        inconsistencies: summary.inconsistencies,
      },
      describeNotReady(summary)
    );
  }

  return summary;
}

async function loadProjectContext(projectId, prismaClient, deps) {
  const [project, definition, dataModelState, apiSpecState, screenMapState, architecture, testPlanState] =
    await Promise.all([
      prismaClient.project.findUnique({ where: { id: projectId } }),
      prismaClient.projectDefinition.findUnique({ where: { projectId } }),
      dataModelService.getDataModelState(projectId, deps),
      apiSpecService.getApiSpecState(projectId, deps),
      screensService.getScreenMapState(projectId, deps),
      architectureService.getArchitectureState(projectId, deps),
      testingService.getTestPlanState(projectId, deps),
    ]);

  return {
    project,
    definition,
    dataModel: dataModelState.approved,
    apiSpec: apiSpecState.approved,
    screenMap: screenMapState.approved,
    architecture,
    testPlan: testPlanState.approved?.content ?? null,
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

/**
 * Camino comun de los dos documentos: precondicion, contexto, numero de
 * version y persistencia. Lo unico que cambia es la plantilla.
 */
async function generateDocument(kind, buildTemplate, projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  await assertReadyOrThrow(projectId, deps);

  const context = await loadProjectContext(projectId, prismaClient, deps);
  const versionNumber = await nextVersionNumber(prismaClient, projectId, kind);
  const content = buildTemplate({
    ...context,
    versionNumber,
    generatedAt: deps.now ? deps.now() : new Date(),
  });

  const created = await prismaClient.generatedDocument.create({
    data: { projectId, kind, versionNumber, content, createdById: userId },
  });

  return serializeDocument(created);
}

/** T-035.1/T-035.2 - Genera (versiona) el documento de especificacion del producto. */
function generateSpecDocument(projectId, userId, deps = {}) {
  return generateDocument(SPEC, buildSpecDocument, projectId, userId, deps);
}

/** T-036.1/T-036.2 - Genera (versiona) el documento de arquitectura definitiva. */
function generateArchitectureDocument(projectId, userId, deps = {}) {
  return generateDocument(ARCHITECTURE, buildArchitectureDocument, projectId, userId, deps);
}

/**
 * T-036.3 - Ultima version de cada documento, para la descarga conjunta. Si
 * falta alguno de los dos no se entrega un zip incompleto: es un 409 con el
 * detalle de que hay que generar.
 */
async function getBundleDocuments(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  const [spec, architecture] = await Promise.all(
    [SPEC, ARCHITECTURE].map((kind) =>
      prismaClient.generatedDocument.findFirst({
        where: { projectId, kind },
        orderBy: { versionNumber: 'desc' },
      })
    )
  );

  const faltantes = [
    spec ? null : 'especificacion del producto',
    architecture ? null : 'arquitectura definitiva',
  ].filter(Boolean);

  if (faltantes.length > 0) {
    throw new MissingDocumentsError(
      `Faltan documentos por generar antes de la descarga conjunta: ${faltantes.join(', ')}`
    );
  }

  return [spec, architecture].map((document) => ({
    filename: BUNDLE_FILENAMES[document.kind],
    content: document.content,
    kind: document.kind,
    versionNumber: document.versionNumber,
  }));
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

module.exports = {
  generateSpecDocument,
  generateArchitectureDocument,
  getBundleDocuments,
  listDocuments,
  getDocument,
  assertReadyOrThrow,
};
