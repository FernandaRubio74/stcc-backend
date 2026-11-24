/**
 * Tests funcionales de /projects/:projectId/testing sobre HTTP real.
 * La IA se mockea a nivel de modulo (igual que api-spec.routes.test.js).
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');
const aiService = require('../../src/modules/ai/ai.service');

function tokenDe(userId, email = 'x@genial.com') {
  return generateSessionToken({ id: userId, email });
}

async function cleanDatabase() {
  await prisma.testPlanVersion.deleteMany({});
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

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

const VALID_ENTITIES = [
  { name: 'Ticket', attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] },
];
const VALID_ENDPOINTS = [
  { method: 'GET', path: '/tickets', description: 'Lista tickets', resourceEntity: 'Ticket', parameters: [], responses: [{ status: 200, description: 'ok' }] },
];
const VALID_SCREENS = [
  {
    name: 'Tickets',
    purpose: 'listar tickets',
    mainElements: [{ type: 'list', label: 'Lista de tickets', dataField: null, endpointRef: null }],
    visibleToRoles: ['owner', 'editor', 'viewer'],
  },
];

const FULL_COVERAGE_TEST_PLAN = {
  strategy: { inScope: ['listar tickets'], outOfScope: [], riskPriorities: [] },
  acceptanceCases: [{ id: 'AC-1', ruleRef: 'listar tickets', given: 'dado', when: 'cuando', then: 'entonces' }],
  endpointCases: [{ endpointRef: 'GET /tickets', happyPath: 'ok', invalidData: 'rechaza', unauthorized: '401' }],
  screenCases: [{ screenRef: 'Tickets', loading: 'spinner', empty: 'vacio', error: 'error' }],
  e2eFlows: [],
  securityCases: [],
  negativeCases: [],
  usabilityCases: [],
  testData: [],
  traceabilityMatrix: [{ requirementRef: 'listar tickets', caseIds: ['AC-1'] }],
};

/** Deja el proyecto con las 4 etapas previas aprobadas/completas, listo para la etapa de pruebas. */
async function crearProyectoListoParaPruebas(ownerEmail) {
  const owner = await crearUsuario(ownerEmail);
  const project = await crearProyecto(tokenDe(owner.id));

  await prisma.projectDefinition.create({
    data: { projectId: project.id, mvpScope: { in: ['listar tickets'], out: [] } },
  });
  await prisma.dataModelVersion.create({
    data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
  });
  await prisma.apiSpecVersion.create({
    data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', endpoints: VALID_ENDPOINTS, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
  });
  await prisma.screenMapVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: 'APPROVED',
      screens: VALID_SCREENS,
      navigation: [],
      diagram: 'flowchart TD',
      createdById: owner.id,
      approvedById: owner.id,
      approvedAt: new Date(),
    },
  });
  await prisma.projectArchitecture.create({
    data: { projectId: project.id, selectedId: 'monolito-modular', selectedAt: new Date(), selectedById: owner.id },
  });

  return { owner, project };
}

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /projects/:projectId/testing/generate', () => {
  test('responde 409 si todavia falta alguna etapa previa (ej. arquitectura sin confirmar)', async () => {
    const owner = await crearUsuario('owner1@genial.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: owner.id, approvedById: owner.id, approvedAt: new Date() },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera el DRAFT cuando las 4 etapas previas estan completas y la IA cubre todo', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner2@genial.com');
    aiService.requestStructuredJson.mockResolvedValue({ testPlan: FULL_COVERAGE_TEST_PLAN });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.content.acceptanceCases).toHaveLength(1);
  });

  // Bug reportado: con un hueco de cobertura se devolvia 409 y se perdia
  // todo el plan generado, dejando al usuario sin forma de avanzar.
  // Ahora el borrador se guarda y el hueco viaja en `coverageGaps` para
  // que la interfaz lo muestre y se pueda completar.
  test('guarda el borrador y devuelve coverageGaps si la IA deja un endpoint sin casos de prueba', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner3@genial.com');
    aiService.requestStructuredJson.mockResolvedValue({ testPlan: { ...FULL_COVERAGE_TEST_PLAN, endpointCases: [] } });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.coverageGaps.missingEndpoints).toEqual(['GET /tickets']);

    const estado = await request(app)
      .get(`/projects/${project.id}/testing`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(estado.body.draft).not.toBeNull();
  });

  test('no deja aprobar mientras queden huecos de cobertura', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner4@genial.com');
    aiService.requestStructuredJson.mockResolvedValue({ testPlan: { ...FULL_COVERAGE_TEST_PLAN, endpointCases: [] } });
    await request(app).post(`/projects/${project.id}/testing/generate`).set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const res = await request(app)
      .post(`/projects/${project.id}/testing/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.gaps.missingEndpoints).toEqual(['GET /tickets']);
  });
});

describe('POST /projects/:projectId/testing/refine', () => {
  test('responde 409 si todavia no hay ningun plan generado para ajustar', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner-refine1@genial.com');

    const res = await request(app)
      .post(`/projects/${project.id}/testing/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega un caso de seguridad mas' });

    expect(res.status).toBe(409);
  });

  test('aplica la instruccion sobre el DRAFT existente (chatbot transversal)', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner-refine2@genial.com');
    aiService.requestStructuredJson.mockResolvedValue({ testPlan: FULL_COVERAGE_TEST_PLAN });
    await request(app)
      .post(`/projects/${project.id}/testing/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const planAjustado = {
      ...FULL_COVERAGE_TEST_PLAN,
      usabilityCases: [...FULL_COVERAGE_TEST_PLAN.usabilityCases, { id: 'UX-2', description: 'contraste de colores AA' }],
    };
    aiService.requestStructuredJson.mockResolvedValue({ testPlan: planAjustado });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega un caso de usabilidad sobre contraste de colores' });

    expect(res.status).toBe(200);
    expect(res.body.content.usabilityCases).toHaveLength(1);
    expect(res.body.content.usabilityCases[0].id).toBe('UX-2');
  });
});

describe('PATCH /projects/:projectId/testing/content', () => {
  test('un viewer recibe 403', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner4@genial.com');
    const viewer = await crearUsuario('viewer4@genial.com');
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'viewer' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/testing/content`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`)
      .send({ content: FULL_COVERAGE_TEST_PLAN });

    expect(res.status).toBe(403);
  });

  test('un editor puede editar el plan de pruebas', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner5@genial.com');
    const editor = await crearUsuario('editor5@genial.com');
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/testing/content`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`)
      .send({ content: FULL_COVERAGE_TEST_PLAN });

    expect(res.status).toBe(200);
    expect(res.body.createdById).toBe(editor.id);
  });

  test('rechaza un content sin el shape esperado con 400 (validacion de Zod en la ruta)', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner5b@genial.com');

    const res = await request(app)
      .patch(`/projects/${project.id}/testing/content`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ content: {} });

    expect(res.status).toBe(400);
  });
});

describe('POST /projects/:projectId/testing/approve', () => {
  test('un editor (no owner) recibe 403', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner6@genial.com');
    const editor = await crearUsuario('editor6@genial.com');
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });
    await prisma.testPlanVersion.create({
      data: { projectId: project.id, versionNumber: 1, content: FULL_COVERAGE_TEST_PLAN, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/approve`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`);

    expect(res.status).toBe(403);
  });

  test('el owner aprueba el DRAFT vigente', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner7@genial.com');
    await prisma.testPlanVersion.create({
      data: { projectId: project.id, versionNumber: 1, content: FULL_COVERAGE_TEST_PLAN, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/testing/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  test('responde 409 si no hay ningun DRAFT para aprobar', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas('owner8@genial.com');

    const res = await request(app)
      .post(`/projects/${project.id}/testing/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });
});

describe('GET /projects/:projectId/testing', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner9@genial.com');
    const ajeno = await crearUsuario('ajeno9@genial.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/testing`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve draft=null y approved=null si todavia no se genero nada', async () => {
    const owner = await crearUsuario('owner10@genial.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/testing`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null, approved: null });
  });
});
