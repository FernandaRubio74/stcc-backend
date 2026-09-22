/**
 * T-007.1 - Tests del middleware de autenticacion (requireAuth).
 *
 * No toca la base de datos: la identidad se resuelve enteramente a partir de
 * la firma del JWT, sin ir a buscar el usuario.
 */

const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');
const { requireAuth } = require('../../src/common/middlewares/auth.middleware');

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@ideator.com',
};

function buildRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildNext() {
  const next = () => {
    next.called = true;
  };
  next.called = false;
  return next;
}

function sign(payload, options = {}, secret = env.jwt.secret) {
  return jwt.sign(payload, secret, options);
}

describe('requireAuth - token valido', () => {
  test('setea req.user a partir del payload y continua', () => {
    const token = sign({ sub: USER.id, email: USER.email }, { expiresIn: '1d' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = buildRes();
    const next = buildNext();

    requireAuth(req, res, next);

    expect(next.called).toBe(true);
    expect(res.statusCode).toBeNull();
    expect(req.user).toEqual({ id: USER.id, email: USER.email });
  });

  test('acepta el esquema Bearer sin distinguir mayusculas', () => {
    const token = sign({ sub: USER.id }, { expiresIn: '1d' });
    const req = { headers: { authorization: `bearer ${token}` } };
    const next = buildNext();

    requireAuth(req, buildRes(), next);

    expect(next.called).toBe(true);
  });
});

describe('requireAuth - token ausente o invalido', () => {
  const casos = [
    ['sin header Authorization', {}],
    ['header vacio', { authorization: '' }],
    ['sin esquema Bearer', { authorization: 'abc.def.ghi' }],
    ['esquema equivocado', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['Bearer sin token', { authorization: 'Bearer ' }],
  ];

  test.each(casos)('responde 401 %s', (_desc, headers) => {
    const res = buildRes();
    const next = buildNext();

    requireAuth({ headers }, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'No autenticado' });
  });

  test('responde 401 si el token esta firmado con otra clave', () => {
    const token = sign({ sub: USER.id }, { expiresIn: '1d' }, 'clave-impostora');
    const res = buildRes();
    const next = buildNext();

    requireAuth({ headers: { authorization: `Bearer ${token}` } }, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token invalido o expirado' });
  });

  test('responde 401 si el token expiro', () => {
    const token = sign({ sub: USER.id }, { expiresIn: '-1s' });
    const res = buildRes();

    requireAuth({ headers: { authorization: `Bearer ${token}` } }, res, buildNext());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token invalido o expirado' });
  });

  test('responde 401 si el token es sintacticamente basura', () => {
    const res = buildRes();
    requireAuth({ headers: { authorization: 'Bearer no-es-un-jwt' } }, res, buildNext());
    expect(res.statusCode).toBe(401);
  });

  test('responde 401 si el payload no trae sub', () => {
    const token = sign({ email: USER.email }, { expiresIn: '1d' });
    const res = buildRes();
    const next = buildNext();

    const req = { headers: { authorization: `Bearer ${token}` } };
    requireAuth(req, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });
});
