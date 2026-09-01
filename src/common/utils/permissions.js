/**
 * T-008.2 - Matriz de permisos por rol de proyecto.
 *
 * Es la fuente unica de verdad de "que puede hacer cada rol". Los middlewares
 * y servicios preguntan por un PERMISO, no por un rol: escribir
 * `requirePermission(P.MEMBER_INVITE)` en vez de `if (role === 'owner')` evita
 * que la regla quede desparramada en veinte call sites, cada uno con su propia
 * version de la verdad.
 *
 * La documentacion legible para humanos vive en `docs/autorizacion/README.md`
 * y debe mantenerse en sincronia con esta tabla.
 */

/** Acciones que el sistema sabe autorizar. */
const PERMISSIONS = {
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  MEMBER_READ: 'member:read',
  MEMBER_INVITE: 'member:invite',
  MEMBER_UPDATE_ROLE: 'member:update_role',
  MEMBER_REMOVE: 'member:remove',

  // Etapas de especificacion de Ideator (modelo de datos, API, pantallas,
  // arquitectura): dialogar con la IA para generarlas y editar el resultado.
  SPEC_GENERATE: 'spec:generate',
  SPEC_UPDATE: 'spec:update',

  DOCUMENT_EXPORT: 'document:export',
};

/**
 * Que permisos tiene cada rol.
 *
 * Reglas de negocio acordadas con el equipo:
 *
 * - `owner`: todo. Es el unico que gestiona miembros (invitar, cambiar roles,
 *   quitar) y el unico que puede borrar el proyecto.
 * - `editor`: trabaja sobre el contenido — genera y edita las etapas de
 *   especificacion, edita los datos del proyecto y exporta los documentos.
 *   No toca la membresia ni borra el proyecto.
 * - `viewer`: lectura estricta. **No exporta documentos**: la especificacion
 *   generada es el entregable del producto, y difundirla es una decision de
 *   quien tiene responsabilidad sobre el proyecto.
 *
 * Los tres roles pueden ver la lista de miembros (`MEMBER_READ`): saber con
 * quien se comparte un proyecto es parte de leerlo, y no expone nada que el
 * usuario no pueda deducir colaborando.
 */
// Prototipo nulo a proposito: con un objeto literal comun,
// `ROLE_PERMISSIONS['constructor']` resuelve contra Object.prototype y devuelve
// una funcion en vez de undefined, colando un "rol" que no existe.
const ROLE_PERMISSIONS = Object.assign(Object.create(null), {
  owner: Object.values(PERMISSIONS),

  editor: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.SPEC_GENERATE,
    PERMISSIONS.SPEC_UPDATE,
    PERMISSIONS.DOCUMENT_EXPORT,
  ],

  viewer: [PERMISSIONS.PROJECT_READ, PERMISSIONS.MEMBER_READ],
});

/**
 * Responde si un rol tiene un permiso.
 *
 * Es deliberadamente cerrada: un rol desconocido o un permiso desconocido
 * devuelven `false`. Ante la duda, no se autoriza.
 *
 * @param {string} role rol de la membresia (`owner` | `editor` | `viewer`)
 * @param {string} permission uno de los valores de PERMISSIONS
 * @returns {boolean}
 */
function can(role, permission) {
  const permisosDelRol = ROLE_PERMISSIONS[role];
  if (!Array.isArray(permisosDelRol)) {
    return false;
  }
  return permisosDelRol.includes(permission);
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, can };
