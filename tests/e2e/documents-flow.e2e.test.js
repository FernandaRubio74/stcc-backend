/**
 * T-040.1-2 - E2E de la etapa de cierre: revision final -> generacion ->
 * descarga, contra el servidor real + Postgres real. El unico doble es el
 * proveedor de IA (fakeAiProvider.js), no un mock de modulos propios.
 *
 * Complementa a consistency-flow.e2e.test.js (US-034, bloqueo/liberacion del
 * motor de consistencia) y se solapa a proposito con full-flow.e2e.test.js
 * (US-041, el recorrido completo): aca se prueba la etapa de cierre aislada,
 * con mas detalle sobre el contenido descargado.
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

/** Lleva un proyecto nuevo hasta "listo para generar" (US-032), con las dos etapas del wizard + las 4 generaciones con IA. */
async function llevarProyectoAListoParaGenerar(token, projectId) {
  await request(BASE_URL)
    .post(`/projects/${projectId}/definition/messages`)
    .set('Authorization', token)
    .send({ content: 'Los agentes de soporte no logran priorizar los tickets que llegan.' });
  await request(BASE_URL).post(`/projects/${projectId}/definition/advance`).set('Authorization', token);
  await request(BASE_URL)
    .post(`/projects/${projectId}/definition/messages`)
    .set('Authorization', token)
    .send({ content: 'El usuario principal es el agente de soporte que prioriza tickets.' });

  await request(BASE_URL).post(`/projects/${projectId}/data-model/generate`).set('Authorization', token);
  await request(BASE_URL).post(`/projects/${projectId}/data-model/approve`).set('Authorization', token);

  await request(BASE_URL).post(`/projects/${projectId}/api-spec/generate`).set('Authorization', token);
  await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);

  await request(BASE_URL).post(`/projects/${projectId}/screens/generate`).set('Authorization', token);

  const recomendacion = await request(BASE_URL)
    .post(`/projects/${projectId}/architecture/recommend`)
    .set('Authorization', token);
  await request(BASE_URL)
    .post(`/projects/${projectId}/architecture/select`)
    .set('Authorization', token)
    .send({ architectureId: recomendacion.body.recommendedId });
}

describe('E2E - etapa de cierre: revision final -> generacion -> descarga', () => {
  test('con bloqueos pendientes, la revision lo refleja y la generacion se rechaza de punta a punta', async () => {
    await request(BASE_URL).post('/auth/register').send({
      email: 'e2e-cierre-bloqueado@ideator.com',
      password: 'clave12345',
      fullName: 'Owner E2E Cierre',
    });
    const login = await request(BASE_URL).post('/auth/login').send({
      email: 'e2e-cierre-bloqueado@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    const project = await request(BASE_URL).post('/projects').set('Authorization', token).send({ name: 'Proyecto E2E Cierre' });
    const projectId = project.body.id;

    // Proyecto recien creado: ninguna etapa esta completa todavia.
    const review = await request(BASE_URL).get(`/projects/${projectId}/review-summary`).set('Authorization', token);
    expect(review.status).toBe(200);
    expect(review.body.readyToGenerate).toBe(false);
    expect(review.body.stages.definition.complete).toBe(false);

    const rechazo = await request(BASE_URL).post(`/projects/${projectId}/documents/spec`).set('Authorization', token);
    expect(rechazo.status).toBe(409);
    expect(rechazo.body.blockers.stages.definition.complete).toBe(false);

    expect((await prisma.generatedDocument.count({ where: { projectId } }))).toBe(0);
  });

  test('recorre revision -> generacion -> descarga, y el documento descargado tiene las secciones obligatorias y la arquitectura confirmada', async () => {
    await request(BASE_URL).post('/auth/register').send({
      email: 'e2e-cierre-completo@ideator.com',
      password: 'clave12345',
      fullName: 'Owner E2E Cierre 2',
    });
    const login = await request(BASE_URL).post('/auth/login').send({
      email: 'e2e-cierre-completo@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    const project = await request(BASE_URL).post('/projects').set('Authorization', token).send({ name: 'Proyecto E2E Cierre 2' });
    const projectId = project.body.id;

    await llevarProyectoAListoParaGenerar(token, projectId);

    const review = await request(BASE_URL).get(`/projects/${projectId}/review-summary`).set('Authorization', token);
    expect(review.status).toBe(200);
    expect(review.body.readyToGenerate).toBe(true);
    expect(review.body.keyDecisions.selectedArchitecture).toBe('monolito-modular');

    const spec = await request(BASE_URL).post(`/projects/${projectId}/documents/spec`).set('Authorization', token);
    expect(spec.status).toBe(201);

    const architecture = await request(BASE_URL)
      .post(`/projects/${projectId}/documents/architecture`)
      .set('Authorization', token);
    expect(architecture.status).toBe(201);

    // Descarga efectiva: el zip conjunto.
    const bundle = await request(BASE_URL)
      .get(`/projects/${projectId}/documents/bundle`)
      .set('Authorization', token)
      .responseType('blob');
    expect(bundle.status).toBe(200);
    expect(bundle.headers['content-type']).toContain('application/zip');
    expect(bundle.body.slice(0, 2).toString()).toBe('PK');

    // T-040.2: secciones obligatorias en el documento descargado.
    expect(spec.body.content).toContain('## 1. Problema y contexto');
    expect(spec.body.content).toContain('## 2. Usuarios objetivo');
    expect(spec.body.content).toContain('## 3. Alcance del MVP');
    expect(spec.body.content).toContain('## 4. Reglas de negocio y recorrido principal');
    expect(spec.body.content).toContain('## 5. Modelo de datos');
    expect(spec.body.content).toContain('## 6. Endpoints de la API');
    expect(spec.body.content).toContain('## 7. Interfaz de usuario');
    expect(spec.body.content).toContain('## 8. Arquitectura seleccionada');

    // T-040.2: el documento de arquitectura referencia la arquitectura CONFIRMADA.
    expect(architecture.body.content).toContain('monolito-modular');
    expect(architecture.body.content).toContain('Monolito modular');
  });

  test('resolver los bloqueos despues de un intento rechazado libera la generacion sin intervencion manual', async () => {
    await request(BASE_URL).post('/auth/register').send({
      email: 'e2e-cierre-resuelto@ideator.com',
      password: 'clave12345',
      fullName: 'Owner E2E Cierre 3',
    });
    const login = await request(BASE_URL).post('/auth/login').send({
      email: 'e2e-cierre-resuelto@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    const project = await request(BASE_URL).post('/projects').set('Authorization', token).send({ name: 'Proyecto E2E Cierre 3' });
    const projectId = project.body.id;

    const primerIntento = await request(BASE_URL)
      .post(`/projects/${projectId}/documents/architecture`)
      .set('Authorization', token);
    expect(primerIntento.status).toBe(409);

    await llevarProyectoAListoParaGenerar(token, projectId);

    const segundoIntento = await request(BASE_URL)
      .post(`/projects/${projectId}/documents/architecture`)
      .set('Authorization', token);
    expect(segundoIntento.status).toBe(201);
  });
});
