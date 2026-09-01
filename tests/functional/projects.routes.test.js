/**
 * Tests funcionales de /projects sobre HTTP real.
 *
 * Son la prueba end-to-end de que el guard de pertenencia (T-007.1) protege
 * algo de verdad: hasta que existieron estas rutas, el middleware estaba
 * escrito y testeado pero ningun router lo usaba.
 *
 * Se usa el cliente Prisma compartido (`src/database/client.js`) para sembrar
 * datos, el mismo que usa la app: asi la siembra y la request no pueden quedar
 * apuntando a bases distintas. Requiere que DATABASE_URL apunte a la base de
 * pruebas, como hace el workflow de CI.
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

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /projects', () => {
  test('crea el proyecto y responde 201', async () => {
    const user = await crearUsuario('creador@ideator.com');

    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenDe(user.id)}`)
      .send({ name: 'Ideator MVP', description: 'Primer proyecto' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Ideator MVP', createdById: user.id });
  });

  test('el creador queda como owner y puede leer su propio proyecto', async () => {
    // Este es el caso que se romperia si el alta no creara la membresia: el
    // creador recibiria 404 en su propio proyecto.
    const user = await crearUsuario('dueno@ideator.com');
    const token = `Bearer ${tokenDe(user.id)}`;

    const creado = await request(app)
      .post('/projects')
      .set('Authorization', token)
      .send({ name: 'Mio' });

    const leido = await request(app)
      .get(`/projects/${creado.body.id}`)
      .set('Authorization', token);

    expect(leido.status).toBe(200);
    expect(leido.body.role).toBe('owner');
  });

  test('responde 401 sin token', async () => {
    const res = await request(app).post('/projects').send({ name: 'Sin token' });
    expect(res.status).toBe(401);
  });

  test('responde 400 si falta el nombre', async () => {
    const user = await crearUsuario('validacion@ideator.com');

    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenDe(user.id)}`)
      .send({ description: 'sin nombre' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Datos invalidos');
  });
});

describe('GET /projects/:projectId - guard de pertenencia', () => {
  test('un miembro viewer puede leer el proyecto y ve su rol', async () => {
    const owner = await crearUsuario('owner@ideator.com');
    const viewer = await crearUsuario('viewer@ideator.com');

    const creado = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ name: 'Compartido' });

    await prisma.projectMember.create({
      data: { userId: viewer.id, projectId: creado.body.id, role: 'viewer' },
    });

    const res = await request(app)
      .get(`/projects/${creado.body.id}`)
      .set('Authorization', `Bearer ${tokenDe(viewer.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });

  test('un usuario ajeno recibe 403 (DoD de US-007)', async () => {
    const owner = await crearUsuario('owner2@ideator.com');
    const ajeno = await crearUsuario('ajeno@ideator.com');

    const creado = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenDe(owner.id)}`)
      .send({ name: 'Privado' });

    const res = await request(app)
      .get(`/projects/${creado.body.id}`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No tenes acceso a este proyecto' });
  });

  test('un proyecto inexistente responde 404, no 403', async () => {
    const ajeno = await crearUsuario('ajeno2@ideator.com');

    const res = await request(app)
      .get(`/projects/${UUID_INEXISTENTE}`)
      .set('Authorization', `Bearer ${tokenDe(ajeno.id)}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Proyecto no encontrado' });
  });

  test('responde 401 sin token, antes de tocar el guard', async () => {
    const res = await request(app).get(`/projects/${UUID_INEXISTENTE}`);
    expect(res.status).toBe(401);
  });

  test('responde 404 si el id no es un UUID', async () => {
    const user = await crearUsuario('uuid@ideator.com');

    const res = await request(app)
      .get('/projects/no-es-uuid')
      .set('Authorization', `Bearer ${tokenDe(user.id)}`);

    expect(res.status).toBe(404);
  });
});
