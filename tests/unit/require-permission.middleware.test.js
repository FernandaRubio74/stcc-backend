/**
 * T-008.4 - Tests del guard de permiso por rol.
 *
 * No toca la base: `requirePermission` solo lee `req.projectMembership`, que
 * ya dejo `requireProjectMembership`, y consulta la matriz.
 */

const {
  requirePermission,
} = require('../../src/common/middlewares/require-permission.middleware');
const { PERMISSIONS } = require('../../src/common/utils/permissions');

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

function reqCon(role) {
  return { projectMembership: { role, projectId: 'p1', userId: 'u1' } };
}

describe('requirePermission - permite', () => {
  test.each(['owner', 'editor', 'viewer'])(
    '%s puede leer el proyecto',
    (role) => {
      const res = buildRes();
      const next = buildNext();

      requirePermission(PERMISSIONS.PROJECT_READ)(reqCon(role), res, next);

      expect(next.called).toBe(true);
      expect(res.statusCode).toBeNull();
    }
  );

  test.each(['owner', 'editor'])('%s puede editar la especificacion', (role) => {
    const next = buildNext();
    requirePermission(PERMISSIONS.SPEC_UPDATE)(reqCon(role), buildRes(), next);
    expect(next.called).toBe(true);
  });
});

describe('requirePermission - deniega con 403', () => {
  test('un viewer no puede exportar documentos', () => {
    const res = buildRes();
    const next = buildNext();

    requirePermission(PERMISSIONS.DOCUMENT_EXPORT)(reqCon('viewer'), res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: 'No tenes permiso para realizar esta accion',
      requiredPermission: 'document:export',
      role: 'viewer',
    });
  });

  test.each(['editor', 'viewer'])('%s no puede invitar miembros', (role) => {
    const res = buildRes();
    const next = buildNext();

    requirePermission(PERMISSIONS.MEMBER_INVITE)(reqCon(role), res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test.each(['editor', 'viewer'])('%s no puede borrar el proyecto', (role) => {
    const res = buildRes();
    requirePermission(PERMISSIONS.PROJECT_DELETE)(reqCon(role), res, buildNext());
    expect(res.statusCode).toBe(403);
  });

  test('el cuerpo del 403 dice que permiso falto, para poder depurarlo', () => {
    const res = buildRes();
    requirePermission(PERMISSIONS.PROJECT_DELETE)(reqCon('viewer'), res, buildNext());

    expect(res.body.requiredPermission).toBe('project:delete');
    expect(res.body.role).toBe('viewer');
  });
});

describe('requirePermission - montaje incorrecto de rutas', () => {
  test('deniega si requireProjectMembership no corrio antes', () => {
    const res = buildRes();
    const next = buildNext();

    requirePermission(PERMISSIONS.PROJECT_READ)({}, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('deniega si la membresia viene sin rol', () => {
    const res = buildRes();
    const next = buildNext();

    requirePermission(PERMISSIONS.PROJECT_READ)(
      { projectMembership: { projectId: 'p1' } },
      res,
      next
    );

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('deniega ante un rol que no existe en la matriz', () => {
    const res = buildRes();
    requirePermission(PERMISSIONS.PROJECT_READ)(reqCon('admin'), res, buildNext());
    expect(res.statusCode).toBe(403);
  });
});
