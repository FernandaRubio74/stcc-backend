/**
 * T-042.3 - Tests funcionales de logout e invalidacion de tokens.
 */
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/database/client');

async function cleanDatabase() {
  await prisma.revokedToken.deleteMany({});
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

describe('POST /auth/logout', () => {
  test('requiere autenticacion', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });

  test('invalida el token con el que se llamo: usarlo despues responde 401', async () => {
    await request(app).post('/auth/register').send({
      email: 'logout1@ideator.com',
      password: 'clave12345',
      fullName: 'Usuario',
    });
    const login = await request(app).post('/auth/login').send({
      email: 'logout1@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    const logout = await request(app).post('/auth/logout').set('Authorization', token);
    expect(logout.status).toBe(204);

    const despues = await request(app).get('/projects').set('Authorization', token);
    expect(despues.status).toBe(401);
  });

  test('no afecta otras sesiones del mismo usuario (login en otro dispositivo)', async () => {
    await request(app).post('/auth/register').send({
      email: 'logout2@ideator.com',
      password: 'clave12345',
      fullName: 'Usuario',
    });
    const loginA = await request(app).post('/auth/login').send({
      email: 'logout2@ideator.com',
      password: 'clave12345',
    });
    const loginB = await request(app).post('/auth/login').send({
      email: 'logout2@ideator.com',
      password: 'clave12345',
    });

    await request(app).post('/auth/logout').set('Authorization', `Bearer ${loginA.body.token}`);

    const conB = await request(app).get('/projects').set('Authorization', `Bearer ${loginB.body.token}`);
    expect(conB.status).toBe(200);
  });

  test('un logout repetido con el mismo token no falla', async () => {
    await request(app).post('/auth/register').send({
      email: 'logout3@ideator.com',
      password: 'clave12345',
      fullName: 'Usuario',
    });
    const login = await request(app).post('/auth/login').send({
      email: 'logout3@ideator.com',
      password: 'clave12345',
    });
    const token = `Bearer ${login.body.token}`;

    await request(app).post('/auth/logout').set('Authorization', token);
    const segundo = await request(app).post('/auth/logout').set('Authorization', token).catch((e) => e);

    // La segunda llamada ya no esta autenticada (el token se invalido en la primera).
    expect(segundo.status).toBe(401);
  });
});
