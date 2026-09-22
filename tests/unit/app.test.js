/**
 * Smoke test de arranque de la aplicacion.
 *
 * Existe porque ningun test importaba `src/app.js`: cuando la US-005 dejo sin
 * commitear `src/common/middlewares/validate.js`, la app no levantaba
 * (MODULE_NOT_FOUND) y CI seguia en verde igual. Este test hace que cualquier
 * import roto en la cadena de routers rompa la suite.
 */

describe('src/app.js', () => {
  test('se puede importar sin errores (todos los require resuelven)', () => {
    expect(() => require('../../src/app')).not.toThrow();
  });

  test('exporta una app de Express montable', () => {
    const app = require('../../src/app');
    expect(typeof app).toBe('function');
    expect(typeof app.use).toBe('function');
  });
});
