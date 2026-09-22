/**
 * T-007.1 - Middleware de autenticacion.
 *
 * Verifica el JWT emitido por `auth.service.login` y deja la identidad del
 * usuario en `req.user`. Es prerequisito de `requireProjectMembership`: sin
 * un `req.user.id` confiable no hay contra quien chequear la membresia.
 */
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

const BEARER_PREFIX = /^Bearer (.+)$/i;

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const match = BEARER_PREFIX.exec(header.trim());
  if (!match) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], env.jwt.secret);
  } catch {
    // Se responde igual para token invalido, expirado o firmado con otra
    // clave: al cliente no le sirve el detalle y no vale la pena filtrarlo.
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }

  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }

  req.user = { id: payload.sub, email: payload.email };
  return next();
}

module.exports = { requireAuth };
