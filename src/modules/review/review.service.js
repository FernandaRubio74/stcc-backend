/**
 * Servicio de revision consolidada (US-032): agrega el estado de cada
 * etapa, las decisiones clave y los bloqueos pendientes en una sola
 * llamada, para que el usuario pueda validar el proyecto completo antes
 * de intentar la generacion final (gateada por US-031).
 */
const defaultPrisma = require('../../database/client');
const definitionService = require('../definition/definition.service');
const dataModelService = require('../data-model/data-model.service');
const apiSpecService = require('../api-spec/api-spec.service');
const screensService = require('../screens/screens.service');
const architectureService = require('../architecture/architecture.service');
const testingService = require('../testing/testing.service');
const consistencyService = require('../consistency/consistency.service');

const GATING_STAGE_COUNT = 6;

/**
 * Carga el estado de las 6 etapas "gateadas" (definicion, modelo de datos,
 * API, pantallas, arquitectura, pruebas) sin correr el motor de consistencia
 * (que es la parte cara de getReviewSummary): lo usa tanto getReviewSummary
 * como el listado de proyectos (US-065), que necesita un progreso por
 * proyecto sin pagar el costo de una revision completa por cada fila.
 *
 * "pruebas" se considera completa solo con una version APROBADA: aprobar
 * exige que el DRAFT ya haya pasado la validacion de cobertura (ver
 * testing/coverage.js), asi que una version aprobada implica, por
 * construccion, que no quedo ningun requisito/endpoint/pantalla sin probar.
 */
async function loadGatingStages(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  const [definition, dataModelState, apiSpecState, screenMapState, architectureState, testPlanState] =
    await Promise.all([
      prismaClient.projectDefinition.findUnique({ where: { projectId } }),
      dataModelService.getDataModelState(projectId, deps),
      apiSpecService.getApiSpecState(projectId, deps),
      screensService.getScreenMapState(projectId, deps),
      architectureService.getArchitectureState(projectId, deps),
      testingService.getTestPlanState(projectId, deps),
    ]);

  const definitionComplete = definitionService.STAGE_ORDER.every((stage) =>
    definitionService.isStageDataComplete(stage, definition || {})
  );

  return {
    stages: {
      definition: { complete: definitionComplete, currentStage: definition?.currentStage ?? null },
      dataModel: { complete: Boolean(dataModelState.approved), versionNumber: dataModelState.approved?.versionNumber ?? null },
      apiSpec: { complete: Boolean(apiSpecState.approved), versionNumber: apiSpecState.approved?.versionNumber ?? null },
      screens: { complete: Boolean(screenMapState.approved), versionNumber: screenMapState.approved?.versionNumber ?? null },
      architecture: { complete: Boolean(architectureState.selectedId), selectedId: architectureState.selectedId },
      testing: { complete: Boolean(testPlanState.approved), versionNumber: testPlanState.approved?.versionNumber ?? null },
    },
    keyDecisions: {
      problemSummary: definition?.problemSummary ?? null,
      dataModelVersion: dataModelState.approved?.versionNumber ?? null,
      apiSpecVersion: apiSpecState.approved?.versionNumber ?? null,
      selectedArchitecture: architectureState.selectedId,
      screenMapVersion: screenMapState.approved?.versionNumber ?? null,
      testPlanVersion: testPlanState.approved?.versionNumber ?? null,
    },
  };
}

/**
 * Progreso liviano de un proyecto (US-065): cuantas de las 6 etapas
 * gateadas estan completas. Lo usa el listado de "Mis proyectos" para la
 * barra de progreso de cada tarjeta - antes ese dato no existia en absoluto
 * (ver Fase 0 de la auditoria de UI).
 */
async function computeStageProgress(projectId, deps = {}) {
  const { stages } = await loadGatingStages(projectId, deps);
  const completedStages = Object.values(stages).filter((stage) => stage.complete).length;
  return { completedStages, totalStages: GATING_STAGE_COUNT };
}

async function getReviewSummary(projectId, deps = {}) {
  const [{ stages, keyDecisions }, blockingQuestions, { issues: inconsistencies, isConsistent }] = await Promise.all([
    loadGatingStages(projectId, deps),
    definitionService.listBlockingQuestions(projectId, deps),
    consistencyService.checkConsistency(projectId, deps),
  ]);

  const allStagesComplete = Object.values(stages).every((stage) => stage.complete);
  const readyToGenerate = allStagesComplete && blockingQuestions.length === 0 && isConsistent;

  return { stages, keyDecisions, blockingQuestions, inconsistencies, readyToGenerate };
}

module.exports = { getReviewSummary, computeStageProgress };
