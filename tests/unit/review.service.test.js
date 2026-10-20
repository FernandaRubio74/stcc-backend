/**
 * T-032.3 - Tests del calculo de "listo para generar" con combinaciones de
 * etapas y bloqueos, contra Postgres real.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const reviewService = require('../../src/modules/review/review.service');

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

const VALID_ENTITIES = [{ name: 'Ticket', attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }];
const VALID_ENDPOINTS = [{ method: 'GET', path: '/tickets', description: 'Lista tickets', resourceEntity: 'Ticket', parameters: [], responses: [{ status: 200, description: 'ok' }] }];

async function crearProyectoBase() {
  const owner = await prisma.user.create({ data: { email: `owner-${Date.now()}-${Math.random()}@ideator.com`, fullName: 'Owner' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  return { owner, project };
}

async function completarTodasLasEtapas(project, owner) {
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'Cliente', description: 'x' }],
      mvpScope: { in: ['feature'], out: [] },
      userJourney: ['paso 1'],
    },
  });
  await prisma.dataModelVersion.create({
    data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
  });
  await prisma.apiSpecVersion.create({
    data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', endpoints: VALID_ENDPOINTS, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
  });
  await prisma.screenMap.create({
    data: { projectId: project.id, screens: [{ name: 'Tickets', purpose: 'feature para el cliente', mainElements: ['lista'], visibleToRoles: ['owner'] }], navigation: [], diagram: 'flowchart TD', createdById: owner.id },
  });
  await prisma.projectArchitecture.create({
    data: { projectId: project.id, selectedId: 'monolito-modular', selectedAt: new Date(), selectedById: owner.id },
  });
}

describe('getReviewSummary', () => {
  test('un proyecto recien creado tiene todas las etapas incompletas y no esta listo para generar', async () => {
    const { project } = await crearProyectoBase();

    const summary = await reviewService.getReviewSummary(project.id);

    expect(summary.stages.definition.complete).toBe(false);
    expect(summary.stages.dataModel.complete).toBe(false);
    expect(summary.stages.apiSpec.complete).toBe(false);
    expect(summary.stages.screens.complete).toBe(false);
    expect(summary.stages.architecture.complete).toBe(false);
    expect(summary.readyToGenerate).toBe(false);
  });

  test('con todas las etapas completas, sin bloqueos ni inconsistencias, esta listo para generar', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);

    const summary = await reviewService.getReviewSummary(project.id);

    expect(Object.values(summary.stages).every((s) => s.complete)).toBe(true);
    expect(summary.blockingQuestions).toEqual([]);
    expect(summary.inconsistencies).toEqual([]);
    expect(summary.readyToGenerate).toBe(true);
    expect(summary.keyDecisions.selectedArchitecture).toBe('monolito-modular');
  });

  test('con todas las etapas completas pero con una pregunta bloqueante abierta, no esta listo para generar', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    await prisma.blockingQuestion.create({ data: { projectId: project.id, stage: 'PROBLEM_CONTEXT', question: 'x' } });

    const summary = await reviewService.getReviewSummary(project.id);

    expect(Object.values(summary.stages).every((s) => s.complete)).toBe(true);
    expect(summary.blockingQuestions).toHaveLength(1);
    expect(summary.readyToGenerate).toBe(false);
  });

  test('con todas las etapas completas pero con una inconsistencia entre etapas, no esta listo para generar', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    const apiSpec = await prisma.apiSpecVersion.findFirst({ where: { projectId: project.id } });
    await prisma.apiSpecVersion.update({
      where: { id: apiSpec.id },
      data: { endpoints: [{ method: 'GET', path: '/invoices', description: 'x', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }] },
    });

    const summary = await reviewService.getReviewSummary(project.id);

    expect(summary.inconsistencies.length).toBeGreaterThan(0);
    expect(summary.readyToGenerate).toBe(false);
  });
});
