/**
 * T-039.4 - Tests funcionales de /health y /metrics sobre HTTP real.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const prisma = require('../../src/database/client');
const metrics = require('../../src/modules/health/metrics');

function tokenDe(userId, email = 'x@ideator.com') {
  return jwt.sign({ sub: userId, email }, env.jwt.secret, { expiresIn: '1d' });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health', () => {
  test('responde 200 con el estado de la API y de la base', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  test('es publico: no requiere token', async () => {
    const res = await request(app).get('/health');

    expect(res.status).not.toBe(401);
  });
});

describe('GET /metrics', () => {
  beforeEach(() => {
    metrics.reset();
  });

  test('requiere autenticacion', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(401);
  });

  test('expone cantidad de requests, tasa de error y tiempo de respuesta', async () => {
    const user = await prisma.user.create({
      data: { email: `metrics-${Date.now()}@ideator.com`, fullName: 'Metrics' },
    });

    // Genera trafico: un 200 y un 404.
    await request(app).get('/health');
    await request(app).get('/projects/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${tokenDe(user.id)}`);

    const res = await request(app).get('/metrics').set('Authorization', `Bearer ${tokenDe(user.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toBeGreaterThanOrEqual(2);
    expect(res.body.byStatus).toHaveProperty('2xx');
    expect(res.body.byStatus).toHaveProperty('4xx');
    expect(res.body.errorRate).toBe(0);
    expect(typeof res.body.averageResponseTimeMs).toBe('number');

    await prisma.user.delete({ where: { id: user.id } });
  });
});
