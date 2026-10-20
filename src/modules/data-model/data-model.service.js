/**
 * Servicio del modelo fisico de base de datos (US-019/US-020/US-021).
 *
 * Invariante central: a lo sumo una fila DRAFT por proyecto a la vez (la
 * version "en edicion"); las filas APPROVED son inmutables. Editar
 * (generate o updateEntities) actualiza la fila DRAFT existente in place
 * si hay una, o crea una version nueva si la ultima esta APPROVED (o no
 * existe ninguna todavia) — asi nunca se pisa una version ya aprobada.
 *
 * Trazabilidad (T-020.2): se registra a nivel de version, no por campo
 * individual — `createdById` es quien dejo la version DRAFT en su estado
 * actual (la ultima persona que la toco). Un log de cambios por atributo
 * seria mas granular, pero no esta pedido por el DoD y agrega una tabla
 * entera para un caso que todavia no aparecio.
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const { generateMermaidDiagram } = require('./mermaid');
const { aiDataModelResponseSchema, entitiesSchema } = require('./entity.schema');
const { DATA_MODEL_SYSTEM_PROMPT, buildDataModelUserContent } = require('./prompts');
const { InsufficientDefinitionError, DraftNotFoundError, NoApprovedVersionError } = require('./data-model.errors');

function serializeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    entities: version.entities,
    diagram: version.diagram,
    createdAt: version.createdAt,
    createdById: version.createdById,
    approvedAt: version.approvedAt,
    approvedById: version.approvedById,
  };
}

async function getLatestVersion(prismaClient, projectId) {
  return prismaClient.dataModelVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: 'desc' },
  });
}

/** T-019.3/T-021.3 - Estado para el frontend: la version vigente (aprobada) y, si existe, la que esta en edicion. */
async function getDataModelState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest) {
    return { draft: null, approved: null };
  }
  if (latest.status === 'DRAFT') {
    const approved = await prismaClient.dataModelVersion.findFirst({
      where: { projectId, status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
    });
    return { draft: serializeVersion(latest), approved: serializeVersion(approved) };
  }
  return { draft: null, approved: serializeVersion(latest) };
}

function assertDefinitionIsUsable(definition) {
  const hasProblem = Boolean(definition?.problemSummary && definition.problemSummary.trim().length > 0);
  const hasTargetUsers = Array.isArray(definition?.targetUsers) && definition.targetUsers.length > 0;
  if (!hasProblem || !hasTargetUsers) {
    throw new InsufficientDefinitionError(
      'Todavia falta completar la definicion del proyecto (problema y usuarios objetivo) antes de generar el modelo de datos'
    );
  }
}

/** T-019.1-3 - Genera (o regenera, si ya hay un DRAFT) el modelo con la IA. */
async function generateDataModel(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const definition = await prismaClient.projectDefinition.findUnique({ where: { projectId } });
  assertDefinitionIsUsable(definition);

  const { entities } = await ai.requestStructuredJson({
    systemPrompt: DATA_MODEL_SYSTEM_PROMPT,
    userContent: buildDataModelUserContent(definition),
    schema: aiDataModelResponseSchema,
    maxOutputTokens: 8192,
  });

  return persistDraft(prismaClient, projectId, userId, entities);
}

async function persistDraft(prismaClient, projectId, userId, entities) {
  const diagram = generateMermaidDiagram(entities);
  const latest = await getLatestVersion(prismaClient, projectId);

  if (latest && latest.status === 'DRAFT') {
    const updated = await prismaClient.dataModelVersion.update({
      where: { id: latest.id },
      data: { entities, diagram, createdById: userId },
    });
    return serializeVersion(updated);
  }

  const created = await prismaClient.dataModelVersion.create({
    data: {
      projectId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      entities,
      diagram,
      createdById: userId,
    },
  });
  return serializeVersion(created);
}

/** T-020.1/T-020.2 - Edicion manual del DRAFT (crea uno nuevo si no hay, o si el ultimo ya esta APPROVED). */
async function updateEntities(projectId, userId, entities, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const parsed = entitiesSchema.parse(entities);
  return persistDraft(prismaClient, projectId, userId, parsed);
}

/** T-021.2 - Aprueba el DRAFT vigente: queda inmutable y vigente para etapas futuras. */
async function approveVersion(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest || latest.status !== 'DRAFT') {
    throw new DraftNotFoundError('No hay una version en edicion para aprobar');
  }

  const approved = await prismaClient.dataModelVersion.update({
    where: { id: latest.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
  });
  return serializeVersion(approved);
}

/** T-021.3 - Para que etapas futuras (API spec, etc.) referencien siempre la version vigente. */
async function getApprovedVersionOrThrow(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const approved = await prismaClient.dataModelVersion.findFirst({
    where: { projectId, status: 'APPROVED' },
    orderBy: { versionNumber: 'desc' },
  });
  if (!approved) {
    throw new NoApprovedVersionError('El proyecto todavia no tiene una version aprobada del modelo de datos');
  }
  return serializeVersion(approved);
}

module.exports = {
  getDataModelState,
  generateDataModel,
  updateEntities,
  approveVersion,
  getApprovedVersionOrThrow,
};
