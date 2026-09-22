// Prueba de integracion de T-006.2/T-006.5: ejercita el endpoint HTTP real
// GET /auth/sso/callback (Express, montado en src/app.js) de punta a punta,
// mockeando unicamente los limites externos reales: la API de Google
// (src/config/googleOAuth) y la base de datos via Prisma
// (src/database/client). No se usa una base de datos de pruebas real: no
// hay Docker/Postgres disponible en este entorno (ver CONTRIBUTING.md).
//
// El endpoint responde con una redireccion 302 hacia el frontend (nunca
// JSON): lo consume el navegador via una navegacion completa iniciada por
// Google, no un fetch de la SPA (ver T-011.3 en stcc-frontend).

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

  test('exito: usuario nuevo se provisiona y se redirige al callback del frontend con la sesion', async () => {
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

    const res = await fetch(`${baseUrl}/auth/sso/callback?code=authorization-code-valido`, {
      redirect: 'manual',
    });

    expect(res.status).toBe(302);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);

    const location = new URL(res.headers.get('location'));
    expect(location.origin + location.pathname).toBe('http://localhost:5173/auth/sso/callback');
    expect(location.searchParams.get('token')).toEqual(expect.any(String));
    expect(location.searchParams.get('id')).toBe('user-generado');
    expect(location.searchParams.get('email')).toBe('nueva@example.com');
    expect(location.searchParams.get('fullName')).toBe('Persona Nueva');
  });

  test('rechazo: falta el code en la query -> redirige al login con mensaje controlado', async () => {
    const res = await fetch(`${baseUrl}/auth/sso/callback`, { redirect: 'manual' });

    expect(res.status).toBe(302);
    expect(googleOAuthClient.getToken).not.toHaveBeenCalled();

    const location = new URL(res.headers.get('location'));
    expect(location.origin + location.pathname).toBe('http://localhost:5173/login');
    expect(location.searchParams.get('ssoError')).toBe('No se recibió código de autorización');
  });

  test('rechazo: Google invalida el code -> redirige al login con mensaje controlado', async () => {
    googleOAuthClient.getToken.mockRejectedValue(new Error('invalid_grant'));

    const res = await fetch(`${baseUrl}/auth/sso/callback?code=codigo-invalido`, {
      redirect: 'manual',
    });

    expect(res.status).toBe(302);
    expect(prisma.user.create).not.toHaveBeenCalled();

    const location = new URL(res.headers.get('location'));
    expect(location.origin + location.pathname).toBe('http://localhost:5173/login');
    expect(location.searchParams.get('ssoError')).toBe('Autenticación con Google fallida');
  });
});
