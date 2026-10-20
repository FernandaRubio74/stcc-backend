/**
 * T-023.4/T-024.4 - Tests del servicio de especificacion de API: generacion
 * con IA mockeada, coherencia contra el modelo de datos aprobado,
 * trazabilidad de autoria en ediciones, y transiciones de estado del
 * versionado.
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const dataModelService = require('../../src/modules/data-model/data-model.service');
const apiSpecService = require('../../src/modules/api-spec/api-spec.service');
const { DraftNotFoundError, EndpointEntityMismatchError } = require('../../src/modules/api-spec/api-spec.errors');
const { NoApprovedVersionError } = require('../../src/modules/data-model/data-model.errors');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

async function cleanDatabase() {
  await prisma.apiSpecVersion.deleteMany({});
  await prisma.dataModelVersion.deleteMany({});
  await prisma.blockingQuestion.deleteMany({});
  await prisma.definitionMessage.deleteMany({});
  await prisma.projectDefinition.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const VALID_ENTITIES = [
  {
    name: 'User',
    attributes: [
      { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
      { name: 'email', type: 'string', primaryKey: false, unique: true, nullable: false, foreignKey: null },
    ],
    indexes: [],
  },
];

const VALID_ENDPOINTS = [
  {
    method: 'GET',
    path: '/users',
    description: 'Lista usuarios',
    resourceEntity: 'User',
    parameters: [],
    responses: [
      { status: 200, description: 'ok' },
      { status: 401, description: 'no autenticado' },
    ],
  },
];

async function crearProyectoConModeloAprobado() {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const editor = await prisma.user.create({ data: { email: 'editor@ideator.com', fullName: 'Editor' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'Demora en atencion al cliente',
      targetUsers: [{ label: 'Cliente final', description: 'Compra productos' }],
    },
  });
  await dataModelService.generateDataModel(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ entities: VALID_ENTITIES }) },
  });
  await dataModelService.approveVersion(project.id, owner.id);
  return { owner, editor, project };
}

function fakeAi(endpoints) {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ endpoints }) };
}

describe('generateApiSpec', () => {
  test('lanza NoApprovedVersionError si el proyecto todavia no tiene modelo de datos aprobado', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@ideator.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(
      apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) })
    ).rejects.toThrow(NoApprovedVersionError);
  });

  test('crea la primera version DRAFT (versionNumber=1) con los endpoints devueltos por la IA', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();

    const draft = await apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.status).toBe('DRAFT');
    expect(draft.createdById).toBe(owner.id);
    expect(draft.endpoints).toEqual(VALID_ENDPOINTS);
  });

  test('regenerar sobreescribe el DRAFT existente en vez de crear una version nueva', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    await apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) });

    const draft = await apiSpecService.generateApiSpec(project.id, owner.id, {
      ai: fakeAi([...VALID_ENDPOINTS, { ...VALID_ENDPOINTS[0], method: 'POST' }]),
    });

    expect(draft.versionNumber).toBe(1);
    expect(draft.endpoints).toHaveLength(2);
  });

  test('propaga EndpointEntityMismatchError si la IA referencia una entidad que no existe en el modelo aprobado', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    const endpointInvalido = [{ ...VALID_ENDPOINTS[0], resourceEntity: 'Invoice' }];

    await expect(
      apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(endpointInvalido) })
    ).rejects.toThrow(EndpointEntityMismatchError);
  });

  test('propaga AiResponseValidationError si la IA devuelve una estructura invalida', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    const ai = { requestStructuredJson: jest.fn().mockRejectedValue(new AiResponseValidationError()) };

    await expect(apiSpecService.generateApiSpec(project.id, owner.id, { ai })).rejects.toThrow(
      AiResponseValidationError
    );
  });
});

describe('updateEndpoints - trazabilidad de autoria y coherencia', () => {
  test('una edicion manual sobre un DRAFT actualiza createdById al editor actual', async () => {
    const { owner, editor, project } = await crearProyectoConModeloAprobado();
    await apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) });

    const edited = await apiSpecService.updateEndpoints(project.id, editor.id, VALID_ENDPOINTS);

    expect(edited.versionNumber).toBe(1);
    expect(edited.createdById).toBe(editor.id);
  });

  test('editar despues de aprobar crea una version DRAFT nueva (nunca pisa la aprobada)', async () => {
    const { owner, editor, project } = await crearProyectoConModeloAprobado();
    await apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) });
    await apiSpecService.approveVersion(project.id, owner.id);

    const nuevoDraft = await apiSpecService.updateEndpoints(project.id, editor.id, VALID_ENDPOINTS);

    expect(nuevoDraft.versionNumber).toBe(2);
    expect(nuevoDraft.status).toBe('DRAFT');

    const state = await apiSpecService.getApiSpecState(project.id);
    expect(state.approved.versionNumber).toBe(1);
    expect(state.approved.status).toBe('APPROVED');
  });

  test('rechaza una edicion manual que referencia una entidad que no existe en el modelo aprobado', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    const endpointInvalido = [{ ...VALID_ENDPOINTS[0], resourceEntity: 'Invoice' }];

    await expect(apiSpecService.updateEndpoints(project.id, owner.id, endpointInvalido)).rejects.toThrow(
      EndpointEntityMismatchError
    );
  });
});

describe('approveVersion - transiciones de estado', () => {
  test('lanza DraftNotFoundError si no hay ningun DRAFT para aprobar', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();

    await expect(apiSpecService.approveVersion(project.id, owner.id)).rejects.toThrow(DraftNotFoundError);
  });

  test('aprueba el DRAFT vigente y lo marca inmutable', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    await apiSpecService.generateApiSpec(project.id, owner.id, { ai: fakeAi(VALID_ENDPOINTS) });

    const approved = await apiSpecService.approveVersion(project.id, owner.id);

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe(owner.id);
    expect(approved.approvedAt).not.toBeNull();
  });
});
