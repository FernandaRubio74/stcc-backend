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
const consistencyService = require('../consistency/consistency.service');

async function getReviewSummary(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;

  const [
    definition,
    dataModelState,
    apiSpecState,
    screenMapState,
    architectureState,
    blockingQuestions,
    { issues: inconsistencies, isConsistent },
  ] = await Promise.all([
    prismaClient.projectDefinition.findUnique({ where: { projectId } }),
    dataModelService.getDataModelState(projectId, deps),
    apiSpecService.getApiSpecState(projectId, deps),
    screensService.getScreenMapState(projectId, deps),
    architectureService.getArchitectureState(projectId, deps),
    definitionService.listBlockingQuestions(projectId, deps),
    consistencyService.checkConsistency(projectId, deps),
  ]);

  const definitionComplete = definitionService.STAGE_ORDER.every((stage) =>
    definitionService.isStageDataComplete(stage, definition || {})
  );

  const stages = {
    definition: { complete: definitionComplete, currentStage: definition?.currentStage ?? null },
    dataModel: { complete: Boolean(dataModelState.approved), versionNumber: dataModelState.approved?.versionNumber ?? null },
    apiSpec: { complete: Boolean(apiSpecState.approved), versionNumber: apiSpecState.approved?.versionNumber ?? null },
    screens: { complete: Boolean(screenMapState) },
    architecture: { complete: Boolean(architectureState.selectedId), selectedId: architectureState.selectedId },
  };

  const keyDecisions = {
    problemSummary: definition?.problemSummary ?? null,
    dataModelVersion: dataModelState.approved?.versionNumber ?? null,
    apiSpecVersion: apiSpecState.approved?.versionNumber ?? null,
    selectedArchitecture: architectureState.selectedId,
  };

  const allStagesComplete = Object.values(stages).every((stage) => stage.complete);
  const readyToGenerate = allStagesComplete && blockingQuestions.length === 0 && isConsistent;

  return { stages, keyDecisions, blockingQuestions, inconsistencies, readyToGenerate };
}

module.exports = { getReviewSummary };
