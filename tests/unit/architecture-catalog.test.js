/**
 * T-029.4 - Test de validacion del esquema/formato del catalogo de
 * arquitecturas: garantiza que agregar un escenario nuevo (como el 5to,
 * en US-029) no pueda dejar el catalogo incompleto.
 */
const { ARCHITECTURE_CATALOG } = require('../../src/modules/architecture/catalog');
const { architectureCatalogSchema } = require('../../src/modules/architecture/catalog.schema');

describe('ARCHITECTURE_CATALOG', () => {
  test('tiene al menos 5 escenarios (DoD de US-028/US-029)', () => {
    expect(ARCHITECTURE_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  test('cada escenario cumple el esquema completo (incluye comunicacion, observabilidad y auth/SSO/autorizacion)', () => {
    expect(() => architectureCatalogSchema.parse(ARCHITECTURE_CATALOG)).not.toThrow();
  });

  test('todos los ids son unicos', () => {
    const ids = ARCHITECTURE_CATALOG.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('incluye el 5to escenario de US-029 con sus consideraciones de observabilidad y auth/SSO/autorizacion', () => {
    const quinto = ARCHITECTURE_CATALOG.find((scenario) => scenario.id === 'monolito-colas-eventos');

    expect(quinto).toBeDefined();
    expect(quinto.observability.length).toBeGreaterThan(0);
    expect(quinto.authSsoAuthorization.length).toBeGreaterThan(0);
  });
});
