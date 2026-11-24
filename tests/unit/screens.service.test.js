/**
 * T-027.4 - Tests del servicio de mapa de pantallas: generacion con IA
 * mockeada, cobertura MVP/roles, coherencia con modelo/API, y el ciclo
 * DRAFT/APPROVED (igual invariante que data-model/api-spec).
 *
 * Corre contra Postgres real; solo se mockea la IA.
 */
const { PrismaClient } = require('@prisma/client');
const { withFieldEncryption } = require('../../src/database/fieldEncryption');
const projectsService = require('../../src/modules/projects/projects.service');
const screensService = require('../../src/modules/screens/screens.service');
const {
  NoApprovedApiSpecError,
  MvpCoverageError,
  RoleCoverageError,
  ScreenReferenceError,
  InvalidNavigationError,
  DraftNotFoundError,
} = require('../../src/modules/screens/screens.errors');
const { NoApprovedVersionError } = require('../../src/modules/data-model/data-model.errors');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = withFieldEncryption(new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } }));

async function cleanDatabase() {
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

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: ['Reportes avanzados'] };

const VALID_ENTITIES = [
  {
    name: 'Ticket',
    attributes: [
      { name: 'title', type: 'string', required: true, unique: false },
      { name: 'id', type: 'uuid', required: true, unique: true },
    ],
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
    name: 'Cola de tickets',
    purpose: 'Permite la priorizacion de tickets entrantes',
    mainElements: [
      { type: 'list', label: 'Lista de tickets', dataField: 'Ticket.title', endpointRef: 'GET /tickets' },
    ],
    // Las 3 pantallas de ejemplo entre todos los tests tienen que cubrir
    // los 3 roles - aca se cubren los 3 en una sola pantalla por simplicidad.
    visibleToRoles: ['owner', 'editor', 'viewer'],
  },
];

async function crearProyectoConContextoAprobado() {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'x', description: 'y' }],
      mvpScope: MVP_SCOPE,
      userJourney: ['a'],
    },
  });
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
  await prisma.apiSpecVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: 'APPROVED',
      endpoints: VALID_ENDPOINTS,
      createdById: owner.id,
      approvedById: owner.id,
      approvedAt: new Date(),
    },
  });
  return { owner, project };
}

function fakeAi(screens, navigation = []) {
  return { requestStructuredJson: jest.fn().mockResolvedValue({ screens, navigation }) };
}

describe('generateScreenMap', () => {
  test('lanza NoApprovedVersionError si el proyecto todavia no tiene modelo de datos aprobado', async () => {
    const owner = await prisma.user.create({ data: { email: 'o2@ideator.com', fullName: 'O' } });
    const project = await projectsService.createProject({ name: 'Proyecto vacio', userId: owner.id });

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) })
    ).rejects.toThrow(NoApprovedVersionError);
  });

  test('lanza NoApprovedApiSpecError si hay modelo de datos pero no API aprobada', async () => {
    const owner = await prisma.user.create({ data: { email: 'o3@ideator.com', fullName: 'O3' } });
    const project = await projectsService.createProject({ name: 'Sin API', userId: owner.id });
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

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) })
    ).rejects.toThrow(NoApprovedApiSpecError);
  });

  test('genera un DRAFT con diagrama de navegacion', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();

    const draft = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    expect(draft.status).toBe('DRAFT');
    expect(draft.versionNumber).toBe(1);
    expect(draft.screens).toEqual(VALID_SCREENS);
    expect(draft.diagram).toContain('flowchart TD');
    expect(draft.createdById).toBe(owner.id);
  });

  test('regenerar mientras sigue en DRAFT actualiza la misma version (no crea una nueva)', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    const otraVuelta = [{ ...VALID_SCREENS[0], name: 'Tickets priorizados' }];
    const draft = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(otraVuelta) });

    expect(draft.versionNumber).toBe(1);
    expect(draft.screens).toEqual(otraVuelta);
    const count = await prisma.screenMapVersion.count({ where: { projectId: project.id } });
    expect(count).toBe(1);
  });

  test('regenerar despues de aprobar crea una version 2 nueva, sin tocar la aprobada', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });
    await screensService.approveVersion(project.id, owner.id);

    const otraVuelta = [{ ...VALID_SCREENS[0], name: 'Tickets v2' }];
    const draft = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(otraVuelta) });

    expect(draft.versionNumber).toBe(2);
    expect(draft.status).toBe('DRAFT');
    const state = await screensService.getScreenMapState(project.id);
    expect(state.approved.versionNumber).toBe(1);
    expect(state.draft.versionNumber).toBe(2);
  });

  // Hallazgo H-04 de la revision transversal: la cobertura MVP<->pantallas
  // se decidia por coincidencia de palabras sobre texto libre y BLOQUEABA
  // la generacion, asi que un mapa de pantallas correcto podia quedar
  // rechazado solo porque las palabras de la frase del MVP no llegaban al
  // umbral en ningun artefacto. Ahora es diagnostico: la generacion
  // procede, y lo que bloquea son las validaciones estructurales exactas
  // (referencias de datos/endpoints, roles reales, navegacion).
  test('NO bloquea la generacion por cobertura MVP heuristica: el mapa se genera igual', async () => {
    const owner = await prisma.user.create({ data: { email: 'o5@ideator.com', fullName: 'O5' } });
    const project = await projectsService.createProject({ name: 'Proyecto sin cobertura', userId: owner.id });
    await prisma.projectDefinition.create({
      data: {
        projectId: project.id,
        problemSummary: 'resumen',
        targetUsers: [{ label: 'x', description: 'y' }],
        mvpScope: { in: ['Facturacion electronica'], out: [] },
        userJourney: ['a'],
      },
    });
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
    await prisma.apiSpecVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: 'APPROVED',
        endpoints: VALID_ENDPOINTS,
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
      },
    });
    const screensSinCobertura = [
      {
        name: 'Login',
        purpose: 'Autenticacion',
        mainElements: [{ type: 'form', label: 'Formulario de login', dataField: null, endpointRef: null }],
        visibleToRoles: ['owner', 'editor', 'viewer'],
      },
    ];

    const draft = await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(screensSinCobertura) });

    expect(draft.status).toBe('DRAFT');
    expect(draft.screens).toHaveLength(1);
  });

  test('propaga RoleCoverageError si algun rol no tiene ninguna pantalla visible', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    const screensSinRol = [{ ...VALID_SCREENS[0], visibleToRoles: ['owner'] }];

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(screensSinRol) })
    ).rejects.toThrow(RoleCoverageError);
  });

  test('propaga ScreenReferenceError si un elemento referencia un campo que no existe en el modelo aprobado', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    const screensConCampoInventado = [
      {
        ...VALID_SCREENS[0],
        mainElements: [
          { type: 'list', label: 'Lista', dataField: 'Ticket.campoInventado', endpointRef: null },
        ],
      },
    ];

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(screensConCampoInventado) })
    ).rejects.toThrow(ScreenReferenceError);
  });

  test('propaga ScreenReferenceError si un elemento referencia un endpoint que no existe en la API aprobada', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    const screensConEndpointInventado = [
      {
        ...VALID_SCREENS[0],
        mainElements: [{ type: 'button', label: 'Borrar', dataField: null, endpointRef: 'DELETE /tickets/1' }],
      },
    ];

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(screensConEndpointInventado) })
    ).rejects.toThrow(ScreenReferenceError);
  });

  test('propaga InvalidNavigationError si la navegacion referencia una pantalla que no existe', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    const navegacionInvalida = [{ from: 'Cola de tickets', to: 'Pantalla fantasma', label: 'ver' }];

    await expect(
      screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS, navegacionInvalida) })
    ).rejects.toThrow(InvalidNavigationError);
  });

  test('propaga AiResponseValidationError si la IA devuelve una estructura invalida', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    const ai = { requestStructuredJson: jest.fn().mockRejectedValue(new AiResponseValidationError()) };

    await expect(screensService.generateScreenMap(project.id, owner.id, { ai })).rejects.toThrow(
      AiResponseValidationError
    );
  });
});

describe('updateScreens / approveVersion', () => {
  test('actualiza el DRAFT revalidando contra el modelo/API/MVP/roles vigentes', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    const editado = [{ ...VALID_SCREENS[0], purpose: 'Nuevo proposito, priorizacion de tickets' }];
    const draft = await screensService.updateScreens(project.id, owner.id, editado, []);

    expect(draft.versionNumber).toBe(1);
    expect(draft.screens[0].purpose).toBe('Nuevo proposito, priorizacion de tickets');
  });

  test('rechaza la edicion manual si deja un rol sin cobertura', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    const editadoSinRol = [{ ...VALID_SCREENS[0], visibleToRoles: ['owner'] }];

    await expect(screensService.updateScreens(project.id, owner.id, editadoSinRol, [])).rejects.toThrow(
      RoleCoverageError
    );
  });

  test('aprueba el DRAFT vigente', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();
    await screensService.generateScreenMap(project.id, owner.id, { ai: fakeAi(VALID_SCREENS) });

    const approved = await screensService.approveVersion(project.id, owner.id);

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe(owner.id);
  });

  test('lanza DraftNotFoundError si no hay ningun DRAFT para aprobar', async () => {
    const { owner, project } = await crearProyectoConContextoAprobado();

    await expect(screensService.approveVersion(project.id, owner.id)).rejects.toThrow(DraftNotFoundError);
  });
});

describe('getScreenMapState', () => {
  test('devuelve draft y approved en null si todavia no se genero nada', async () => {
    const { project } = await crearProyectoConContextoAprobado();

    const state = await screensService.getScreenMapState(project.id);

    expect(state).toEqual({ draft: null, approved: null });
  });
});
