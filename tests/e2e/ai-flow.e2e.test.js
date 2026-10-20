/**
 * T-026.1-3 - E2E del flujo completo: conversacion -> modelo de datos ->
 * especificacion de API, contra el servidor real + Postgres real. El
 * proveedor de IA se reemplaza por un doble determinista a nivel de HTTP
 * (ver fakeAiProvider.js y ci.yml), no por un mock del modulo ai.service.
 */
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

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

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('E2E - conversacion -> modelo de datos -> especificacion de API', () => {
  test('simula un proyecto completo y la API aprobada solo referencia entidades del modelo aprobado', async () => {
    await request(BASE_URL).post('/auth/register').send({
      email: 'e2e-ia-flujo@ideator.com',
      password: 'clave12345',
      fullName: 'Owner E2E IA',
    });
    const login = await request(BASE_URL).post('/auth/login').send({
      email: 'e2e-ia-flujo@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    const project = await request(BASE_URL)
      .post('/projects')
      .set('Authorization', token)
      .send({ name: 'Proyecto E2E IA' });
    expect(project.status).toBe(201);
    const projectId = project.body.id;

    // Etapa 1 del wizard: problema y contexto.
    const msg1 = await request(BASE_URL)
      .post(`/projects/${projectId}/definition/messages`)
      .set('Authorization', token)
      .send({ content: 'Los agentes de soporte no logran priorizar los tickets que llegan.' });
    expect(msg1.status).toBe(201);
    expect(msg1.body.stageComplete).toBe(true);
    expect(msg1.body.blockingQuestions).toEqual([]);

    const advance1 = await request(BASE_URL)
      .post(`/projects/${projectId}/definition/advance`)
      .set('Authorization', token);
    expect(advance1.status).toBe(200);
    expect(advance1.body.currentStage).toBe('TARGET_USERS_SCOPE');

    // Etapa 2 del wizard: usuarios objetivo, alcance del MVP y user journey.
    const msg2 = await request(BASE_URL)
      .post(`/projects/${projectId}/definition/messages`)
      .set('Authorization', token)
      .send({ content: 'El usuario principal es el agente de soporte que prioriza tickets.' });
    expect(msg2.status).toBe(201);
    expect(msg2.body.stageComplete).toBe(true);

    // Modelo de datos: genera con IA y aprueba.
    const generatedModel = await request(BASE_URL)
      .post(`/projects/${projectId}/data-model/generate`)
      .set('Authorization', token);
    expect(generatedModel.status).toBe(201);
    expect(generatedModel.body.status).toBe('DRAFT');
    const entityNames = generatedModel.body.entities.map((entity) => entity.name);
    expect(entityNames.sort()).toEqual(['Agent', 'Ticket']);

    const approvedModel = await request(BASE_URL)
      .post(`/projects/${projectId}/data-model/approve`)
      .set('Authorization', token);
    expect(approvedModel.status).toBe(200);
    expect(approvedModel.body.status).toBe('APPROVED');

    // Especificacion de API: genera con IA a partir del modelo aprobado y aprueba.
    const generatedSpec = await request(BASE_URL)
      .post(`/projects/${projectId}/api-spec/generate`)
      .set('Authorization', token);
    expect(generatedSpec.status).toBe(201);
    expect(generatedSpec.body.status).toBe('DRAFT');
    expect(generatedSpec.body.endpoints.length).toBeGreaterThan(0);

    // T-026.2: la API generada solo referencia entidades del modelo aprobado.
    generatedSpec.body.endpoints.forEach((endpoint) => {
      expect(entityNames).toContain(endpoint.resourceEntity);
    });

    const approvedSpec = await request(BASE_URL)
      .post(`/projects/${projectId}/api-spec/approve`)
      .set('Authorization', token);
    expect(approvedSpec.status).toBe(200);
    expect(approvedSpec.body.status).toBe('APPROVED');

    const finalState = await request(BASE_URL)
      .get(`/projects/${projectId}/api-spec`)
      .set('Authorization', token);
    expect(finalState.status).toBe(200);
    expect(finalState.body.approved.status).toBe('APPROVED');
    finalState.body.approved.endpoints.forEach((endpoint) => {
      expect(entityNames).toContain(endpoint.resourceEntity);
    });
  });
});
