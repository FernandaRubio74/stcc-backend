/**
 * Tests del servicio de consistencia contra Postgres real: que
 * checkConsistency recalcule en caliente a partir del estado vigente, y que
 * el guard assertConsistentOrThrow bloquee correctamente.
 */
const { PrismaClient } = require('@prisma/client');
const { withFieldEncryption } = require('../../src/database/fieldEncryption');
const projectsService = require('../../src/modules/projects/projects.service');
const consistencyService = require('../../src/modules/consistency/consistency.service');
const { InconsistentProjectError } = require('../../src/modules/consistency/consistency.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = withFieldEncryption(new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } }));

async function cleanDatabase() {
  await prisma.projectArchitecture.deleteMany({});
  await prisma.screenMapVersion.deleteMany({});
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
  { name: 'Ticket', attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] },
];

describe('checkConsistency', () => {
  test('un proyecto recien creado, sin ninguna etapa completada, es consistente (nada que contradecir todavia)', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner1@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });

    const result = await consistencyService.checkConsistency(project.id);

    // Regla A/D: sin etapas generadas no hay nada que contradecir, y el
    // estado global es "pendiente" (neutro), no un error.
    expect(result).toMatchObject({ issues: [], isConsistent: true, status: 'pendiente' });
    expect(result.pendingStages).toEqual(expect.arrayContaining(['definition', 'data-model', 'api-spec', 'screens']));
    expect(result.checks.every((check) => check.status === 'pendiente')).toBe(true);
  });

  test('detecta drift cuando la API aprobada referencia una entidad que ya no esta en el modelo de datos aprobado', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner2@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
    });
    await prisma.apiSpecVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        endpoints: [{ method: 'GET', path: '/invoices', description: 'Lista facturas', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });

    const result = await consistencyService.checkConsistency(project.id);

    expect(result.isConsistent).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('entities-coverage');
  });

  test('el drift se libera automaticamente si se corrige la etapa en conflicto (sin intervencion manual sobre la validacion)', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner3@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
    const dataModel = await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
    });
    await prisma.apiSpecVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        endpoints: [{ method: 'GET', path: '/invoices', description: 'Lista facturas', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });

    expect((await consistencyService.checkConsistency(project.id)).isConsistent).toBe(false);

    // Se corrige el modelo de datos para que vuelva a incluir la entidad referenciada.
    await prisma.dataModelVersion.update({
      where: { id: dataModel.id },
      data: { entities: [...VALID_ENTITIES, { name: 'Invoice', attributes: [{ name: 'total', type: 'decimal', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }] },
    });

    const result = await consistencyService.checkConsistency(project.id);
    expect(result.isConsistent).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe('assertConsistentOrThrow', () => {
  test('lanza InconsistentProjectError con los issues si el proyecto es inconsistente', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner4@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
    });
    await prisma.apiSpecVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        endpoints: [{ method: 'GET', path: '/invoices', description: 'x', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });

    await expect(consistencyService.assertConsistentOrThrow(project.id)).rejects.toThrow(InconsistentProjectError);
    try {
      await consistencyService.assertConsistentOrThrow(project.id);
    } catch (err) {
      expect(err.issues).toHaveLength(1);
    }
  });

  test('no lanza nada si el proyecto es consistente', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner5@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });

    await expect(consistencyService.assertConsistentOrThrow(project.id)).resolves.toMatchObject({
      issues: [],
      isConsistent: true,
    });
  });
});

describe('estado pendiente de aprobacion (regla E: por que un ajuste "no hace nada")', () => {
  test('un borrador sin aprobar se reporta en pendingApproval y no cambia el resultado del chequeo', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner6@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'DRAFT', entities: VALID_ENTITIES, createdById: owner.id },
    });

    const result = await consistencyService.checkConsistency(project.id);

    expect(result.pendingApproval).toEqual(['data-model']);
    expect(result.pendingStages).toContain('data-model');
  });
});

describe('etapas posiblemente desactualizadas (regla A: regenerar una etapa previa)', () => {
  test('una etapa posterior aprobada ANTES que una previa queda marcada como desactualizada, sin bloquear', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner7@ideator.com', fullName: 'Owner' } });
    const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });

    const apiApprovedAt = new Date('2026-01-01T10:00:00Z');
    const dataModelApprovedAt = new Date('2026-01-02T10:00:00Z');

    await prisma.apiSpecVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        endpoints: [{ method: 'GET', path: '/tickets', description: 'x', resourceEntity: 'Ticket', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: apiApprovedAt,
      },
    });
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: dataModelApprovedAt },
    });

    const result = await consistencyService.checkConsistency(project.id);
    const stale = result.issues.find((issue) => issue.rule === 'stage-outdated');

    expect(stale).toBeDefined();
    expect(stale.status).toBe('advertencia');
    expect(stale.stages).toEqual(['data-model', 'api-spec']);
    // Una advertencia no bloquea.
    expect(result.isConsistent).toBe(true);
  });
});
