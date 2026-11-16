/**
 * Tests funcionales de /projects/:projectId/consistency-check sobre HTTP real.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const prisma = require('../../src/database/client');

function tokenDe(userId, email = 'x@ideator.com') {
  return jwt.sign({ sub: userId, email }, env.jwt.secret, { expiresIn: '1d' });
}

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

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

const VALID_ENTITIES = [{ name: 'Ticket', attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }];

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /projects/:projectId/consistency-check', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const ajeno = await crearUsuario('ajeno1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/consistency-check`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve isConsistent=true sin issues para un proyecto recien creado', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/consistency-check`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issues: [], isConsistent: true });
  });
});

describe('POST /projects/:projectId/consistency-check/final-generation', () => {
  test('responde 200 si el proyecto es consistente', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('responde 409 con el listado de issues si el proyecto tiene inconsistencias', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
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

    const res = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.issues).toHaveLength(1);
  });

  test('el bloqueo se libera sin intervencion manual una vez resuelta la inconsistencia', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    const dataModel = await prisma.dataModelVersion.create({
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

    const blocked = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(blocked.status).toBe(409);

    await prisma.dataModelVersion.update({
      where: { id: dataModel.id },
      data: { entities: [...VALID_ENTITIES, { name: 'Invoice', attributes: [{ name: 'total', type: 'decimal', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }] },
    });

    const released = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(released.status).toBe(200);
  });
});
