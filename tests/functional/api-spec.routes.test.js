/**
 * Tests funcionales de /projects/:projectId/api-spec sobre HTTP real.
 * La IA se mockea a nivel de modulo (igual que data-model.routes.test.js).
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const prisma = require('../../src/database/client');
const aiService = require('../../src/modules/ai/ai.service');

function tokenDe(userId, email = 'x@ideator.com') {
  return jwt.sign({ sub: userId, email }, env.jwt.secret, { expiresIn: '1d' });
}

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

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

const VALID_ENTITIES = [
  {
    name: 'User',
    attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
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

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /projects/:projectId/api-spec/generate', () => {
  test('responde 409 si el proyecto todavia no tiene modelo de datos aprobado', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera el DRAFT cuando hay un modelo de datos aprobado', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.dataModelVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        entities: VALID_ENTITIES,
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });
    aiService.requestStructuredJson.mockResolvedValue({ endpoints: VALID_ENDPOINTS });

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.endpoints).toEqual(VALID_ENDPOINTS);
  });

  test('responde 502 si la IA devuelve un endpoint que referencia una entidad inexistente', async () => {
    const owner = await crearUsuario('owner2b@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.dataModelVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        entities: VALID_ENTITIES,
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });
    aiService.requestStructuredJson.mockResolvedValue({
      endpoints: [{ ...VALID_ENDPOINTS[0], resourceEntity: 'Invoice' }],
    });

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(502);
  });
});

describe('PATCH /projects/:projectId/api-spec/endpoints', () => {
  async function crearProyectoConModeloAprobado(ownerEmail) {
    const owner = await crearUsuario(ownerEmail);
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.dataModelVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        entities: VALID_ENTITIES,
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });
    return { owner, project };
  }

  test('un viewer recibe 403', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado('owner3@ideator.com');
    const viewer = await crearUsuario('viewer3@ideator.com');
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'viewer' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/api-spec/endpoints`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`)
      .send({ endpoints: VALID_ENDPOINTS });

    expect(res.status).toBe(403);
  });

  test('un editor puede editar la especificacion', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado('owner4@ideator.com');
    const editor = await crearUsuario('editor4@ideator.com');
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/api-spec/endpoints`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`)
      .send({ endpoints: VALID_ENDPOINTS });

    expect(res.status).toBe(200);
    expect(res.body.createdById).toBe(editor.id);
  });

  test('rechaza un endpoint sin responses con 400', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado('owner5@ideator.com');

    const res = await request(app)
      .patch(`/projects/${project.id}/api-spec/endpoints`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ endpoints: [{ ...VALID_ENDPOINTS[0], responses: [] }] });

    expect(res.status).toBe(400);
  });

  test('responde 409 si el endpoint editado referencia una entidad que no existe en el modelo aprobado', async () => {
    const { owner, project } = await crearProyectoConModeloAprobado('owner5b@ideator.com');

    const res = await request(app)
      .patch(`/projects/${project.id}/api-spec/endpoints`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ endpoints: [{ ...VALID_ENDPOINTS[0], resourceEntity: 'Invoice' }] });

    expect(res.status).toBe(409);
  });
});

describe('POST /projects/:projectId/api-spec/approve', () => {
  test('un editor (no owner) recibe 403', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const editor = await crearUsuario('editor6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });
    await prisma.apiSpecVersion.create({
      data: { projectId: project.id, versionNumber: 1, endpoints: VALID_ENDPOINTS, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/approve`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`);

    expect(res.status).toBe(403);
  });

  test('el owner aprueba el DRAFT vigente', async () => {
    const owner = await crearUsuario('owner7@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.apiSpecVersion.create({
      data: { projectId: project.id, versionNumber: 1, endpoints: VALID_ENDPOINTS, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  test('responde 409 si no hay ningun DRAFT para aprobar', async () => {
    const owner = await crearUsuario('owner8@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/api-spec/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });
});

describe('GET /projects/:projectId/api-spec', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner9@ideator.com');
    const ajeno = await crearUsuario('ajeno9@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/api-spec`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve draft=null y approved=null si todavia no se genero nada', async () => {
    const owner = await crearUsuario('owner10@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/api-spec`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null, approved: null });
  });
});
