/**
 * T-023.4 - Tests de la validacion de coherencia endpoint-entidad con
 * referencia invalida.
 */
const { validateEndpointsAgainstDataModel } = require('../../src/modules/api-spec/coherence');
const { EndpointEntityMismatchError } = require('../../src/modules/api-spec/api-spec.errors');

const ENTITIES = [
  { name: 'User', attributes: [{ name: 'id', type: 'uuid', primaryKey: true }], indexes: [] },
  { name: 'Order', attributes: [{ name: 'id', type: 'uuid', primaryKey: true }], indexes: [] },
];

function endpoint(resourceEntity) {
  return {
    method: 'GET',
    path: '/x',
    description: 'd',
    resourceEntity,
    parameters: [],
    responses: [{ status: 200, description: 'ok' }],
  };
}

describe('validateEndpointsAgainstDataModel', () => {
  test('no lanza nada si todos los endpoints referencian entidades existentes', () => {
    expect(() => validateEndpointsAgainstDataModel([endpoint('User'), endpoint('Order')], ENTITIES)).not.toThrow();
  });

  test('lanza EndpointEntityMismatchError si un endpoint referencia una entidad inexistente', () => {
    expect(() => validateEndpointsAgainstDataModel([endpoint('Invoice')], ENTITIES)).toThrow(
      EndpointEntityMismatchError
    );
  });

  test('el mensaje de error identifica el metodo, la ruta y la entidad invalida', () => {
    try {
      validateEndpointsAgainstDataModel([endpoint('Invoice')], ENTITIES);
      throw new Error('deberia haber lanzado');
    } catch (err) {
      expect(err.message).toContain('GET /x -> Invoice');
    }
  });
});
