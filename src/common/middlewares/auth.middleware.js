/**
 * T-007.1 - Middleware de autenticacion.
 *
 * Verifica el JWE emitido por `auth.service.login` (ver
 * auth/jwe.service.js: cifrado hibrido RSA+AES, no un JWT firmado - el
 * payload no es legible sin la clave privada del servidor) y deja la
 * identidad del usuario en `req.user`. Es prerequisito de
 * `requireProjectMembership`: sin un `req.user.id` confiable no hay contra
 * quien chequear la membresia.
 *
 * T-042.3: ademas de desencriptarlo (lo que ya exige que el auth tag de
 * GCM sea valido, osea que no fue alterado) y de la expiracion, se chequea
 * que el `jti` del token no este en la denylist de logout
 * (revocation.service). ninguna de esas dos por si solas alcanza: un token
 * deslogueado sigue siendo descifrable y vigente hasta su vencimiento
 * natural.
 */
const { decryptPayload } = require('../../modules/auth/jwe.service');
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
      payload = decryptPayload(match[1]);
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
