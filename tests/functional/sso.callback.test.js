// Prueba de integracion de T-006.2/T-006.5: ejercita el endpoint HTTP real
// GET /auth/sso/callback (Express, montado en src/app.js) de punta a punta,
// mockeando unicamente los limites externos reales: la API de Google
// (src/config/googleOAuth) y la base de datos via Prisma
// (src/database/client). No se usa una base de datos de pruebas real: no
// hay Docker/Postgres disponible en este entorno (ver CONTRIBUTING.md).

jest.mock('../../src/config/googleOAuth', () => ({
  googleOAuthClient: {
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    verifyIdToken: jest.fn(),
  },
}));

jest.mock('../../src/database/client', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
}));

const env = require('../../src/config/env');
const { googleOAuthClient } = require('../../src/config/googleOAuth');
const prisma = require('../../src/database/client');
const app = require('../../src/app');

describe('GET /auth/sso/callback (endpoint real, proveedor Google mockeado)', () => {
  const originalSecret = env.jwt.secret;
  let server;
  let baseUrl;

  beforeAll((done) => {
    env.jwt.secret = 'test-secret';
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    env.jwt.secret = originalSecret;
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exito: usuario nuevo se provisiona y recibe el mismo tipo de sesion que el login tradicional', async () => {
    googleOAuthClient.getToken.mockResolvedValue({ tokens: { id_token: 'fake-id-token' } });
    googleOAuthClient.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'nueva@example.com',
        name: 'Persona Nueva',
        sub: 'google-sub-abc',
      }),
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-generado',
      email: 'nueva@example.com',
      fullName: 'Persona Nueva',
      authProvider: 'google',
      providerId: 'google-sub-abc',
    });

    const res = await fetch(`${baseUrl}/auth/sso/callback?code=authorization-code-valido`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      token: expect.any(String),
      user: { id: 'user-generado', email: 'nueva@example.com', fullName: 'Persona Nueva' },
    });
  });

  test('rechazo: falta el code en la query -> 401 con mensaje controlado', async () => {
    const res = await fetch(`${baseUrl}/auth/sso/callback`);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'No se recibió código de autorización' });
    expect(googleOAuthClient.getToken).not.toHaveBeenCalled();
  });

  test('rechazo: Google invalida el code -> 401 con mensaje controlado', async () => {
    googleOAuthClient.getToken.mockRejectedValue(new Error('invalid_grant'));

    const res = await fetch(`${baseUrl}/auth/sso/callback?code=codigo-invalido`);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'Autenticación con Google fallida' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
