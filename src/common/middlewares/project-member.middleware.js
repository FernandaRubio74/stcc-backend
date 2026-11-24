/**
 * T-007.1 - Guard de pertenencia a proyecto.
 *
 * Corre despues de `requireAuth` y corta la request si el usuario autenticado
 * no tiene una fila en `project_members` para el proyecto de la ruta.
 *
 * Decisiones de diseno (acordadas al arrancar el ticket):
 *
 * - **Unica fuente de verdad: `ProjectMember`.** No se usa `Project.created_by`
 *   como atajo, aunque el creador sea de hecho el dueno. El CLAUDE.md fija que
 *   "el acceso se resuelve siempre via ProjectMember"; tener dos fuentes de
 *   verdad para autorizacion es como se cuelan los agujeros. Implica que el
 *   alta de proyecto DEBE insertar la membresia `owner` (ticket del modulo
 *   `projects`).
 *
 * - **404 uniforme.** Proyecto inexistente y proyecto ajeno responden lo mismo.
 *   Si el ajeno respondiera 403, cualquier usuario logueado podria enumerar
 *   UUIDs y descubrir que proyectos existen sin tener acceso a ninguno. Los
 *   proyectos son privados por defecto, asi que para un no-miembro el proyecto
 *   directamente no existe.
 *
 * - **No decide sobre roles.** Solo responde "es miembro si/no" y deja el rol
 *   en `req.projectMembership` para que la matriz de permisos (T-008) lo use.
 */
const defaultPrisma = require('../../database/client');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Construye el guard. La inyeccion de `prisma` existe para que los tests
 * puedan apuntar a la base de pruebas (TEST_DATABASE_URL) sin mockear Prisma.
 *
 * @param {object} [options]
 * @param {import('@prisma/client').PrismaClient} [options.prisma]
 * @param {string} [options.param='projectId'] nombre del parametro de ruta
 */
function createRequireProjectMembership({
  prisma = defaultPrisma,
  param = 'projectId',
} = {}) {
  return async function requireProjectMembership(req, res, next) {
    if (!req.user || !req.user.id) {
      // requireAuth no corrio antes que este guard: es un error de montaje de
      // rutas, no del cliente. Se corta igual para no dejar pasar la request.
      return res.status(401).json({ error: 'No autenticado' });
    }

    const projectId = req.params[param];

    // Un id con formato invalido no puede corresponder a ningun proyecto:
    // se responde como "no encontrado" en vez de dejar que Prisma tire P2023.
    if (!projectId || !UUID_RE.test(projectId)) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    let membership;
    try {
      membership = await prisma.projectMember.findUnique({
        where: {
          userId_projectId: { userId: req.user.id, projectId },
        },
        select: { id: true, role: true },
      });
    } catch (err) {
      return next(err);
    }

    if (!membership) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    req.projectMembership = {
      id: membership.id,
      projectId,
      userId: req.user.id,
      role: membership.role,
    };

    return next();
  };
}

module.exports = {
  createRequireProjectMembership,
  requireProjectMembership: createRequireProjectMembership(),
};
