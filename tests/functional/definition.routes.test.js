/**
 * Tests funcionales de /projects/:projectId/definition sobre HTTP real.
 *
 * Sigue el patron de members.routes.test.js; la IA se mockea a nivel de
 * modulo (igual que sso.callback.test.js mockea googleOAuth) para no
 * depender de un proveedor real en CI.
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const prisma = require('../../src/database/client');
const aiService = require('../../src/modules/ai/ai.service');

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

function tokenDe(userId, email = 'x@ideator.com') {
  return jwt.sign({ sub: userId, email }, env.jwt.secret, { expiresIn: '1d' });
}

async function cleanDatabase() {
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

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /projects/:projectId/definition', () => {
  test('requiere autenticacion', async () => {
    const res = await request(app).get(`/projects/${UUID_INEXISTENTE}/definition`);
    expect(res.status).toBe(401);
  });

  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner@ideator.com');
    const ajeno = await crearUsuario('ajeno@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/definition`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('un miembro ve el estado inicial sin mensajes', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/definition`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ currentStage: 'PROBLEM_CONTEXT', messages: [], blockingQuestions: [] });
  });
});

describe('POST /projects/:projectId/definition/messages', () => {
  test('rechaza un mensaje vacio (400)', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  test('un miembro envia un mensaje y recibe la respuesta estructurada de la IA', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    aiService.requestStructuredTurn.mockResolvedValue({
      reply: 'Contame mas sobre el problema',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen inicial' },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: 'Quiero resolver X' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      stage: 'PROBLEM_CONTEXT',
      reply: 'Contame mas sobre el problema',
      blockingQuestions: [],
    });
  });

  test('un fallo del proveedor de IA responde 500 controlado (no filtra el error interno)', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    const { AiTimeoutError } = require('../../src/modules/ai/ai.errors');
    aiService.requestStructuredTurn.mockRejectedValue(new AiTimeoutError());

    const res = await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: 'hola' });

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/AiTimeoutError/);
  });
});

describe('GET /projects/:projectId/definition/blocking-questions', () => {
  test('lista solo las preguntas abiertas', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    aiService.requestStructuredTurn.mockResolvedValue({
      reply: 'r',
      stageComplete: false,
      blockingQuestions: ['¿Quien es el usuario?'],
      extracted: {},
    });
    await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: 'hola' });

    const res = await request(app)
      .get(`/projects/${project.id}/definition/blocking-questions`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ stage: 'PROBLEM_CONTEXT', question: '¿Quien es el usuario?' });
  });
});

describe('POST /projects/:projectId/definition/advance', () => {
  test('responde 409 con el listado de bloqueos si hay preguntas sin resolver', async () => {
    const owner = await crearUsuario('owner7@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    aiService.requestStructuredTurn.mockResolvedValue({
      reply: 'r',
      stageComplete: false,
      blockingQuestions: ['falta algo'],
      extracted: { problemSummary: 'resumen' },
    });
    await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: 'hola' });

    const res = await request(app)
      .post(`/projects/${project.id}/definition/advance`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.blockingQuestions).toEqual(['falta algo']);
  });

  test('avanza de etapa cuando los datos estan completos y sin bloqueos', async () => {
    const owner = await crearUsuario('owner8@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    aiService.requestStructuredTurn.mockResolvedValue({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen completo' },
    });
    await request(app)
      .post(`/projects/${project.id}/definition/messages`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: 'hola' });

    const res = await request(app)
      .post(`/projects/${project.id}/definition/advance`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe('TARGET_USERS_SCOPE');
  });
});
