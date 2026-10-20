/**
 * Servicio de la especificacion de API (US-023/US-024).
 *
 * Mismo invariante que data-model.service.js: a lo sumo un DRAFT por
 * proyecto a la vez, las APPROVED son inmutables, y editar actualiza el
 * DRAFT existente in place o crea una version nueva si la ultima esta
 * APPROVED. La diferencia es que esta etapa depende de que exista una
 * version APPROVED del modelo de datos (US-021): tanto generar como editar
 * a mano revalidan contra esa version vigente para que la spec nunca quede
 * desalineada con el modelo (T-023.2).
 */
const defaultPrisma = require('../../database/client');
const defaultAiService = require('../ai/ai.service');
const dataModelService = require('../data-model/data-model.service');
const { aiApiSpecResponseSchema, endpointsSchema } = require('./endpoint.schema');
const { API_SPEC_SYSTEM_PROMPT, buildApiSpecUserContent } = require('./prompts');
const { validateEndpointsAgainstDataModel } = require('./coherence');
const { DraftNotFoundError } = require('./api-spec.errors');

function serializeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    endpoints: version.endpoints,
    createdAt: version.createdAt,
    createdById: version.createdById,
    approvedAt: version.approvedAt,
    approvedById: version.approvedById,
  };
}

async function getLatestVersion(prismaClient, projectId) {
  return prismaClient.apiSpecVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: 'desc' },
  });
}

async function getApiSpecState(projectId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest) {
    return { draft: null, approved: null };
  }
  if (latest.status === 'DRAFT') {
    const approved = await prismaClient.apiSpecVersion.findFirst({
      where: { projectId, status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
    });
    return { draft: serializeVersion(latest), approved: serializeVersion(approved) };
  }
  return { draft: null, approved: serializeVersion(latest) };
}

async function persistDraft(prismaClient, projectId, userId, endpoints) {
  const latest = await getLatestVersion(prismaClient, projectId);

  if (latest && latest.status === 'DRAFT') {
    const updated = await prismaClient.apiSpecVersion.update({
      where: { id: latest.id },
      data: { endpoints, createdById: userId },
    });
    return serializeVersion(updated);
  }

  const created = await prismaClient.apiSpecVersion.create({
    data: {
      projectId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      endpoints,
      createdById: userId,
    },
  });
  return serializeVersion(created);
}

/** T-023.1-3 - Genera (o regenera, si ya hay un DRAFT) la spec con la IA a partir del modelo de datos aprobado. */
async function generateApiSpec(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const ai = deps.ai || defaultAiService;

  const dataModel = await dataModelService.getApprovedVersionOrThrow(projectId, deps);

  const { endpoints } = await ai.requestStructuredJson({
    systemPrompt: API_SPEC_SYSTEM_PROMPT,
    userContent: buildApiSpecUserContent(dataModel.entities),
    schema: aiApiSpecResponseSchema,
    maxOutputTokens: 4096,
  });

  validateEndpointsAgainstDataModel(endpoints, dataModel.entities);
  return persistDraft(prismaClient, projectId, userId, endpoints);
}

/** T-024.1 - Edicion manual del DRAFT, revalidada contra el modelo de datos aprobado vigente. */
async function updateEndpoints(projectId, userId, endpoints, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const parsed = endpointsSchema.parse(endpoints);

  const dataModel = await dataModelService.getApprovedVersionOrThrow(projectId, deps);
  validateEndpointsAgainstDataModel(parsed, dataModel.entities);

  return persistDraft(prismaClient, projectId, userId, parsed);
}

/** T-024.2 - Aprueba el DRAFT vigente: queda inmutable. */
async function approveVersion(projectId, userId, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const latest = await getLatestVersion(prismaClient, projectId);

  if (!latest || latest.status !== 'DRAFT') {
    throw new DraftNotFoundError('No hay una version en edicion para aprobar');
  }

  const approved = await prismaClient.apiSpecVersion.update({
    where: { id: latest.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
  });
  return serializeVersion(approved);
}

module.exports = {
  getApiSpecState,
  generateApiSpec,
  updateEndpoints,
  approveVersion,
};
