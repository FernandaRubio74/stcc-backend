/**
 * T-023.2 - Validacion deterministica de que cada endpoint referencia una
 * entidad que realmente existe en el modelo de datos aprobado. Se corre
 * tanto despues de generar con IA como despues de una edicion manual, para
 * que la especificacion nunca quede inconsistente con el modelo vigente.
 */
const { EndpointEntityMismatchError } = require('./api-spec.errors');

function validateEndpointsAgainstDataModel(endpoints, entities) {
  const entityNames = new Set(entities.map((entity) => entity.name));
  const invalid = endpoints.filter((endpoint) => !entityNames.has(endpoint.resourceEntity));

  if (invalid.length > 0) {
    const detalle = invalid.map((e) => `${e.method} ${e.path} -> ${e.resourceEntity}`).join(', ');
    throw new EndpointEntityMismatchError(
      `Los siguientes endpoints referencian entidades que no existen en el modelo de datos aprobado: ${detalle}`
    );
  }
}

module.exports = { validateEndpointsAgainstDataModel };
