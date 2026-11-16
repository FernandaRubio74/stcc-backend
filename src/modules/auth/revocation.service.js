/**
 * T-042.3 - Denylist de tokens invalidados por logout.
 *
 * Denylist, no allowlist: el camino feliz (token nunca deslogueado) no toca
 * esta tabla. `revoke` recibe la expiracion del propio JWT para que la fila
 * pueda podarse cuando el token hubiera vencido de todas formas.
 */
const defaultPrisma = require('../../database/client');

async function revoke({ jti, expiresAt }, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  // upsert: un logout repetido con el mismo token no debe fallar por choque
  // de clave primaria.
  await prismaClient.revokedToken.upsert({
    where: { jti },
    create: { jti, expiresAt },
    update: { expiresAt },
  });
}

async function isRevoked(jti, deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  const row = await prismaClient.revokedToken.findUnique({ where: { jti } });
  return Boolean(row);
}

module.exports = { revoke, isRevoked };
