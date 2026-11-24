/**
 * Servicio del motor de validacion de consistencia (US-031).
 *
 * No persiste nada: recalcula las inconsistencias en caliente a partir del
 * estado vigente de cada etapa, asi que nunca puede quedar desincronizado
 * entre que algo cambia y que la validacion lo detecte.
 *
 * Solo mira versiones APROBADAS: un borrador es trabajo en curso, no el
 * estado vigente del proyecto. Eso significa que ajustar una etapa con IA
 * no mueve la aguja hasta aprobar el borrador, y la respuesta lo dice
 * explicitamente en `pendingApproval` para que la interfaz lo avise (antes
 * el usuario ajustaba, veia el mismo hallazgo y parecia que no se habia
 * aplicado nada).
 *
 * Estados (regla D): ok | pendiente | advertencia | error. SOLO `error`
 * bloquea la generacion final. `pendiente` significa "todavia no se puede
 * comprobar porque falta generar una etapa", nunca un problema.
 */
const defaultPrisma = require('../../database/client');
const { evaluateRules, artifactPresence, STATUS, RULE_STAGES, STAGE_LABELS } = require('./rules');
const { InconsistentProjectError } = require('./consistency.errors');

async function loadContext(projectId, prismaClient) {
  const [definition, dataModel, apiSpec, screenMap, dataModelDraft, apiSpecDraft, screenMapDraft] = await Promise.all([
    prismaClient.projectDefinition.findUnique({ where: { projectId } }),
    prismaClient.dataModelVersion.findFirst({ where: { projectId, status: 'APPROVED' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.apiSpecVersion.findFirst({ where: { projectId, status: 'APPROVED' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.screenMapVersion.findFirst({ where: { projectId, status: 'APPROVED' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.dataModelVersion.findFirst({ where: { projectId, status: 'DRAFT' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.apiSpecVersion.findFirst({ where: { projectId, status: 'DRAFT' }, orderBy: { versionNumber: 'desc' } }),
    prismaClient.screenMapVersion.findFirst({ where: { projectId, status: 'DRAFT' }, orderBy: { versionNumber: 'desc' } }),
  ]);

  return {
    definition,
    dataModel,
    apiSpec,
    screenMap,
    drafts: {
      [RULE_STAGES.DATA_MODEL]: Boolean(dataModelDraft),
      [RULE_STAGES.API_SPEC]: Boolean(apiSpecDraft),
      [RULE_STAGES.SCREENS]: Boolean(screenMapDraft),
    },
  };
}

/**
 * Etapas posteriores que se aprobaron ANTES que una etapa de la que
 * dependen: no es un error (su contenido puede seguir siendo correcto),
 * pero si una advertencia de "posiblemente desactualizada", que es lo que
 * corresponde cuando se regenera y re-aprueba una etapa previa con etapas
 * posteriores ya existentes. Se calcula con los `approvedAt` que ya
 * existen, sin campos nuevos ni migracion.
 */
function findStaleStages({ dataModel, apiSpec, screenMap }) {
  const chain = [
    { stage: RULE_STAGES.DATA_MODEL, version: dataModel },
    { stage: RULE_STAGES.API_SPEC, version: apiSpec },
    { stage: RULE_STAGES.SCREENS, version: screenMap },
  ];

  const stale = [];
  for (let i = 1; i < chain.length; i += 1) {
    const current = chain[i];
    if (!current.version?.approvedAt) continue;

    const outdatedAgainst = chain
      .slice(0, i)
      .filter((previous) => previous.version?.approvedAt && previous.version.approvedAt > current.version.approvedAt);

    if (outdatedAgainst.length > 0) {
      stale.push({
        id: `stage-outdated:${current.stage}`,
        rule: 'stage-outdated',
        stages: [outdatedAgainst[outdatedAgainst.length - 1].stage, current.stage],
        status: STATUS.ADVERTENCIA,
        message: `${STAGE_LABELS[current.stage]} se aprobo antes que ${outdatedAgainst
          .map((previous) => STAGE_LABELS[previous.stage])
          .join(' y ')}, asi que puede estar desactualizado.`,
        evidence: `${current.stage} aprobado el ${current.version.approvedAt.toISOString()}`,
        suggestion: `Revisa ${STAGE_LABELS[current.stage]} y, si corresponde, volve a generarlo y aprobarlo para que refleje los cambios.`,
      });
    }
  }
  return stale;
}

function summarizeStatus(findings, checks) {
  if (findings.some((finding) => finding.status === STATUS.ERROR)) return STATUS.ERROR;
  if (findings.some((finding) => finding.status === STATUS.ADVERTENCIA)) return STATUS.ADVERTENCIA;
  if (checks.some((check) => check.status === STATUS.PENDIENTE)) return STATUS.PENDIENTE;
  return STATUS.OK;
}

/** T-031.1/T-031.2 - Corre todas las reglas de validacion cruzada contra el estado vigente del proyecto. */
async function checkConsistency(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const context = await loadContext(projectId, prismaClient);
  const { findings, checks } = evaluateRules(context);
  const staleFindings = findStaleStages(context);
  const allFindings = [...findings, ...staleFindings];

  const presence = artifactPresence(context);
  const pendingStages = Object.entries(presence)
    .filter(([, exists]) => !exists)
    .map(([stage]) => stage);

  // `pendingApproval`: etapas con un borrador sin aprobar. El motor solo
  // mira lo aprobado, asi que sin esto el usuario no tiene forma de saber
  // por que su ajuste "no hizo nada".
  const pendingApproval = Object.entries(context.drafts)
    .filter(([, hasDraft]) => hasDraft)
    .map(([stage]) => stage);

  const blocking = allFindings.filter((finding) => finding.status === STATUS.ERROR);

  return {
    // Forma historica (no se rompe): `issues` con rule/stages/message, mas
    // los campos aditivos id/status/evidence/suggestion en cada item.
    issues: allFindings,
    isConsistent: blocking.length === 0,
    // Campos aditivos:
    status: summarizeStatus(allFindings, checks),
    checks,
    pendingStages,
    pendingApproval,
  };
}

/** T-031.3 - Guard reutilizable: lanza InconsistentProjectError (409) si hay inconsistencias que bloquean. */
async function assertConsistentOrThrow(projectId, deps = {}) {
  const result = await checkConsistency(projectId, deps);
  if (!result.isConsistent) {
    throw new InconsistentProjectError(result.issues.filter((issue) => issue.status === STATUS.ERROR));
  }
  return result;
}

module.exports = { checkConsistency, assertConsistentOrThrow };
