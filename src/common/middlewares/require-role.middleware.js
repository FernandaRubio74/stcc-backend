/**
 * Guard de rol dentro de un proyecto.
 *
 * Corre despues de `requireProjectMembership`, que ya dejo `req.projectMembership`
 * con el rol del usuario. Este middleware solo decide si ese rol alcanza para
 * la accion que se esta por ejecutar (PATCH/DELETE = owner).
 */
function requireRole(requiredRole) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.projectMembership) {
      return next(
        new Error('requireRole debe ejecutarse despues de requireProjectMembership')
      );
    }

    if (req.projectMembership.role !== requiredRole) {
      return res.status(403).json({ error: 'No tiene permisos para esta accion' });
    }

    return next();
  };
}

module.exports = { requireRole };
