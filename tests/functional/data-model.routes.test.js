/**
 * Tests funcionales de /projects/:projectId/data-model sobre HTTP real.
 * La IA se mockea a nivel de modulo (igual que definition.routes.test.js).
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
  {
    name: 'User',
    attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
    indexes: [],
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

describe('POST /projects/:projectId/data-model/generate', () => {
  test('responde 409 si la definicion todavia no esta completa', async () => {
    const owner = await crearUsuario('owner1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });

  test('genera el DRAFT cuando la definicion esta completa', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectDefinition.create({
      data: {
        projectId: project.id,
        problemSummary: 'resumen',
        targetUsers: [{ label: 'cliente', description: 'd' }],
      },
    });
    aiService.requestStructuredJson.mockResolvedValue({ entities: VALID_ENTITIES });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.entities).toEqual(VALID_ENTITIES);
  });
});

describe('POST /projects/:projectId/data-model/refine', () => {
  test('responde 409 si todavia no hay ningun modelo generado para ajustar', async () => {
    const owner = await crearUsuario('owner-refine1@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectDefinition.create({
      data: { projectId: project.id, problemSummary: 'resumen', targetUsers: [{ label: 'cliente', description: 'd' }] },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega una entidad Proveedor' });

    expect(res.status).toBe(409);
  });

  test('aplica la instruccion sobre el DRAFT existente (chatbot transversal)', async () => {
    const owner = await crearUsuario('owner-refine2@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectDefinition.create({
      data: { projectId: project.id, problemSummary: 'resumen', targetUsers: [{ label: 'cliente', description: 'd' }] },
    });
    aiService.requestStructuredJson.mockResolvedValue({ entities: VALID_ENTITIES });
    await request(app)
      .post(`/projects/${project.id}/data-model/generate`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    const ENTITIES_CON_PROVEEDOR = [
      ...VALID_ENTITIES,
      {
        name: 'Proveedor',
        attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
        indexes: [],
      },
    ];
    aiService.requestStructuredJson.mockResolvedValue({ entities: ENTITIES_CON_PROVEEDOR });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'Agrega una entidad Proveedor' });

    expect(res.status).toBe(200);
    expect(res.body.entities).toEqual(ENTITIES_CON_PROVEEDOR);
    // Sigue siendo el mismo DRAFT (version 1), no crea una version nueva.
    expect(res.body.versionNumber).toBe(1);
  });

  test('un viewer no puede ajustar con IA (403)', async () => {
    const owner = await crearUsuario('owner-refine3@ideator.com');
    const viewer = await crearUsuario('viewer-refine3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'viewer' } });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/refine`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`)
      .send({ instruction: 'Agrega una entidad Proveedor' });

    expect(res.status).toBe(403);
  });

  test('responde 400 si la instruccion es demasiado corta', async () => {
    const owner = await crearUsuario('owner-refine4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/refine`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ instruction: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /projects/:projectId/data-model/entities', () => {
  test('un viewer recibe 403', async () => {
    const owner = await crearUsuario('owner3@ideator.com');
    const viewer = await crearUsuario('viewer3@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'viewer' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/data-model/entities`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`)
      .send({ entities: VALID_ENTITIES });

    expect(res.status).toBe(403);
  });

  test('un editor puede editar el modelo', async () => {
    const owner = await crearUsuario('owner4@ideator.com');
    const editor = await crearUsuario('editor4@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });

    const res = await request(app)
      .patch(`/projects/${project.id}/data-model/entities`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`)
      .send({ entities: VALID_ENTITIES });

    expect(res.status).toBe(200);
    expect(res.body.createdById).toBe(editor.id);
  });

  test('rechaza una entidad sin primary key explicita invalida (ej. sin atributos) con 400', async () => {
    const owner = await crearUsuario('owner5@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .patch(`/projects/${project.id}/data-model/entities`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ entities: [{ name: 'User', attributes: [] }] });

    expect(res.status).toBe(400);
  });
});

describe('POST /projects/:projectId/data-model/approve', () => {
  test('un editor (no owner) recibe 403', async () => {
    const owner = await crearUsuario('owner6@ideator.com');
    const editor = await crearUsuario('editor6@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({ data: { projectId: project.id, userId: editor.id, role: 'editor' } });
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, entities: VALID_ENTITIES, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/approve`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`);

    expect(res.status).toBe(403);
  });

  test('el owner aprueba el DRAFT vigente', async () => {
    const owner = await crearUsuario('owner7@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.dataModelVersion.create({
      data: { projectId: project.id, versionNumber: 1, entities: VALID_ENTITIES, createdById: owner.id },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  test('responde 409 si no hay ningun DRAFT para aprobar', async () => {
    const owner = await crearUsuario('owner8@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .post(`/projects/${project.id}/data-model/approve`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(409);
  });
});

describe('GET /projects/:projectId/data-model', () => {
  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('owner9@ideator.com');
    const ajeno = await crearUsuario('ajeno9@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/data-model`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });

  test('devuelve draft=null y approved=null si todavia no se genero nada', async () => {
    const owner = await crearUsuario('owner10@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/data-model`)
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null, approved: null });
  });
});
