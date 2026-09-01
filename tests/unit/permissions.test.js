/**
 * T-008.4 - Tests de la matriz de permisos por rol contra las reglas de negocio
 * documentadas en docs/autorizacion/README.md.
 *
 * La tabla ESPERADO de abajo esta escrita a mano a proposito: es una
 * transcripcion independiente de la documentacion, no un import de
 * ROLE_PERMISSIONS. Si el test importara la matriz para verificarla contra si
 * misma, pasaria siempre y no probaria nada.
 */

const { PERMISSIONS, ROLE_PERMISSIONS, can } = require('../../src/common/utils/permissions');

const ROLES = ['owner', 'editor', 'viewer'];

/** Copia literal de la tabla de docs/autorizacion/README.md seccion 2. */
const ESPERADO = {
  'project:read': { owner: true, editor: true, viewer: true },
  'project:update': { owner: true, editor: true, viewer: false },
  'project:delete': { owner: true, editor: false, viewer: false },
  'member:read': { owner: true, editor: true, viewer: true },
  'member:invite': { owner: true, editor: false, viewer: false },
  'member:update_role': { owner: true, editor: false, viewer: false },
  'member:remove': { owner: true, editor: false, viewer: false },
  'spec:generate': { owner: true, editor: true, viewer: false },
  'spec:update': { owner: true, editor: true, viewer: false },
  'document:export': { owner: true, editor: true, viewer: false },
};

describe('matriz de permisos - cobertura completa rol x permiso', () => {
  const casos = [];
  for (const [permission, porRol] of Object.entries(ESPERADO)) {
    for (const role of ROLES) {
      casos.push([role, permission, porRol[role]]);
    }
  }

  test.each(casos)('%s %s -> %s', (role, permission, esperado) => {
    expect(can(role, permission)).toBe(esperado);
  });

  test('la tabla esperada cubre todos los permisos declarados', () => {
    // Si alguien agrega un permiso a PERMISSIONS y no lo documenta aca, este
    // test falla y obliga a decidir explicitamente que rol lo tiene.
    expect(Object.keys(ESPERADO).sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  test('la matriz no declara roles fuera del enum ProjectRole', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });
});

describe('reglas de negocio destacadas', () => {
  test('solo owner gestiona miembros', () => {
    const gestion = [
      PERMISSIONS.MEMBER_INVITE,
      PERMISSIONS.MEMBER_UPDATE_ROLE,
      PERMISSIONS.MEMBER_REMOVE,
    ];

    for (const permiso of gestion) {
      expect(can('owner', permiso)).toBe(true);
      expect(can('editor', permiso)).toBe(false);
      expect(can('viewer', permiso)).toBe(false);
    }
  });

  test('viewer es de lectura estricta: no exporta documentos', () => {
    expect(can('viewer', PERMISSIONS.DOCUMENT_EXPORT)).toBe(false);
    expect(can('viewer', PERMISSIONS.PROJECT_READ)).toBe(true);
  });

  test('solo owner puede borrar el proyecto', () => {
    expect(can('owner', PERMISSIONS.PROJECT_DELETE)).toBe(true);
    expect(can('editor', PERMISSIONS.PROJECT_DELETE)).toBe(false);
    expect(can('viewer', PERMISSIONS.PROJECT_DELETE)).toBe(false);
  });

  test('owner tiene todos los permisos declarados', () => {
    for (const permiso of Object.values(PERMISSIONS)) {
      expect(can('owner', permiso)).toBe(true);
    }
  });

  test('los permisos de viewer son un subconjunto de los de editor', () => {
    // Los roles son acumulativos por diseno: nadie tiene un permiso que un rol
    // mas alto no tenga.
    for (const permiso of ROLE_PERMISSIONS.viewer) {
      expect(ROLE_PERMISSIONS.editor).toContain(permiso);
    }
    for (const permiso of ROLE_PERMISSIONS.editor) {
      expect(ROLE_PERMISSIONS.owner).toContain(permiso);
    }
  });
});

describe('can() es cerrada ante lo desconocido', () => {
  test.each([
    ['rol inexistente', 'admin', PERMISSIONS.PROJECT_READ],
    ['rol vacio', '', PERMISSIONS.PROJECT_READ],
    ['rol undefined', undefined, PERMISSIONS.PROJECT_READ],
    ['rol null', null, PERMISSIONS.PROJECT_READ],
    ['permiso inexistente', 'owner', 'project:hackear'],
    ['permiso undefined', 'owner', undefined],
  ])('deniega ante %s', (_desc, role, permission) => {
    expect(can(role, permission)).toBe(false);
  });

  test('no se deja enganar por propiedades heredadas de Object', () => {
    // can('constructor', ...) no debe resolver contra Object.prototype.
    expect(can('constructor', PERMISSIONS.PROJECT_READ)).toBe(false);
    expect(can('toString', PERMISSIONS.PROJECT_READ)).toBe(false);
  });
});
