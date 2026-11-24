/**
 * Tests funcionales de /projects/:projectId/consistency-check sobre HTTP real.
 */
const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

async function cleanDatabase() {
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

const VALID_ENTITIES = [{ name: 'Ticket', attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }];

/**
 * Proyecto con las 4 etapas que mira el motor ya aprobadas y coherentes
 * entre si: es la unica forma de que la generacion final no quede
 * bloqueada por "etapa pendiente" (regla A).
 */
async function sembrarProyectoCompleto(ownerId, projectId, { endpoints } = {}) {
  await prisma.projectDefinition.create({
    data: {
      projectId,
      problemSummary: 'Gestion de tickets de soporte',
      targetUsers: [
        { label: 'Revisador', description: 'Clasifica tickets' },
        { label: 'Supervisor', description: 'Revisa y corrige' },
      ],
      mvpScope: { in: ['Clasificar tickets'], out: ['Pagos en linea'] },
      userJourney: ['Se loguea', 'Clasifica'],
    },
  });
  await prisma.dataModelVersion.create({
    data: { projectId, versionNumber: 1, status: 'APPROVED', entities: VALID_ENTITIES, createdById: ownerId, approvedById: ownerId, approvedAt: new Date() },
  });
  await prisma.apiSpecVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      endpoints:
        endpoints || [
          { method: 'GET', path: '/tickets', description: 'Lista tickets', resourceEntity: 'Ticket', parameters: [], responses: [{ status: 200, description: 'ok' }, { status: 403, description: 'No autorizado' }] },
        ],
      createdById: ownerId,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
  await prisma.screenMapVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      screens: [
        { name: 'TicketsScreen', purpose: 'Clasificar tickets', mainElements: [{ type: 'list', label: 'Tickets', dataField: 'Ticket.title', endpointRef: 'GET /tickets' }], visibleToRoles: ['owner', 'editor', 'viewer'] },
      ],
      navigation: [],
      diagram: 'flowchart TD\n  TicketsScreen["TicketsScreen"]',
      createdById: ownerId,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /projects/:projectId/consistency-check', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const ajeno = await crearUsuario('ajeno1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/consistency-check`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve isConsistent=true sin issues para un proyecto recien creado', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/consistency-check`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ issues: [], isConsistent: true, status: 'pendiente' });
    expect(res.body.pendingStages).toEqual(expect.arrayContaining(['definition', 'data-model', 'api-spec', 'screens']));
  });
});

describe('POST /projects/:projectId/consistency-check/final-generation', () => {
  test('responde 200 si el proyecto esta completo y es consistente', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await sembrarProyectoCompleto(owner.id, project.id);

    const res = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  // Prueba obligatoria 6: revision final con etapas sin generar queda
  // bloqueada, pero con un mensaje de PENDIENTE que dice cual falta - no
  // como si fuera una inconsistencia del proyecto.
  test('responde 409 diciendo que etapas faltan si el proyecto esta incompleto', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('falta generar');
    expect(res.body.error).toContain('el modelo de datos');
    expect(res.body.pendingStages).toEqual(expect.arrayContaining(['data-model', 'api-spec', 'screens']));
    expect(res.body.issues).toEqual([]);
  });

  test('responde 409 con el listado de issues si el proyecto tiene inconsistencias', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await sembrarProyectoCompleto(owner.id, project.id, {
      endpoints: [{ method: 'GET', path: '/invoices', description: 'x', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
    });

    const res = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].rule).toBe('entities-coverage');
  });

  // Prueba obligatoria 5: aplicar la correccion y re-chequear hace
  // desaparecer el hallazgo, sin recrearlo y sin cache obsoleta.
  test('el bloqueo se libera sin intervencion manual una vez resuelta la inconsistencia', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await sembrarProyectoCompleto(owner.id, project.id, {
      endpoints: [{ method: 'GET', path: '/invoices', description: 'x', resourceEntity: 'Invoice', parameters: [], responses: [{ status: 200, description: 'ok' }] }],
    });
    const dataModel = await prisma.dataModelVersion.findFirst({ where: { projectId: project.id } });

    const blocked = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(blocked.status).toBe(409);

    await prisma.dataModelVersion.update({
      where: { id: dataModel.id },
      data: { entities: [...VALID_ENTITIES, { name: 'Invoice', attributes: [{ name: 'total', type: 'decimal', primaryKey: false, unique: false, nullable: false, foreignKey: null }], indexes: [] }] },
    });

    const released = await request(app)
      .post(`/projects/${project.id}/consistency-check/final-generation`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(released.status).toBe(200);

    // Idempotencia: el hallazgo no vuelve a aparecer en el siguiente chequeo.
    const afterFix = await request(app)
      .get(`/projects/${project.id}/consistency-check`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);
    expect(afterFix.body.issues.filter((issue) => issue.status === 'error')).toEqual([]);
    expect(afterFix.body.isConsistent).toBe(true);
  });
});
