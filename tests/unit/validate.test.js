/**
 * Tests del middleware de validacion con Zod.
 *
 * No toca la base de datos: se invoca el middleware con req/res/next falsos.
 */

const { z } = require('zod');
const { validate } = require('../../src/common/middlewares/validate');
const { registerSchema, loginSchema } = require('../../src/common/dto/auth.dto');

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

describe('validate - entrada valida', () => {
  test('continua y deja en req.body el resultado parseado', () => {
    const req = {
      body: {
        email: 'ana@ideator.com',
        password: 'clave12345',
        fullName: 'Ana Perez',
      },
    };
    const res = buildRes();
    const next = buildNext();

    validate(registerSchema)(req, res, next);

    expect(next.called).toBe(true);
    expect(res.statusCode).toBeNull();
    expect(req.body).toEqual({
      email: 'ana@ideator.com',
      password: 'clave12345',
      fullName: 'Ana Perez',
    });
  });

  test('descarta los campos que no estan en el esquema', () => {
    // Importante para no filtrar campos al service: un cliente no deberia
    // poder mandar { role: 'owner' } y que llegue al create de Prisma.
    const req = {
      body: {
        email: 'ana@ideator.com',
        password: 'clave12345',
        fullName: 'Ana Perez',
        role: 'owner',
      },
    };

    validate(registerSchema)(req, buildRes(), buildNext());

    expect(req.body.role).toBeUndefined();
  });

  test('puede validar req.params en vez de req.body', () => {
    const schema = z.object({ id: z.string().uuid() });
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' } };
    const next = buildNext();

    validate(schema, 'params')(req, buildRes(), next);

    expect(next.called).toBe(true);
  });
});

describe('validate - entrada invalida', () => {
  test('responde 400 con el detalle por campo', () => {
    const req = { body: { email: 'no-es-email', password: 'corta' } };
    const res = buildRes();
    const next = buildNext();

    validate(registerSchema)(req, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Datos invalidos');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        { field: 'email', message: 'Email invalido' },
        {
          field: 'password',
          message: 'La contrasena debe tener al menos 8 caracteres',
        },
        { field: 'fullName', message: expect.any(String) },
      ])
    );
  });

  test('responde 400 si falta el body por completo', () => {
    const res = buildRes();
    const next = buildNext();

    validate(loginSchema)({}, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  test('no filtra el valor recibido en el mensaje de error', () => {
    // El detalle nunca debe incluir la contrasena que mando el cliente.
    const req = { body: { email: 'ana@ideator.com', password: 'secreta' } };
    const res = buildRes();

    validate(registerSchema)(req, res, buildNext());

    expect(JSON.stringify(res.body)).not.toContain('secreta');
  });
});
