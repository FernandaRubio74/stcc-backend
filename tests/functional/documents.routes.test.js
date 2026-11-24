/**
 * T-035.2/T-035.4 - Tests funcionales de /projects/:projectId/documents sobre
 * HTTP real: generacion, bloqueo 409 con el detalle, historial y permisos.
 */
const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

async function cleanDatabase() {
  await prisma.generatedDocument.deleteMany({});
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

async function completarTodasLasEtapas(projectId, ownerId) {
  await prisma.projectDefinition.create({
    data: {
      projectId,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'Cliente', description: 'x' }],
      mvpScope: { in: ['feature'], out: [] },
      userJourney: ['paso 1'],
    },
  });
  await prisma.dataModelVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      entities: [
        {
          name: 'Ticket',
          attributes: [
            { name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null },
          ],
          indexes: [],
        },
      ],
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
      endpoints: [
        {
          method: 'GET',
          path: '/tickets',
          description: 'Lista tickets',
          resourceEntity: 'Ticket',
          parameters: [],
          responses: [{ status: 200, description: 'ok' }],
        },
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
        {
          name: 'Tickets',
          purpose: 'feature para el cliente',
          mainElements: [{ type: 'list', label: 'Lista', dataField: null, endpointRef: null }],
          visibleToRoles: ['owner', 'editor', 'viewer'],
        },
      ],
      navigation: [],
      diagram: 'flowchart TD',
      createdById: ownerId,
      approvedById: ownerId,
      approvedAt: new Date(),
    },
  });
  await prisma.projectArchitecture.create({
    data: { projectId, selectedId: 'monolito-modular', selectedAt: new Date(), selectedById: ownerId },
  });
  await prisma.testPlanVersion.create({
    data: {
      projectId,
      versionNumber: 1,
      status: 'APPROVED',
      content: { strategy: { inScope: ['feature'], outOfScope: [], riskPriorities: [] } },
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

describe('POST /projects/:projectId/documents/spec', () => {
  test('responde 409 con el detalle de los bloqueos si el proyecto no esta listo', async () => {
    const owner = await crearUsuario('owner-doc1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/documents/spec`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.blockers.stages.definition.complete).toBe(false);
    expect(res.body.blockers).toHaveProperty('inconsistencies');
  });

  test('responde 201 con el documento generado si el proyecto esta listo', async () => {
    const owner = await crearUsuario('owner-doc2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await completarTodasLasEtapas(project.id, owner.id);

    const res = await request(app)
      .post(`/projects/${project.id}/documents/spec`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('SPEC');
    expect(res.body.versionNumber).toBe(1);
    expect(res.body.content).toContain('# Especificacion del producto');
  });

  test('un usuario ajeno recibe 404 (accesible solo por miembros, US-007)', async () => {
    const owner = await crearUsuario('owner-doc3@ideator.com');
    const ajeno = await crearUsuario('ajeno-doc3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await completarTodasLasEtapas(project.id, owner.id);

    const res = await request(app)
      .post(`/projects/${project.id}/documents/spec`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('sin token responde 401', async () => {
    const owner = await crearUsuario('owner-doc4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app).post(`/projects/${project.id}/documents/spec`);

    expect(res.status).toBe(401);
  });
});

describe('GET /projects/:projectId/documents', () => {
  test('devuelve el historial de versiones generadas', async () => {
    const owner = await crearUsuario('owner-doc5@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    await completarTodasLasEtapas(project.id, owner.id);
    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);

    const res = await request(app).get(`/projects/${project.id}/documents`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].versionNumber).toBe(2);
    expect(res.body[0]).not.toHaveProperty('content');
  });

  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner-doc6@ideator.com');
    const ajeno = await crearUsuario('ajeno-doc6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /projects/:projectId/documents/architecture', () => {
  test('responde 201 con el documento de arquitectura si el proyecto esta listo', async () => {
    const owner = await crearUsuario('owner-arq1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await completarTodasLasEtapas(project.id, owner.id);

    const res = await request(app)
      .post(`/projects/${project.id}/documents/architecture`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('ARCHITECTURE');
    expect(res.body.versionNumber).toBe(1);
    expect(res.body.content).toContain('# Arquitectura definitiva');
    // Coherente con la arquitectura confirmada en el fixture.
    expect(res.body.content).toContain('monolito-modular');
  });

  test('responde 409 si el proyecto no esta listo', async () => {
    const owner = await crearUsuario('owner-arq2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/documents/architecture`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
    expect(res.body.blockers).toHaveProperty('stages');
  });

  test('versiona de forma independiente de la especificacion', async () => {
    const owner = await crearUsuario('owner-arq3@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    await completarTodasLasEtapas(project.id, owner.id);

    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);
    const arquitectura = await request(app)
      .post(`/projects/${project.id}/documents/architecture`)
      .set('Authorization', `Bearer ${token}`);

    // La spec va en v2 y la arquitectura arranca en v1: los contadores no se mezclan.
    expect(arquitectura.body.versionNumber).toBe(1);
  });
});

describe('GET /projects/:projectId/documents/bundle', () => {
  test('responde 409 si todavia falta generar alguno de los dos documentos', async () => {
    const owner = await crearUsuario('owner-zip1@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    await completarTodasLasEtapas(project.id, owner.id);
    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/bundle`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('arquitectura definitiva');
  });

  test('devuelve un zip con los dos documentos', async () => {
    const owner = await crearUsuario('owner-zip2@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    await completarTodasLasEtapas(project.id, owner.id);
    await request(app).post(`/projects/${project.id}/documents/spec`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/projects/${project.id}/documents/architecture`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/bundle`)
      .set('Authorization', `Bearer ${token}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('genial-documentos.zip');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    // Firma de un archivo ZIP.
    expect(res.body.slice(0, 2).toString()).toBe('PK');
    // En un zip los nombres de archivo van sin comprimir en la cabecera local,
    // asi que se pueden verificar sobre el buffer sin necesidad de descomprimir.
    const raw = res.body.toString('latin1');
    expect(raw).toContain('especificacion.md');
    expect(raw).toContain('arquitectura.md');
  });

  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner-zip3@ideator.com');
    const ajeno = await crearUsuario('ajeno-zip3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/documents/bundle`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /projects/:projectId/documents/:documentId', () => {
  test('devuelve el contenido de la version solicitada', async () => {
    const owner = await crearUsuario('owner-doc7@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    await completarTodasLasEtapas(project.id, owner.id);
    const generado = await request(app)
      .post(`/projects/${project.id}/documents/spec`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/${generado.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.content).toBe(generado.body.content);
  });

  test('responde 404 si el documento no existe en el proyecto', async () => {
    const owner = await crearUsuario('owner-doc8@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
