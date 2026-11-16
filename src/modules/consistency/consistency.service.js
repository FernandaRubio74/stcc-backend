/**
 * Servicio del motor de validacion de consistencia (US-031).
 *
 * No persiste nada: recalcula las inconsistencias en caliente a partir del
 * estado vigente de cada etapa, asi que nunca puede quedar desincronizado
 * entre que algo cambia y que la validacion lo detecte.
 */
const defaultPrisma = require('../../database/client');
const { runAllRules } = require('./rules');
const { InconsistentProjectError } = require('./consistency.errors');

async function loadContext(projectId, prismaClient) {
  const [definition, dataModel, apiSpec, screenMap] = await Promise.all([
    prismaClient.projectDefinition.findUnique({ where: { projectId } }),
    prismaClient.dataModelVersion.findFirst({ where: { projectId, status: 'APPROVED' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.apiSpecVersion.findFirst({ where: { projectId, status: 'APPROVED' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.screenMap.findUnique({ where: { projectId } }),
  ]);

  return { definition, dataModel, apiSpec, screenMap };
}

/** T-031.1/T-031.2 - Corre todas las reglas de validacion cruzada contra el estado vigente del proyecto. */
async function checkConsistency(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const context = await loadContext(projectId, prismaClient);
  const issues = runAllRules(context);

  return { issues, isConsistent: issues.length === 0 };
}

/** T-031.3 - Guard reutilizable: lanza InconsistentProjectError (409) si hay inconsistencias sin resolver. */
async function assertConsistentOrThrow(projectId, deps = {}) {
  const { issues, isConsistent } = await checkConsistency(projectId, deps);
  if (!isConsistent) {
    throw new InconsistentProjectError(issues);
  }
  return { issues, isConsistent };
}

module.exports = { checkConsistency, assertConsistentOrThrow };
