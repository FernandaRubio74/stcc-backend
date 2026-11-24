/**
 * Tests funcionales de /projects/:projectId/screens sobre HTTP real.
 * La IA se mockea a nivel de modulo (igual que data-model.routes.test.js).
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');
const aiService = require('../../src/modules/ai/ai.service');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

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

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: [] };

const VALID_ENTITIES = [
  { name: 'Ticket', attributes: [{ name: 'title', type: 'string', required: true, unique: false }] },
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
    purpose: 'Permite la priorizacion de tickets',
    mainElements: [{ type: 'list', label: 'Lista de tickets', dataField: 'Ticket.title', endpointRef: 'GET /tickets' }],
    visibleToRoles: ['owner', 'editor', 'viewer'],
  },
];

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function crearContextoAprobado(projectId, ownerId, mvpScope = MVP_SCOPE) {
  await prisma.projectDefinition.create({ data: { projectId, mvpScope } });
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
  test('responde 409 si no hay modelo de datos ni especificacion de API aprobados', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera el DRAFT del mapa de pantallas cuando hay modelo y API aprobados', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.screens).toEqual(VALID_SCREENS);
    expect(res.body.diagram).toContain('flowchart TD');
  });

  // Hallazgo H-04 de la revision transversal: antes esto respondia 502 y
  // frenaba la generacion. La cobertura MVP<->pantallas se decidia por
  // coincidencia de palabras sobre texto libre, asi que podia rechazar un
  // mapa correcto; ahora es diagnostico y no bloquea. Lo que sigue
  // bloqueando son las validaciones estructurales exactas (ver el test de
  // abajo: campo/endpoint inexistente -> 502).
  test('ya NO responde 502 por cobertura MVP heuristica: genera el mapa igual', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id, { in: ['Facturacion electronica'], out: [] });
    aiService.requestStructuredJson.mockResolvedValue({
      screens: [
        {
          name: 'Login',
          purpose: 'Autenticacion',
          mainElements: [{ type: 'form', label: 'Login', dataField: null, endpointRef: null }],
          visibleToRoles: ['owner', 'editor', 'viewer'],
        },
      ],
      navigation: [],
    });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.screens).toHaveLength(1);
  });

  test('responde 502 si un elemento referencia un campo o endpoint que no existe', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({
      screens: [
        {
          ...VALID_SCREENS[0],
          mainElements: [{ type: 'list', label: 'Lista', dataField: 'Ticket.inventado', endpointRef: null }],
        },
      ],
      navigation: [],
    });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(502);
  });
});

describe('POST /projects/:projectId/screens/refine', () => {
  test('responde 409 si todavia no hay ningun mapa generado para ajustar', async () => {
    const owner = await crearUsuario('owner-refine1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);

    const res = await request(app)
      .post(`/projects/${project.id}/screens/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega una pantalla de reportes' });

    expect(res.status).toBe(409);
  });

  test('aplica la instruccion sobre el DRAFT existente (chatbot transversal)', async () => {
    const owner = await crearUsuario('owner-refine2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });
    await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const editado = [{ ...VALID_SCREENS[0], purpose: 'Priorizacion de tickets, ahora con filtros' }];
    aiService.requestStructuredJson.mockResolvedValue({ screens: editado, navigation: [] });

    const res = await request(app)
      .post(`/projects/${project.id}/screens/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega filtros a la pantalla de tickets' });

    expect(res.status).toBe(200);
    expect(res.body.screens[0].purpose).toBe('Priorizacion de tickets, ahora con filtros');
  });
});

describe('PATCH /projects/:projectId/screens', () => {
  test('actualiza el DRAFT vigente', async () => {
    const owner = await crearUsuario('owner7@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });
    await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const editado = [{ ...VALID_SCREENS[0], purpose: 'Priorizacion de tickets, version editada' }];
    const res = await request(app)
      .patch(`/projects/${project.id}/screens`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ screens: editado, navigation: [] });

    expect(res.status).toBe(200);
    expect(res.body.screens[0].purpose).toBe('Priorizacion de tickets, version editada');
  });
});

describe('POST /projects/:projectId/screens/approve', () => {
  test('aprueba el DRAFT vigente', async () => {
    const owner = await crearUsuario('owner8@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });
    await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const res = await request(app)
      .post(`/projects/${project.id}/screens/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  test('un editor no puede aprobar (403)', async () => {
    const owner = await crearUsuario('owner9@ideator.com');
    const editor = await crearUsuario('editor9@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });
    await crearContextoAprobado(project.id, owner.id);
    aiService.requestStructuredJson.mockResolvedValue({ screens: VALID_SCREENS, navigation: [] });
    await request(app)
      .post(`/projects/${project.id}/screens/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const res = await request(app)
      .post(`/projects/${project.id}/screens/approve`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`);

    expect(res.status).toBe(403);
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

  test('devuelve draft y approved en null si todavia no se genero nada', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/screens`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null, approved: null });
  });
});
