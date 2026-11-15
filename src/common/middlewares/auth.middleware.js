/**
 * T-007.1 - Middleware de autenticacion.
 *
 * Verifica el JWT emitido por `auth.service.login` y deja la identidad del
 * usuario en `req.user`. Es prerequisito de `requireProjectMembership`: sin
 * un `req.user.id` confiable no hay contra quien chequear la membresia.
 *
 * T-042.3: ademas de la firma y la expiracion, se chequea que el `jti` del
 * token no este en la denylist de logout (revocation.service). La firma y
 * la expiracion por si solas no alcanzan: un token deslogueado sigue
 * teniendo ambas validas hasta su vencimiento natural.
 */
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const revocationService = require('../../modules/auth/revocation.service');

const BEARER_PREFIX = /^Bearer (.+)$/i;

/**
 * La inyeccion de `prisma` (reenviada a revocationService) sigue el mismo
 * patron que `project-member.middleware.js`: los tests apuntan a la base de
 * pruebas sin mockear Prisma globalmente.
 */
function createRequireAuth({ prisma } = {}) {
  return async function requireAuth(req, res, next) {
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

    if (payload.jti && (await revocationService.isRevoked(payload.jti, { prisma }))) {
      return res.status(401).json({ error: 'Token invalido o expirado' });
    }

    req.user = { id: payload.sub, email: payload.email };
    req.tokenPayload = { jti: payload.jti, exp: payload.exp };
    return next();
  };
}

module.exports = { createRequireAuth, requireAuth: createRequireAuth() };
