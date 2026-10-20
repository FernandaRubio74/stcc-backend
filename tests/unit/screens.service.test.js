/**
 * T-027.4 - Tests del servicio de mapa de pantallas: generacion con IA
 * mockeada, cobertura MVP, y que regenerar sobreescribe (no versiona).
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const screensService = require('../../src/modules/screens/screens.service');
const { NoApprovedApiSpecError, MvpCoverageError } = require('../../src/modules/screens/screens.errors');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

async function cleanDatabase() {
  await prisma.screenMap.deleteMany({});
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

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: ['Reportes avanzados'] };

const VALID_ENDPOINTS = [
  {
    method: 'GET',
    path: '/tickets',
    description: 'Lista tickets',
    resourceEntity: 'Ticket',
    parameters: [],
    responses: [{ status: 200, description: 'ok' }],
  },
];

const VALID_SCREENS = [
  {
    name: 'Cola de tickets',
    purpose: 'Permite la priorizacion de tickets entrantes',
    mainElements: ['lista'],
    visibleToRoles: ['owner', 'editor'],
  },
];

async function crearProyectoConApiSpecAprobada() {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'x', description: 'y' }],
      mvpScope: MVP_SCOPE,
      userJourney: ['a'],
    },
  });
  await prisma.apiSpecVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: 'APPROVED',
      endpoints: VALID_ENDPOINTS,
      createdById: owner.id,
      approvedById: owner.id,
      approvedAt: new Date(),
    },
  });
  return { owner, project };
}

function fakeAi(screens, navigation = []) {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ screens, navigation }) };
}

describe('generateScreenMap', () => {
  test('lanza NoApprovedApiSpecError si el proyecto todavia no tiene especificacion de API aprobada', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@ideator.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) })
    ).rejects.toThrow(NoApprovedApiSpecError);
  });

  test('genera y persiste el mapa de pantallas con diagrama de navegacion', async () => {
    const { owner, project } = await crearProyectoConApiSpecAprobada();

    const screenMap = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    expect(screenMap.screens).toEqual(VALID_SCREENS);
    expect(screenMap.diagram).toContain('flowchart TD');
    expect(screenMap.createdById).toBe(owner.id);
  });

  test('regenerar sobreescribe el mapa existente (upsert, no crea historico)', async () => {
    const { owner, project } = await crearProyectoConApiSpecAprobada();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    const otraVuelta = [{ ...VALID_SCREENS[0], name: 'Tickets priorizados' }];
    const screenMap = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(otraVuelta) });

    expect(screenMap.screens).toEqual(otraVuelta);
    const count = await prisma.screenMap.count({ where: { projectId: project.id } });
    expect(count).toBe(1);
  });

  test('propaga MvpCoverageError si las pantallas devueltas por la IA no cubren el MVP', async () => {
    const { owner, project } = await crearProyectoConApiSpecAprobada();
    const screensSinCobertura = [
      { name: 'Login', purpose: 'Autenticacion', mainElements: ['form'], visibleToRoles: ['owner'] },
    ];

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(screensSinCobertura) })
    ).rejects.toThrow(MvpCoverageError);
  });

  test('propaga AiResponseValidationError si la IA devuelve una estructura invalida', async () => {
    const { owner, project } = await crearProyectoConApiSpecAprobada();
    const ai = { requestStructuredJson: jest.fn().mockRejectedValue(new AiResponseValidationError()) };

    await expect(screensService.generateScreenMap(project.id, owner.id, { ai })).rejects.toThrow(
      AiResponseValidationError
    );
  });
});

describe('getScreenMapState', () => {
  test('devuelve null si todavia no se genero nada', async () => {
    const { project } = await crearProyectoConApiSpecAprobada();

    const state = await screensService.getScreenMapState(project.id);

    expect(state).toBeNull();
  });
});
