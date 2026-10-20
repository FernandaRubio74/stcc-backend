/**
 * Tests funcionales de /projects/:projectId/members sobre HTTP real.
 *
 * Sigue el mismo patron que tests/functional/projects.routes.test.js: siembra
 * datos con el cliente Prisma compartido y ejercita las rutas via supertest.
 * Requiere que DATABASE_URL apunte a la base de pruebas.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const prisma = require('../../src/database/client');

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

function tokenDe(userId, email = 'x@ideator.com') {
  return jwt.sign({ sub: userId, email }, env.jwt.secret, { expiresIn: '1d' });
}

async function cleanDatabase() {
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body;
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /projects/:projectId/members', () => {
  test('un miembro puede ver el listado', async () => {
    const owner = await crearUsuario('list-owner@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .get(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ role: 'owner', user: { email: owner.email } });
  });

  test('un usuario ajeno recibe 404', async () => {
    const owner = await crearUsuario('list-owner2@ideator.com');
    const ajeno = await crearUsuario('list-ajeno@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));

    const res = await request(app)
      .get(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /projects/:projectId/members', () => {
  test('el owner invita a un usuario existente', async () => {
    const owner = await crearUsuario('invite-owner@ideator.com');
    const invitado = await crearUsuario('invite-target@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .post(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: invitado.email, role: 'editor' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'editor', user: { email: invitado.email } });
  });

  test('responde 404 si el email no corresponde a ningun usuario registrado', async () => {
    const owner = await crearUsuario('invite-owner2@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .post(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'no-existe@ideator.com', role: 'viewer' });

    expect(res.status).toBe(404);
  });

  test('responde 409 si el usuario ya es miembro', async () => {
    const owner = await crearUsuario('invite-owner3@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .post(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: owner.email, role: 'viewer' });

    expect(res.status).toBe(409);
  });

  test('un editor recibe 403 al intentar invitar', async () => {
    const owner = await crearUsuario('invite-owner4@ideator.com');
    const editor = await crearUsuario('invite-editor@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({
      data: { userId: editor.id, projectId: project.id, role: 'editor' },
    });

    const res = await request(app)
      .post(`/projects/${project.id}/members`)
      .set('Authorization', `Bearer ${tokenDe(editor.id)}`)
      .send({ email: 'otro@ideator.com', role: 'viewer' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /projects/:projectId/members/:memberId', () => {
  test('el owner cambia el rol de un miembro', async () => {
    const owner = await crearUsuario('role-owner@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    const invitado = await crearUsuario('role-target@ideator.com');
    await prisma.projectMember.create({
      data: { userId: invitado.id, projectId: project.id, role: 'viewer' },
    });
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: invitado.id, projectId: project.id } },
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'editor' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('editor');
  });

  test('responde 409 si degrada al unico owner', async () => {
    const owner = await crearUsuario('role-owner2@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: owner.id, projectId: project.id } },
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'viewer' });

    expect(res.status).toBe(409);
  });

  test('un viewer recibe 403 al intentar cambiar roles', async () => {
    const owner = await crearUsuario('role-owner3@ideator.com');
    const viewer = await crearUsuario('role-viewer@ideator.com');
    const project = await crearProyecto(tokenDe(owner.id));
    await prisma.projectMember.create({
      data: { userId: viewer.id, projectId: project.id, role: 'viewer' },
    });
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: viewer.id, projectId: project.id } },
    });

    const res = await request(app)
      .patch(`/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`)
      .send({ role: 'editor' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /projects/:projectId/members/:memberId', () => {
  test('el owner elimina a un miembro', async () => {
    const owner = await crearUsuario('remove-owner@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    const invitado = await crearUsuario('remove-target@ideator.com');
    await prisma.projectMember.create({
      data: { userId: invitado.id, projectId: project.id, role: 'viewer' },
    });
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: invitado.id, projectId: project.id } },
    });

    const res = await request(app)
      .delete(`/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  test('responde 409 si elimina al unico owner', async () => {
    const owner = await crearUsuario('remove-owner2@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: owner.id, projectId: project.id } },
    });

    const res = await request(app)
      .delete(`/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  test('responde 404 con un memberId inexistente', async () => {
    const owner = await crearUsuario('remove-owner3@ideator.com');
    const token = tokenDe(owner.id);
    const project = await crearProyecto(token);

    const res = await request(app)
      .delete(`/projects/${project.id}/members/${UUID_INEXISTENTE}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
