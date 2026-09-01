/**
 * T-008 - Guard de permiso por rol.
 *
 * Va SIEMPRE despues de `requireProjectMembership`, que es quien resuelve el
 * acceso al proyecto y deja el rol en `req.projectMembership`. Este middleware
 * no vuelve a la base: solo consulta la matriz.
 *
 * Division de responsabilidades:
 *   requireAuth                -> quien sos            (401)
 *   requireProjectMembership   -> entras al proyecto   (404 / 403)
 *   requirePermission          -> podes hacer ESTO     (403)
 */
const { can } = require('../utils/permissions');

/**
 * @param {string} permission uno de los valores de PERMISSIONS
 */
function requirePermission(permission) {
  return function requirePermissionMiddleware(req, res, next) {
    const membership = req.projectMembership;

    if (!membership || !membership.role) {
      // requireProjectMembership no corrio antes: error de montaje de rutas,
      // no del cliente. Se corta igual para no autorizar a ciegas.
      return res.status(403).json({ error: 'No tenes acceso a este proyecto' });
    }

    if (!can(membership.role, permission)) {
      return res.status(403).json({
        error: 'No tenes permiso para realizar esta accion',
        requiredPermission: permission,
        role: membership.role,
      });
    }

    return next();
  };
}

module.exports = { requirePermission };
