const env = require('../../src/config/env');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const { decryptPayload } = require('../../src/modules/auth/jwe.service');

// El token ahora es un JWE (cifrado hibrido RSA+AES, ver jwe.service.js),
// no un JWT firmado - por eso estos tests ya no verifican con una clave
// simetrica compartida (HS256): usan las claves RSA reales que env.js ya
// cargo del .env, igual que el codigo de produccion.
describe('generateSessionToken', () => {
  const originalExpiresIn = env.jwt.expiresIn;

  beforeEach(() => {
    env.jwt.expiresIn = '1h';
  });

  afterAll(() => {
    env.jwt.expiresIn = originalExpiresIn;
  });

  test('cifra el id y el email del usuario (recuperables solo con la clave privada)', () => {
    const user = { id: 'user-123', email: 'persona@example.com' };

    const token = generateSessionToken(user);
    const decoded = decryptPayload(token);

    expect(decoded.sub).toBe(user.id);
    expect(decoded.email).toBe(user.email);
  });

  // Pedido explicito (visto en clase: decodificar el payload de un JWT comun
  // en cualquier decodificador muestra el JSON tal cual). Esto prueba
  // exactamente lo contrario para nuestro token: ninguno de los 5 segmentos
  // decodificados en base64 contiene el email ni ningun otro campo en
  // texto plano.
  test('el token NO es legible sin la clave privada (a diferencia de un JWT firmado comun)', () => {
    const user = { id: 'user-123', email: 'persona-secreta@example.com' };
    const token = generateSessionToken(user);

    expect(token).not.toContain(user.email);
    expect(token).not.toContain(user.id);

    const segments = token.split('.');
    expect(segments).toHaveLength(5);
    // El unico segmento legible a proposito es el header (declara los
    // algoritmos, nunca datos del usuario) - los otros 4 son ciphertext.
    const [header, ...cipherSegments] = segments;
    expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toEqual({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
    });
    cipherSegments.forEach((segment) => {
      const raw = Buffer.from(segment, 'base64url').toString('latin1');
      expect(raw).not.toContain(user.email);
      expect(raw).not.toContain(user.id);
    });
  });

  test('usa JWT_EXPIRES_IN del entorno para la expiración', () => {
    const user = { id: 'user-123', email: 'persona@example.com' };

    const token = generateSessionToken(user);
    const decoded = decryptPayload(token);

    expect(decoded.exp - decoded.iat).toBe(60 * 60);
  });

  test('incluye un jti unico por token (T-042.3: hace falta para invalidar una sesion puntual en logout)', () => {
    const user = { id: 'user-123', email: 'persona@example.com' };

    const tokenA = generateSessionToken(user);
    const tokenB = generateSessionToken(user);

    const decodedA = decryptPayload(tokenA);
    const decodedB = decryptPayload(tokenB);

    expect(decodedA.jti).toBeTruthy();
    expect(decodedA.jti).not.toBe(decodedB.jti);
  });

  test('produce el mismo tipo de token sin importar el origen del usuario (local o SSO)', () => {
    const localUser = { id: 'local-1', email: 'local@example.com' };
    const ssoUser = { id: 'sso-1', email: 'sso@example.com' };

    const localToken = generateSessionToken(localUser);
    const ssoToken = generateSessionToken(ssoUser);

    const localDecoded = decryptPayload(localToken);
    const ssoDecoded = decryptPayload(ssoToken);

    expect(Object.keys(localDecoded).sort()).toEqual(Object.keys(ssoDecoded).sort());
  });
});
