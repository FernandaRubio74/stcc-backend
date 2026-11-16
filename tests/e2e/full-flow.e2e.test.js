/**
 * T-041.1-2 - E2E del flujo completo de Ideator: registro -> login -> crear
 * proyecto -> wizard -> modelo de datos -> API -> pantallas -> arquitectura
 * -> revision final -> documentos finales. Contra el servidor real +
 * Postgres real.
 *
 * "Sin mocks internos del sistema bajo prueba" (DoD): el UNICO doble es el
 * proveedor de IA (un servicio externo), via fakeAiProvider.js a nivel de
 * proceso HTTP (ver ci.yml) — nada de jest.mock de modulos propios ni de
 * Prisma, que es exactamente como corre en produccion salvo por quien
 * responde las llamadas a Azure.
 *
 * Se solapa a proposito con documents-flow.e2e.test.js (US-040, que prueba
 * la etapa de cierre aislada con mas detalle) y con consistency-flow.e2e.test.js
 * (US-034, bloqueo/liberacion del motor de consistencia): aca se recorre el
 * camino feliz de punta a punta, como lo haria una persona real usando la
 * app, sin ejercitar los casos de borde que esas otras suites ya cubren.
 */
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

async function cleanDatabase() {
  await prisma.generatedDocument.deleteMany({});
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

describe('E2E - flujo completo de Ideator (gate de release)', () => {
  test('recorre, como lo haria una persona real, desde el registro hasta los documentos finales', async () => {
    // 1. Registro y login.
    const email = 'e2e-full-flow@ideator.com';
    const register = await request(BASE_URL).post('/auth/register').send({
      email,
      password: 'clave12345',
      fullName: 'Persona Real',
    });
    expect(register.status).toBe(201);

    const login = await request(BASE_URL).post('/auth/login').send({ email, password: 'clave12345' });
    expect(login.status).toBe(200);
    const token = `Bearer ${login.body.token}`;

    // 2. Crear proyecto.
    const project = await request(BASE_URL).post('/projects').set('Authorization', token).send({
      name: 'Proyecto E2E Flujo Completo',
    });
    expect(project.status).toBe(201);
    const projectId = project.body.id;

    // 3. Wizard: las dos etapas de definicion.
    const msg1 = await request(BASE_URL)
      .post(`/projects/${projectId}/definition/messages`)
      .set('Authorization', token)
      .send({ content: 'Los agentes de soporte no logran priorizar los tickets que llegan.' });
    expect(msg1.status).toBe(201);

    await request(BASE_URL).post(`/projects/${projectId}/definition/advance`).set('Authorization', token);

    const msg2 = await request(BASE_URL)
      .post(`/projects/${projectId}/definition/messages`)
      .set('Authorization', token)
      .send({ content: 'El usuario principal es el agente de soporte que prioriza tickets.' });
    expect(msg2.status).toBe(201);

    // 4. Modelo de datos: genera y aprueba.
    const dataModel = await request(BASE_URL)
      .post(`/projects/${projectId}/data-model/generate`)
      .set('Authorization', token);
    expect(dataModel.status).toBe(201);
    expect(dataModel.body.entities.length).toBeGreaterThan(0);

    const approvedModel = await request(BASE_URL)
      .post(`/projects/${projectId}/data-model/approve`)
      .set('Authorization', token);
    expect(approvedModel.status).toBe(200);
    expect(approvedModel.body.status).toBe('APPROVED');

    // 5. Especificacion de API: genera y aprueba.
    const apiSpec = await request(BASE_URL).post(`/projects/${projectId}/api-spec/generate`).set('Authorization', token);
    expect(apiSpec.status).toBe(201);
    expect(apiSpec.body.endpoints.length).toBeGreaterThan(0);

    const approvedSpec = await request(BASE_URL)
      .post(`/projects/${projectId}/api-spec/approve`)
      .set('Authorization', token);
    expect(approvedSpec.status).toBe(200);

    // 6. Pantallas: genera (sin aprobacion, no tiene ese ciclo de vida).
    const screens = await request(BASE_URL).post(`/projects/${projectId}/screens/generate`).set('Authorization', token);
    expect(screens.status).toBe(201);
    expect(screens.body.screens.length).toBeGreaterThan(0);

    // 7. Arquitectura: recomienda y el owner confirma.
    const recommendation = await request(BASE_URL)
      .post(`/projects/${projectId}/architecture/recommend`)
      .set('Authorization', token);
    expect(recommendation.status).toBe(201);
    expect(recommendation.body.recommendedId).toBeTruthy();

    const selected = await request(BASE_URL)
      .post(`/projects/${projectId}/architecture/select`)
      .set('Authorization', token)
      .send({ architectureId: recommendation.body.recommendedId });
    expect(selected.status).toBe(200);

    // 8. Revision final: tiene que estar lista para generar.
    const review = await request(BASE_URL).get(`/projects/${projectId}/review-summary`).set('Authorization', token);
    expect(review.status).toBe(200);
    expect(review.body.readyToGenerate).toBe(true);
    expect(review.body.blockingQuestions).toEqual([]);
    expect(review.body.inconsistencies).toEqual([]);

    // 9. Documentos finales: los 2 se generan y tienen estructura minima (T-041.2).
    const specDoc = await request(BASE_URL).post(`/projects/${projectId}/documents/spec`).set('Authorization', token);
    expect(specDoc.status).toBe(201);
    expect(specDoc.body.content).toContain('## 1. Problema y contexto');
    expect(specDoc.body.content).toContain('## 5. Modelo de datos');
    expect(specDoc.body.content).toContain('## 6. Endpoints de la API');
    expect(specDoc.body.content).toContain('## 7. Interfaz de usuario');

    const architectureDoc = await request(BASE_URL)
      .post(`/projects/${projectId}/documents/architecture`)
      .set('Authorization', token);
    expect(architectureDoc.status).toBe(201);
    expect(architectureDoc.body.content).toContain('## 1. Arquitectura seleccionada');
    expect(architectureDoc.body.content).toContain(recommendation.body.recommendedId);

    // 10. Descarga conjunta: el resultado final que recibe la persona.
    const bundle = await request(BASE_URL)
      .get(`/projects/${projectId}/documents/bundle`)
      .set('Authorization', token)
      .responseType('blob');
    expect(bundle.status).toBe(200);
    expect(bundle.headers['content-type']).toContain('application/zip');
    expect(bundle.body.slice(0, 2).toString()).toBe('PK');

    // 11. Logout: cierra la sesion que uso toda la corrida.
    const logout = await request(BASE_URL).post('/auth/logout').set('Authorization', token);
    expect(logout.status).toBe(204);

    const despuesDeLogout = await request(BASE_URL).get('/projects').set('Authorization', token);
    expect(despuesDeLogout.status).toBe(401);
  });
});
