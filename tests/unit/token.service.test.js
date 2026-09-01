const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { generateSessionToken } = require('../../src/modules/auth/token.service');

// env.js lee JWT_SECRET/JWT_EXPIRES_IN una sola vez al cargarse (modulo
// cacheado), por lo que para fijar valores deterministas en el test se
// mutan las propiedades del singleton `env` en vez de `process.env`
// (que ya no tendria efecto una vez que env.js fue requerido).
describe('generateSessionToken', () => {
  const originalSecret = env.jwt.secret;
  const originalExpiresIn = env.jwt.expiresIn;

  beforeEach(() => {
    env.jwt.secret = 'test-secret';
    env.jwt.expiresIn = '1h';
  });

  afterAll(() => {
    env.jwt.secret = originalSecret;
    env.jwt.expiresIn = originalExpiresIn;
  });

  test('firma un JWT con el id y el email del usuario', () => {
    const user = { id: 'user-123', email: 'persona@example.com' };

    const token = generateSessionToken(user);
    const decoded = jwt.verify(token, 'test-secret');

    expect(decoded.sub).toBe(user.id);
    expect(decoded.email).toBe(user.email);
  });

  test('usa JWT_EXPIRES_IN del entorno para la expiración', () => {
    const user = { id: 'user-123', email: 'persona@example.com' };

    const token = generateSessionToken(user);
    const decoded = jwt.verify(token, 'test-secret');

    expect(decoded.exp - decoded.iat).toBe(60 * 60);
  });

  test('produce el mismo tipo de token sin importar el origen del usuario (local o SSO)', () => {
    const localUser = { id: 'local-1', email: 'local@example.com' };
    const ssoUser = { id: 'sso-1', email: 'sso@example.com' };

    const localToken = generateSessionToken(localUser);
    const ssoToken = generateSessionToken(ssoUser);

    const localDecoded = jwt.verify(localToken, 'test-secret');
    const ssoDecoded = jwt.verify(ssoToken, 'test-secret');

    expect(Object.keys(localDecoded).sort()).toEqual(Object.keys(ssoDecoded).sort());
  });
});
