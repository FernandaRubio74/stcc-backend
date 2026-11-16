/**
 * T-028.4 - Tests de la logica de recomendacion con distintos perfiles de
 * proyecto (mock de IA), y del flujo de seleccion/override manual.
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const dataModelService = require('../../src/modules/data-model/data-model.service');
const architectureService = require('../../src/modules/architecture/architecture.service');
const { ARCHITECTURE_CATALOG } = require('../../src/modules/architecture/catalog');
const { InvalidArchitectureIdError } = require('../../src/modules/architecture/architecture.errors');
const { NoApprovedVersionError } = require('../../src/modules/data-model/data-model.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

async function cleanDatabase() {
  await prisma.projectArchitecture.deleteMany({});
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

const VALID_ENTITIES = [
  { name: 'User', attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }], indexes: [] },
];

async function crearProyectoConModeloAprobado(problemSummary = 'resumen', mvpScope = { in: ['feature'], out: [] }) {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  await prisma.projectDefinition.create({
    data: { projectId: project.id, problemSummary, targetUsers: [{ label: 'x', description: 'y' }], mvpScope },
  });
  await dataModelService.generateDataModel(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ entities: VALID_ENTITIES }) },
  });
  await dataModelService.approveVersion(project.id, owner.id);
  return { owner, project };
}

function fakeAi(recommendedId, justification = 'justificacion') {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ recommendedId, justification }) };
}

describe('recommendArchitecture', () => {
  test('lanza NoApprovedVersionError si el proyecto todavia no tiene modelo de datos aprobado', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@ideator.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(
      architectureService.recommendArchitecture(project.id, owner.id, { ai: fakeAi('monolito-modular') })
    ).rejects.toThrow(NoApprovedVersionError);
  });

  test('persiste la recomendacion de la IA (perfil MVP chico -> monolito modular)', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();

    const result = await architectureService.recommendArchitecture(project.id, owner.id, {
      ai: fakeAi('monolito-modular', 'MVP chico, un solo equipo, baja complejidad inicial'),
    });

    expect(result.recommendedId).toBe('monolito-modular');
    expect(result.justification).toContain('MVP chico');
    expect(result.selectedId).toBeNull();
  });

  test('persiste la recomendacion de la IA (perfil distinto -> microservicios)', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado(
      'Plataforma multi-equipo con dominios independientes'
    );

    const result = await architectureService.recommendArchitecture(project.id, owner.id, {
      ai: fakeAi('microservicios-contenedores', 'Varios equipos trabajando en paralelo sobre dominios distintos'),
    });

    expect(result.recommendedId).toBe('microservicios-contenedores');
  });

  test('lanza InvalidArchitectureIdError si la IA recomienda un id que no esta en el catalogo', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();

    await expect(
      architectureService.recommendArchitecture(project.id, owner.id, { ai: fakeAi('arquitectura-inexistente') })
    ).rejects.toThrow(InvalidArchitectureIdError);
  });

  test('recomendar de nuevo no borra una seleccion ya hecha', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    await architectureService.recommendArchitecture(project.id, owner.id, { ai: fakeAi('monolito-modular') });
    await architectureService.selectArchitecture(project.id, owner.id, 'monolito-modular');

    const result = await architectureService.recommendArchitecture(project.id, owner.id, {
      ai: fakeAi('serverless-managed', 'otra justificacion'),
    });

    expect(result.recommendedId).toBe('serverless-managed');
    expect(result.selectedId).toBe('monolito-modular');
  });
});

describe('selectArchitecture', () => {
  test('el usuario puede elegir explicitamente una opcion distinta de la recomendada', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();
    await architectureService.recommendArchitecture(project.id, owner.id, { ai: fakeAi('monolito-modular') });

    const result = await architectureService.selectArchitecture(project.id, owner.id, 'jamstack-baas');

    expect(result.selectedId).toBe('jamstack-baas');
    expect(result.selectedById).toBe(owner.id);
    expect(result.selectedAt).not.toBeNull();
  });

  test('lanza InvalidArchitectureIdError si el id elegido no existe en el catalogo', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado();

    await expect(
      architectureService.selectArchitecture(project.id, owner.id, 'no-existe')
    ).rejects.toThrow(InvalidArchitectureIdError);
  });
});

describe('getCatalog', () => {
  test('expone el catalogo fijo con los campos documentados por el DoD', () => {
    const catalog = architectureService.getCatalog();

    expect(catalog).toBe(ARCHITECTURE_CATALOG);
    catalog.forEach((scenario) => {
      expect(scenario.persistence).toBeTruthy();
      expect(scenario.backend).toBeTruthy();
      expect(scenario.frontend).toBeTruthy();
      expect(scenario.infrastructure).toBeTruthy();
      expect(scenario.operation).toBeTruthy();
    });
  });
});
