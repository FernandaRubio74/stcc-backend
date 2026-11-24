/**
 * T-039.4 - Tests del acumulador de metricas.
 */
const metrics = require('../../src/modules/health/metrics');

beforeEach(() => {
  metrics.reset();
});

describe('metrics', () => {
  test('arranca en cero', () => {
    const snapshot = metrics.snapshot();

    expect(snapshot.requests).toBe(0);
    expect(snapshot.errors).toBe(0);
    expect(snapshot.errorRate).toBe(0);
    expect(snapshot.averageResponseTimeMs).toBe(0);
  });

  test('cuenta requests y agrupa por familia de codigo de estado', () => {
    metrics.record({ statusCode: 200, durationMs: 10 });
    metrics.record({ statusCode: 201, durationMs: 30 });
    metrics.record({ statusCode: 404, durationMs: 5 });

    const snapshot = metrics.snapshot();

    expect(snapshot.requests).toBe(3);
    expect(snapshot.byStatus).toEqual({ '2xx': 2, '4xx': 1 });
    expect(snapshot.averageResponseTimeMs).toBe(15);
  });

  test('solo cuenta como error los 5xx (un 404 no es un fallo del servidor)', () => {
    metrics.record({ statusCode: 404, durationMs: 1 });
    metrics.record({ statusCode: 500, durationMs: 1 });

    const snapshot = metrics.snapshot();

    expect(snapshot.errors).toBe(1);
    expect(snapshot.errorRate).toBe(0.5);
  });

  test('reset vuelve el acumulador a cero', () => {
    metrics.record({ statusCode: 500, durationMs: 100 });
    metrics.reset();

    expect(metrics.snapshot().requests).toBe(0);
  });
});
