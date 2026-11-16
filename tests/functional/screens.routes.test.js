/**
 * Tests funcionales de /projects/:projectId/screens sobre HTTP real.
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

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: [] };

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
  { name: 'Cola de tickets', purpose: 'Permite la priorizacion de tickets', mainElements: ['lista'], visibleToRoles: ['owner'] },
];

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function crearApiSpecAprobada(projectId, ownerId) {
  await prisma.projectDefinition.create({ data: { projectId, mvpScope: MVP_SCOPE } });
  await prisma.apiSpecVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      endpoints: VALID_ENDPOINTS,
      createdById: ownerId,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
}

describe('POST /projects/:projectId/screens/generate', () => {
  test('responde 409 si no hay especificacion de API aprobada', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera el mapa de pantallas cuando hay una API aprobada', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearApiSpecAprobada(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.screens).toEqual(VALID_SCREENS);
    expect(res.body.diagram).toContain('flowchart TD');
  });

  test('responde 502 si las pantallas generadas no cubren el MVP', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearApiSpecAprobada(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({
      screens: [{ name: 'Login', purpose: 'Autenticacion', mainElements: ['form'], visibleToRoles: ['owner'] }],
      navigation: [],
    });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(502);
  });
});

describe('GET /projects/:projectId/screens', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const ajeno = await crearUsuario('ajeno4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/screens`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve null si todavia no se genero nada', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/screens`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
