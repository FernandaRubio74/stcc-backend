/**
 * Guard de rol dentro de un proyecto.
 *
 * Corre después de `requireProjectMembership`, que ya dejo `req.projectMembership`
 * con el rol del usuario. Este middleware solo decide si ese rol alcanza para
 * la accion que se esta por ejecutar (PATCH/DELETE = owner).
 *
 * Acepta un rol o una lista de roles permitidos (ej. T-020.3: owner o
 * editor pueden editar el modelo de datos, viewer no).
 */
function requireRole(requiredRole) {
  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  return function requireRoleMiddleware(req, res, next) {
    if (!req.projectMembership) {
      return next(
        new Error('requireRole debe ejecutarse despues de requireProjectMembership')
      );
    }

    if (!allowedRoles.includes(req.projectMembership.role)) {
      return res.status(403).json({ error: 'No tiene permisos para esta accion' });
    }

    return next();
  };
}

module.exports = { requireRole };
