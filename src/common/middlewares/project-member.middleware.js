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
 * - **404 si el proyecto no existe, 403 si existe pero no sos miembro.** Lo pide
 *   explicitamente la DoD de US-007: "Sin identidad valida -> 401. Con
 *   identidad pero sin permisos -> 403".
 *
 *   Se implemento primero con 404 uniforme para los dos casos, porque
 *   distinguirlos permite que cualquier usuario logueado enumere UUIDs y
 *   descubra que proyectos existen sin tener acceso a ninguno. Se cambio para
 *   cumplir la DoD. Si mas adelante pesa mas la privacidad que la claridad de
 *   la respuesta, el unico cambio necesario es devolver 404 tambien en la rama
 *   del 403 de abajo — el resto de la logica no se toca.
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

    // Se trae el proyecto con la membresia del usuario anidada: distinguir 404
    // de 403 exige saber si el proyecto existe, y hacerlo asi mantiene un solo
    // viaje a la base en vez de dos queries.
    let project;
    try {
      project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          members: {
            where: { userId: req.user.id },
            select: { id: true, role: true },
          },
        },
      });
    } catch (err) {
      return next(err);
    }

    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const membership = project.members[0];
    if (!membership) {
      return res.status(403).json({ error: 'No tenes acceso a este proyecto' });
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
