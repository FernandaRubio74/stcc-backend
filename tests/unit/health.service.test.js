/**
 * T-039.4 - Tests del health check: base arriba (contra Postgres real) y base
 * abajo (doble inyectado por deps, sin mockear Prisma globalmente).
 */
const healthService = require('../../src/modules/health/health.service');

describe('getHealth', () => {
  test('reporta ok y db up cuando la base responde', async () => {
    const health = await healthService.getHealth();

    expect(health.status).toBe('ok');
    expect(health.db).toBe('up');
    expect(typeof health.uptimeSeconds).toBe('number');
  });

  test('reporta degraded y db down cuando la base no responde', async () => {
    const prismaCaido = {
      $queryRaw: () => Promise.reject(new Error('connection refused')),
    };

    const health = await healthService.getHealth({ prisma: prismaCaido });

    expect(health.status).toBe('degraded');
    expect(health.db).toBe('down');
  });

  test('isDatabaseUp no propaga el error de conexion, lo traduce a false', async () => {
    const prismaCaido = {
      $queryRaw: () => {
        throw new Error('ECONNREFUSED');
      },
    };

    await expect(healthService.isDatabaseUp({ prisma: prismaCaido })).resolves.toBe(false);
  });
});
