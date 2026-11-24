/**
 * T-039.4 - Tests del logger estructurado: formato JSON parseable y redaccion
 * de credenciales (es la parte que, si falla, filtra secretos a los logs).
 */
const { formatLine, sanitize } = require('../../src/common/utils/logger');

describe('formatLine', () => {
  test('emite una linea JSON parseable con nivel, timestamp y mensaje', () => {
    const line = formatLine('info', 'http_request', { status: 200 }, new Date('2026-11-15T12:00:00.000Z'));

    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: 'info',
      timestamp: '2026-11-15T12:00:00.000Z',
      message: 'http_request',
      status: 200,
    });
  });

  test('es una sola linea (no rompe el parseo por linea de un agregador)', () => {
    const line = formatLine('error', 'unhandled_error', { message: 'algo\nfallo' });

    expect(line.split('\n')).toHaveLength(1);
  });
});

describe('sanitize', () => {
  test('redacta las claves sensibles en cualquier nivel del objeto', () => {
    const limpio = sanitize({
      method: 'POST',
      authorization: 'Bearer abc.def.ghi',
      headers: { cookie: 'session=1', 'x-api-key': 'secreto' },
      body: { password: 'hunter2', email: 'user@ideator.com' },
    });

    expect(limpio.authorization).toBe('[redactado]');
    expect(limpio.headers.cookie).toBe('[redactado]');
    expect(limpio.headers['x-api-key']).toBe('[redactado]');
    expect(limpio.body.password).toBe('[redactado]');
    // Lo que no es sensible se conserva.
    expect(limpio.method).toBe('POST');
    expect(limpio.body.email).toBe('user@ideator.com');
  });

  test('no explota con valores nulos o no-objeto', () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize('texto')).toEqual({});
    expect(sanitize({ lista: [1, 2, 3] })).toEqual({ lista: [1, 2, 3] });
  });
});
