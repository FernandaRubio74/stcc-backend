/**
 * T-039.1 - Estado de la API y de su conexion a la base de datos.
 *
 * El chequeo de base va por `deps.prisma` inyectable, igual que el resto de
 * los servicios: asi el camino feliz se prueba contra Postgres real y el caso
 * "base caida" se prueba inyectando un doble que falla, sin tener que mockear
 * Prisma globalmente.
 */
const defaultPrisma = require('../../database/client');

async function isDatabaseUp(deps = {}) {
  const prismaClient = deps.prisma || defaultPrisma;
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function getHealth(deps = {}) {
  const databaseUp = await isDatabaseUp(deps);

  return {
    // Se mantiene `status: 'ok'` cuando todo esta bien: el job de e2e en CI
    // espera este endpoint para saber que el servidor arranco.
    status: databaseUp ? 'ok' : 'degraded',
    db: databaseUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
  };
}

module.exports = { getHealth, isDatabaseUp };
