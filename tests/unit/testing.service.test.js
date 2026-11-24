/**
 * Tests del servicio de la etapa "Pruebas": generacion con IA mockeada,
 * validacion de cobertura (requisitos del MVP, endpoints y pantallas),
 * transiciones de estado del versionado y precondiciones contra las 4
 * etapas previas (modelo de datos, API, pantallas, arquitectura).
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const { withFieldEncryption } = require('../../src/database/fieldEncryption');
const projectsService = require('../../src/modules/projects/projects.service');
const dataModelService = require('../../src/modules/data-model/data-model.service');
const apiSpecService = require('../../src/modules/api-spec/api-spec.service');
const screensService = require('../../src/modules/screens/screens.service');
const architectureService = require('../../src/modules/architecture/architecture.service');
const testingService = require('../../src/modules/testing/testing.service');
const { InsufficientContextError, DraftNotFoundError, CoverageGapError } = require('../../src/modules/testing/testing.errors');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = withFieldEncryption(new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } }));

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

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const VALID_ENTITIES = [
  {
    name: 'Ticket',
    attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }],
    indexes: [],
  },
];
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
  {
    name: 'Tickets',
    purpose: 'listar tickets',
    mainElements: [{ type: 'list', label: 'Lista de tickets', dataField: 'Ticket.title', endpointRef: 'GET /tickets' }],
    visibleToRoles: ['owner', 'editor', 'viewer'],
  },
];

const FULL_COVERAGE_TEST_PLAN = {
  strategy: {
    inScope: ['listar tickets'],
    outOfScope: ['pruebas de carga'],
    riskPriorities: [{ item: 'listar tickets', risk: 'alto', rationale: 'es el core del MVP' }],
  },
  acceptanceCases: [{ id: 'AC-1', ruleRef: 'listar tickets', given: 'dado un ticket', when: 'cuando se lista', then: 'entonces aparece' }],
  endpointCases: [{ endpointRef: 'GET /tickets', happyPath: 'devuelve 200 con la lista', invalidData: 'rechaza filtros invalidos', unauthorized: 'devuelve 401 sin token' }],
  screenCases: [{ screenRef: 'Tickets', loading: 'muestra spinner', empty: 'muestra estado vacio', error: 'muestra mensaje de error' }],
  e2eFlows: [{ name: 'Ver tickets', steps: ['Ingresa', 'Ve la lista'], relatedCaseIds: ['AC-1'] }],
  securityCases: [
    { id: 'SEC-1', description: 'un viewer no puede crear tickets', type: 'permisos' },
    { id: 'SEC-2', description: 'acceder a un ticket de otro proyecto adivinando el id', type: 'id-adivinado' },
    { id: 'SEC-3', description: 'request con token JWT vencido', type: 'token-vencido' },
  ],
  negativeCases: [{ id: 'NEG-1', description: 'crear un ticket sin titulo', expectedRejection: '400 por validacion' }],
  usabilityCases: [{ id: 'UX-1', description: 'el foco de teclado es visible al navegar la lista' }],
  testData: [{ entity: 'Ticket', environment: 'desarrollo', description: '5 a 10 tickets variados' }],
  traceabilityMatrix: [{ requirementRef: 'listar tickets', caseIds: ['AC-1'] }],
};

function fakeAi(testPlan) {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ testPlan }) };
}

async function crearProyectoListoParaPruebas() {
  const owner = await prisma.user.create({ data: { email: `owner-${Date.now()}-${Math.random()}@genial.com`, fullName: 'Owner' } });
  const editor = await prisma.user.create({ data: { email: `editor-${Date.now()}-${Math.random()}@genial.com`, fullName: 'Editor' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });

  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'Cliente', description: 'x' }],
      mvpScope: { in: ['listar tickets'], out: [] },
      userJourney: ['paso 1'],
    },
  });
  await dataModelService.generateDataModel(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ entities: VALID_ENTITIES }) },
  });
  await dataModelService.approveVersion(project.id, owner.id);
  await apiSpecService.generateApiSpec(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ endpoints: VALID_ENDPOINTS }) },
  });
  await apiSpecService.approveVersion(project.id, owner.id);
  await screensService.generateScreenMap(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ screens: VALID_SCREENS, navigation: [] }) },
  });
  await screensService.approveVersion(project.id, owner.id);
  await architectureService.recommendArchitecture(project.id, owner.id, {
    ai: { requestStructuredJson: jest.fn().mockResolvedValue({ recommendedId: 'monolito-modular', justification: 'x' }) },
  });
  await architectureService.selectArchitecture(project.id, owner.id, 'monolito-modular');

  return { owner, editor, project };
}

describe('generateTestPlan', () => {
  test('lanza InsufficientContextError si falta alguna de las 4 etapas previas', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@genial.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) })).rejects.toThrow(
      InsufficientContextError
    );
  });

  test('crea la primera version DRAFT (versionNumber=1) con el plan devuelto por la IA', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();

    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.status).toBe('DRAFT');
    expect(draft.createdById).toBe(owner.id);
    expect(draft.content.acceptanceCases).toHaveLength(1);
  });

  test('regenerar sobreescribe el DRAFT existente en vez de crear una version nueva', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });

    const otroPlan = { ...FULL_COVERAGE_TEST_PLAN, usabilityCases: [] };
    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(otroPlan) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.content.usabilityCases).toEqual([]);
  });

  // Bug reportado: si la IA se saltaba una pantalla, la generacion entera
  // se descartaba con un 409 y no quedaba nada persistido, asi que volver a
  // generar era repetir la misma loteria. Ahora el plan se guarda y los
  // huecos se informan en `coverageGaps`; el gate real es la aprobacion.
  test('guarda el plan e informa el hueco si la IA deja un requisito del MVP sin cobertura', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinTrazabilidad = { ...FULL_COVERAGE_TEST_PLAN, traceabilityMatrix: [] };

    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(sinTrazabilidad) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.coverageGaps.missingRequirements.length).toBeGreaterThan(0);
  });

  test('guarda el plan e informa el hueco si la IA deja un endpoint sin casos de prueba', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinEndpoint = { ...FULL_COVERAGE_TEST_PLAN, endpointCases: [] };

    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(sinEndpoint) });

    expect(draft.coverageGaps.missingEndpoints.length).toBeGreaterThan(0);
  });

  test('guarda el plan e informa el hueco si la IA deja una pantalla sin casos de prueba', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinPantalla = { ...FULL_COVERAGE_TEST_PLAN, screenCases: [] };

    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(sinPantalla) });

    expect(draft.coverageGaps.missingScreens.length).toBeGreaterThan(0);
    const persistido = await testingService.getTestPlanState(project.id);
    expect(persistido.draft).not.toBeNull();
  });

  test('un plan completo no reporta huecos', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();

    const draft = await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });

    expect(draft.coverageGaps).toBeNull();
  });

  test('propaga AiResponseValidationError si la IA devuelve una estructura invalida', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const ai = { requestStructuredJson: jest.fn().mockRejectedValue(new AiResponseValidationError()) };

    await expect(testingService.generateTestPlan(project.id, owner.id, { ai })).rejects.toThrow(AiResponseValidationError);
  });
});

describe('updateTestPlanContent - trazabilidad de autoria y cobertura', () => {
  test('una edicion manual sobre un DRAFT actualiza createdById al editor actual', async () => {
    const { owner, editor, project } = await crearProyectoListoParaPruebas();
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });

    const edited = await testingService.updateTestPlanContent(project.id, editor.id, FULL_COVERAGE_TEST_PLAN);

    expect(edited.versionNumber).toBe(1);
    expect(edited.createdById).toBe(editor.id);
  });

  test('editar despues de aprobar crea una version DRAFT nueva (nunca pisa la aprobada)', async () => {
    const { owner, editor, project } = await crearProyectoListoParaPruebas();
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });
    await testingService.approveVersion(project.id, owner.id);

    const nuevoDraft = await testingService.updateTestPlanContent(project.id, editor.id, FULL_COVERAGE_TEST_PLAN);

    expect(nuevoDraft.versionNumber).toBe(2);
    expect(nuevoDraft.status).toBe('DRAFT');

    const state = await testingService.getTestPlanState(project.id);
    expect(state.approved.versionNumber).toBe(1);
    expect(state.approved.status).toBe('APPROVED');
  });

  // Una edicion manual incompleta tampoco se descarta: se guarda (no se
  // pierde el trabajo) y se informa el hueco. Lo que no se puede es
  // aprobarla asi (ver el describe de approveVersion).
  test('guarda una edicion manual incompleta e informa el endpoint sin casos de prueba', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinEndpoint = { ...FULL_COVERAGE_TEST_PLAN, endpointCases: [] };

    const draft = await testingService.updateTestPlanContent(project.id, owner.id, sinEndpoint);

    expect(draft.coverageGaps.missingEndpoints.length).toBeGreaterThan(0);
    expect(draft.content.endpointCases).toEqual([]);
  });
});

describe('approveVersion - transiciones de estado', () => {
  test('lanza DraftNotFoundError si no hay ningun DRAFT para aprobar', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();

    await expect(testingService.approveVersion(project.id, owner.id)).rejects.toThrow(DraftNotFoundError);
  });

  test('aprueba el DRAFT vigente y lo marca inmutable', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(FULL_COVERAGE_TEST_PLAN) });

    const approved = await testingService.approveVersion(project.id, owner.id);

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe(owner.id);
    expect(approved.approvedAt).not.toBeNull();
  });
});

/**
 * La cobertura completa se exige al APROBAR, no al generar: una version
 * aprobada es la que consumen las etapas siguientes y la revision final,
 * asi que "aprobado implica cobertura completa" tiene que seguir siendo
 * cierto aunque ahora si se pueda guardar un borrador incompleto.
 */
describe('approveVersion - la cobertura completa se exige al aprobar', () => {
  test('no deja aprobar un borrador con pantallas sin casos de prueba', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinPantalla = { ...FULL_COVERAGE_TEST_PLAN, screenCases: [] };
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(sinPantalla) });

    await expect(testingService.approveVersion(project.id, owner.id)).rejects.toThrow(CoverageGapError);
  });

  test('deja aprobar en cuanto el borrador cubre todo', async () => {
    const { owner, project } = await crearProyectoListoParaPruebas();
    const sinPantalla = { ...FULL_COVERAGE_TEST_PLAN, screenCases: [] };
    await testingService.generateTestPlan(project.id, owner.id, { ai: fakeAi(sinPantalla) });

    // Se completa el hueco (lo que haria "Ajustar con IA" o una edicion manual).
    const completado = await testingService.updateTestPlanContent(project.id, owner.id, FULL_COVERAGE_TEST_PLAN);
    expect(completado.coverageGaps).toBeNull();

    const aprobado = await testingService.approveVersion(project.id, owner.id);
    expect(aprobado.status).toBe('APPROVED');
  });
});
