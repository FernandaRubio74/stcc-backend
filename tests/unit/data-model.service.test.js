/**
 * T-019.4/T-020.4/T-021.4 - Tests del servicio de modelo de datos:
 * generacion con IA mockeada (validacion de estructura), trazabilidad de
 * autoria en ediciones, y transiciones de estado del versionado.
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const dataModelService = require('../../src/modules/data-model/data-model.service');
const {
  InsufficientDefinitionError,
  DraftNotFoundError,
  NoApprovedVersionError,
} = require('../../src/modules/data-model/data-model.errors');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

async function cleanDatabase() {
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

async function crearProyectoConDefinicionCompleta() {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const editor = await prisma.user.create({ data: { email: 'editor@ideator.com', fullName: 'Editor' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'Demora en atencion al cliente',
      targetUsers: [{ label: 'Cliente final', description: 'Compra productos' }],
      mvpScope: { in: ['login'], out: ['reportes'] },
      userJourney: ['Se registra', 'Hace una compra'],
    },
  });
  return { owner, editor, project };
}

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

function fakeAi(entities) {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ entities }) };
}

describe('generateDataModel', () => {
  test('lanza InsufficientDefinitionError si la definicion todavia no tiene problema/usuarios', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@ideator.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(
      dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) })
    ).rejects.toThrow(InsufficientDefinitionError);
  });

  test('crea la primera version DRAFT (versionNumber=1) con las entidades devueltas por la IA', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    const ai = fakeAi(VALID_ENTITIES);

    const draft = await dataModelService.generateDataModel(project.id, owner.id, { ai });

    expect(draft.versionNumber).toBe(1);
    expect(draft.status).toBe('DRAFT');
    expect(draft.createdById).toBe(owner.id);
    expect(draft.entities).toEqual(VALID_ENTITIES);
    expect(draft.diagram).toContain('erDiagram');
  });

  test('regenerar sobreescribe el DRAFT existente en vez de crear una version nueva', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });

    const segundaVuelta = [
      {
        name: 'User',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
        ],
        indexes: [],
      },
      {
        name: 'Order',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
        ],
        indexes: [],
      },
    ];
    const draft = await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(segundaVuelta) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.entities).toHaveLength(2);
  });

  test('propaga AiResponseValidationError si la IA devuelve una estructura invalida', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    const ai = {
      requestStructuredJson: jest.fn().mockRejectedValue(new AiResponseValidationError()),
    };

    await expect(dataModelService.generateDataModel(project.id, owner.id, { ai })).rejects.toThrow(
      AiResponseValidationError
    );
  });
});

describe('updateEntities - trazabilidad de autoria', () => {
  test('una edicion manual sobre un DRAFT actualiza createdById al editor actual', async () => {
    const { owner, editor, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });

    const edited = await dataModelService.updateEntities(project.id, editor.id, VALID_ENTITIES);

    expect(edited.versionNumber).toBe(1);
    expect(edited.createdById).toBe(editor.id);
  });

  test('editar despues de aprobar crea una version DRAFT nueva (nunca pisa la aprobada)', async () => {
    const { owner, editor, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });
    await dataModelService.approveVersion(project.id, owner.id);

    const nuevoDraft = await dataModelService.updateEntities(project.id, editor.id, VALID_ENTITIES);

    expect(nuevoDraft.versionNumber).toBe(2);
    expect(nuevoDraft.status).toBe('DRAFT');
    expect(nuevoDraft.createdById).toBe(editor.id);

    const state = await dataModelService.getDataModelState(project.id);
    expect(state.approved.versionNumber).toBe(1);
    expect(state.approved.status).toBe('APPROVED');
  });
});

describe('approveVersion - transiciones de estado', () => {
  test('lanza DraftNotFoundError si no hay ningun DRAFT para aprobar', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();

    await expect(dataModelService.approveVersion(project.id, owner.id)).rejects.toThrow(DraftNotFoundError);
  });

  test('aprueba el DRAFT vigente y lo marca inmutable', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });

    const approved = await dataModelService.approveVersion(project.id, owner.id);

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe(owner.id);
    expect(approved.approvedAt).not.toBeNull();
  });

  test('lanza DraftNotFoundError si se intenta aprobar de nuevo sin una edicion nueva', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });
    await dataModelService.approveVersion(project.id, owner.id);

    await expect(dataModelService.approveVersion(project.id, owner.id)).rejects.toThrow(DraftNotFoundError);
  });
});

describe('getApprovedVersionOrThrow', () => {
  test('lanza NoApprovedVersionError si el proyecto no tiene version aprobada', async () => {
    const { project } = await crearProyectoConDefinicionCompleta();

    await expect(dataModelService.getApprovedVersionOrThrow(project.id)).rejects.toThrow(NoApprovedVersionError);
  });

  test('devuelve la version aprobada vigente', async () => {
    const { owner, project } = await crearProyectoConDefinicionCompleta();
    await dataModelService.generateDataModel(project.id, owner.id, { ai: fakeAi(VALID_ENTITIES) });
    await dataModelService.approveVersion(project.id, owner.id);

    const approved = await dataModelService.getApprovedVersionOrThrow(project.id);

    expect(approved.status).toBe('APPROVED');
  });
});
