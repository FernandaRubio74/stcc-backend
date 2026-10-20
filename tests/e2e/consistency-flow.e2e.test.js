/**
 * T-034.1-2 - E2E de deteccion de inconsistencias (US-031/US-032) contra el
 * servidor real + Postgres real. Cada escenario arma una base consistente a
 * mano (via PATCH entities/endpoints, no /generate) para no depender del
 * contenido exacto de fakeAiProvider.js mas alla de las dos etapas del
 * wizard que si necesitamos (problema y usuarios objetivo, para obtener un
 * `targetUsers`/`mvpScope` reales sobre los que el motor de consistencia
 * pueda chequear), y despues reproduce un ciclo completo
 * bloqueo -> correccion -> liberacion automatica contra
 * /consistency-check y /consistency-check/final-generation.
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

/**
 * Registra un usuario, crea un proyecto y completa las dos etapas del
 * wizard con las respuestas canonicas de fakeAiProvider.js, que dejan
 * `targetUsers: [{ label: 'Agente de soporte' }]` y
 * `mvpScope.out: ['Reportes avanzados']` en la definicion del proyecto.
 */
async function createProjectWithDefinition(email) {
  await request(BASE_URL).post('/auth/register').send({
    email,
    password: 'clave12345',
    fullName: 'Owner E2E Consistencia',
  });
  const login = await request(BASE_URL).post('/auth/login').send({ email, password: 'clave12345' });
  const token = `Bearer ${login.body.token}`;

  const project = await request(BASE_URL).post('/projects').set('Authorization', token).send({
    name: 'Proyecto E2E Consistencia',
  });
  const projectId = project.body.id;

  await request(BASE_URL)
    .post(`/projects/${projectId}/definition/messages`)
    .set('Authorization', token)
    .send({ content: 'Los agentes de soporte no logran priorizar los tickets que llegan.' });
  await request(BASE_URL).post(`/projects/${projectId}/definition/advance`).set('Authorization', token);
  await request(BASE_URL)
    .post(`/projects/${projectId}/definition/messages`)
    .set('Authorization', token)
    .send({ content: 'El usuario principal es el agente de soporte que prioriza tickets.' });

  return { token, projectId };
}

const BASE_ENTITIES = [
  { name: 'Ticket', attributes: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'title', type: 'string' }] },
  { name: 'Agent', attributes: [{ name: 'id', type: 'uuid', primaryKey: true }] },
];

const BASE_ENDPOINTS = [
  {
    method: 'GET',
    path: '/tickets',
    description: 'Lista los tickets asignados a un agente de soporte',
    resourceEntity: 'Ticket',
    responses: [{ status: 200, description: 'ok' }],
  },
  {
    method: 'GET',
    path: '/agents',
    description: 'Lista los agentes registrados',
    resourceEntity: 'Agent',
    responses: [{ status: 200, description: 'ok' }],
  },
];

/** Arma y aprueba un modelo de datos + especificacion de API consistentes entre si y con `targetUsers`. */
async function setUpConsistentBaseline(token, projectId) {
  await request(BASE_URL)
    .patch(`/projects/${projectId}/data-model/entities`)
    .set('Authorization', token)
    .send({ entities: BASE_ENTITIES });
  await request(BASE_URL).post(`/projects/${projectId}/data-model/approve`).set('Authorization', token);

  await request(BASE_URL)
    .patch(`/projects/${projectId}/api-spec/endpoints`)
    .set('Authorization', token)
    .send({ endpoints: BASE_ENDPOINTS });
  await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);
}

async function getConsistency(token, projectId) {
  return request(BASE_URL).get(`/projects/${projectId}/consistency-check`).set('Authorization', token);
}

async function postFinalGeneration(token, projectId) {
  return request(BASE_URL)
    .post(`/projects/${projectId}/consistency-check/final-generation`)
    .set('Authorization', token);
}

describe('E2E - motor de consistencia: bloqueo y liberacion automatica', () => {
  test('la base armada a mano es consistente y permite la generacion final', async () => {
    const { token, projectId } = await createProjectWithDefinition('e2e-consistencia-base@ideator.com');
    await setUpConsistentBaseline(token, projectId);

    const check = await getConsistency(token, projectId);
    expect(check.status).toBe(200);
    expect(check.body.isConsistent).toBe(true);
    expect(check.body.issues).toEqual([]);

    const final = await postFinalGeneration(token, projectId);
    expect(final.status).toBe(200);
    expect(final.body.status).toBe('ready');
  });

  test('tipo 1 (entities-coverage): editar y aprobar un modelo de datos que quita una entidad usada por la API bloquea la generacion, y restaurarla la libera sin intervencion manual', async () => {
    const { token, projectId } = await createProjectWithDefinition('e2e-consistencia-entidades@ideator.com');
    await setUpConsistentBaseline(token, projectId);

    // Se aprueba un nuevo modelo de datos sin "Agent", que el api-spec (ya aprobado) todavia referencia.
    const drift = await request(BASE_URL)
      .patch(`/projects/${projectId}/data-model/entities`)
      .set('Authorization', token)
      .send({ entities: [BASE_ENTITIES[0]] });
    expect(drift.status).toBe(200);
    await request(BASE_URL).post(`/projects/${projectId}/data-model/approve`).set('Authorization', token);

    const blockedCheck = await getConsistency(token, projectId);
    expect(blockedCheck.body.isConsistent).toBe(false);
    expect(blockedCheck.body.issues.map((issue) => issue.rule)).toContain('entities-coverage');

    const blockedGeneration = await postFinalGeneration(token, projectId);
    expect(blockedGeneration.status).toBe(409);
    expect(blockedGeneration.body.issues.map((issue) => issue.rule)).toContain('entities-coverage');

    // Se corrige aprobando un modelo que vuelve a incluir "Agent" — sin tocar la API ni resetear nada a mano.
    await request(BASE_URL)
      .patch(`/projects/${projectId}/data-model/entities`)
      .set('Authorization', token)
      .send({ entities: BASE_ENTITIES });
    await request(BASE_URL).post(`/projects/${projectId}/data-model/approve`).set('Authorization', token);

    const releasedCheck = await getConsistency(token, projectId);
    expect(releasedCheck.body.isConsistent).toBe(true);

    const releasedGeneration = await postFinalGeneration(token, projectId);
    expect(releasedGeneration.status).toBe(200);
  });

  test('tipo 2 (target-users-coverage): aprobar una API que ya no menciona al usuario objetivo bloquea la generacion, y volver a mencionarlo la libera sin intervencion manual', async () => {
    const { token, projectId } = await createProjectWithDefinition('e2e-consistencia-usuarios@ideator.com');
    await setUpConsistentBaseline(token, projectId);

    // Nueva version de la API cuyas descripciones ya no mencionan al "Agente de soporte" en ningun lado.
    const driftedEndpoints = BASE_ENDPOINTS.map((endpoint) => ({ ...endpoint, description: 'Operacion sobre tickets' }));
    await request(BASE_URL)
      .patch(`/projects/${projectId}/api-spec/endpoints`)
      .set('Authorization', token)
      .send({ endpoints: driftedEndpoints });
    await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);

    const blockedCheck = await getConsistency(token, projectId);
    expect(blockedCheck.body.isConsistent).toBe(false);
    expect(blockedCheck.body.issues.map((issue) => issue.rule)).toContain('target-users-coverage');

    const blockedGeneration = await postFinalGeneration(token, projectId);
    expect(blockedGeneration.status).toBe(409);
    expect(blockedGeneration.body.issues.map((issue) => issue.rule)).toContain('target-users-coverage');

    // Se corrige aprobando una API que vuelve a reflejar al usuario objetivo.
    await request(BASE_URL)
      .patch(`/projects/${projectId}/api-spec/endpoints`)
      .set('Authorization', token)
      .send({ endpoints: BASE_ENDPOINTS });
    await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);

    const releasedCheck = await getConsistency(token, projectId);
    expect(releasedCheck.body.isConsistent).toBe(true);

    const releasedGeneration = await postFinalGeneration(token, projectId);
    expect(releasedGeneration.status).toBe(200);
  });

  test('tipo 3 (mvp-scope-drift): aprobar una API que expone algo explicitamente fuera del MVP bloquea la generacion, y quitarlo la libera sin intervencion manual', async () => {
    const { token, projectId } = await createProjectWithDefinition('e2e-consistencia-scope@ideator.com');
    await setUpConsistentBaseline(token, projectId);

    // "Reportes avanzados" esta en mvpScope.out (respuesta canonica de TARGET_USERS_SCOPE), pero esta nueva
    // version de la API lo expone igual.
    const driftedEndpoints = [
      ...BASE_ENDPOINTS,
      {
        method: 'GET',
        path: '/reports',
        description: 'Genera reportes avanzados de tickets resueltos',
        resourceEntity: 'Ticket',
        responses: [{ status: 200, description: 'ok' }],
      },
    ];
    await request(BASE_URL)
      .patch(`/projects/${projectId}/api-spec/endpoints`)
      .set('Authorization', token)
      .send({ endpoints: driftedEndpoints });
    await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);

    const blockedCheck = await getConsistency(token, projectId);
    expect(blockedCheck.body.isConsistent).toBe(false);
    expect(blockedCheck.body.issues.map((issue) => issue.rule)).toContain('mvp-scope-drift');

    const blockedGeneration = await postFinalGeneration(token, projectId);
    expect(blockedGeneration.status).toBe(409);
    expect(blockedGeneration.body.issues.map((issue) => issue.rule)).toContain('mvp-scope-drift');

    // Se corrige aprobando una API que vuelve a estar dentro del alcance del MVP.
    await request(BASE_URL)
      .patch(`/projects/${projectId}/api-spec/endpoints`)
      .set('Authorization', token)
      .send({ endpoints: BASE_ENDPOINTS });
    await request(BASE_URL).post(`/projects/${projectId}/api-spec/approve`).set('Authorization', token);

    const releasedCheck = await getConsistency(token, projectId);
    expect(releasedCheck.body.isConsistent).toBe(true);

    const releasedGeneration = await postFinalGeneration(token, projectId);
    expect(releasedGeneration.status).toBe(200);
  });
});
