/**
 * Validacion deterministica de que cada pantalla usa datos/endpoints que
 * de verdad existen (pedido explicito: "verificar que cada pantalla use
 * campos del modelo de datos y llame a endpoints de la especificacion de
 * API"). Mismo patron que api-spec/coherence.js: se corre tanto despues
 * de generar con IA como despues de una edicion manual.
 */
const { ScreenReferenceError } = require('./screens.errors');

function buildEndpointRef(endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function buildDataFieldSet(entities) {
  const fields = new Set();
  (entities || []).forEach((entity) => {
    (entity.attributes || []).forEach((attribute) => {
      fields.add(`${entity.name}.${attribute.name}`);
    });
  });
  return fields;
}

function validateScreenReferences(screens, { entities, endpoints }) {
  const dataFields = buildDataFieldSet(entities);
  const endpointRefs = new Set((endpoints || []).map(buildEndpointRef));

  const invalid = [];
  screens.forEach((screen) => {
    (screen.mainElements || []).forEach((element) => {
      if (element.dataField && !dataFields.has(element.dataField)) {
        invalid.push(`"${screen.name}" -> "${element.label}" referencia el campo "${element.dataField}", que no existe en el modelo de datos aprobado`);
      }
      if (element.endpointRef && !endpointRefs.has(element.endpointRef)) {
        invalid.push(`"${screen.name}" -> "${element.label}" referencia el endpoint "${element.endpointRef}", que no existe en la especificacion de API aprobada`);
      }
    });
  });

  if (invalid.length > 0) {
    throw new ScreenReferenceError(`Las pantallas referencian datos o endpoints inexistentes: ${invalid.join('; ')}`);
  }
}

module.exports = { validateScreenReferences, buildEndpointRef, buildDataFieldSet };
