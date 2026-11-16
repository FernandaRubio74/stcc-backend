/**
 * Tests funcionales de /projects/:projectId/architecture sobre HTTP real.
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

const VALID_ENTITIES = [
  { name: 'User', attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }], indexes: [] },
];

async function crearModeloAprobado(projectId, ownerId) {
  await prisma.dataModelVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      entities: VALID_ENTITIES,
      createdById: ownerId,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /projects/:projectId/architecture/catalog', () => {
  test('expone el catalogo fijo a cualquier miembro', async () => {
    const owner = await crearUsuario('owner0@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/architecture/catalog`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    expect(res.body[0]).toHaveProperty('persistence');
  });
});

describe('POST /projects/:projectId/architecture/recommend', () => {
  test('responde 409 si no hay modelo de datos aprobado', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/recommend`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera la recomendacion cuando hay un modelo de datos aprobado', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearModeloAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({
      recommendedId: 'monolito-modular',
      justification: 'justificacion',
    });

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/recommend`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.recommendedId).toBe('monolito-modular');
  });

  test('responde 502 si la IA recomienda un id fuera del catalogo', async () => {
    const owner = await crearUsuario('owner2b@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearModeloAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ recommendedId: 'no-existe', justification: 'x' });

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/recommend`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(502);
  });
});

describe('POST /projects/:projectId/architecture/select', () => {
  test('un editor (no owner) recibe 403', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const editor = await crearUsuario('editor3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/select`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`)
      .send({ architectureId: 'monolito-modular' });

    expect(res.status).toBe(403);
  });

  test('el owner selecciona una arquitectura del catalogo', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/select`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ architectureId: 'serverless-managed' });

    expect(res.status).toBe(200);
    expect(res.body.selectedId).toBe('serverless-managed');
  });

  test('responde 400 si el id elegido no existe en el catalogo', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/architecture/select`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ architectureId: 'no-existe' });

    expect(res.status).toBe(400);
  });
});

describe('GET /projects/:projectId/architecture', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const ajeno = await crearUsuario('ajeno6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/architecture`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve todo null si todavia no se recomendo ni selecciono nada', async () => {
    const owner = await crearUsuario('owner7@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/architecture`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recommendedId: null, justification: null, selectedId: null, selectedAt: null, selectedById: null });
  });
});
