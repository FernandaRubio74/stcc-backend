/**
 * T-031.1 - Reglas de validacion cruzada entre etapas.
 *
 * Cada regla es una funcion pura que recibe el contexto completo del
 * proyecto (definicion, modelo de datos aprobado, especificacion de API
 * aprobada, mapa de pantallas) y devuelve una lista de items accionables
 * ({ rule, stages, message }) — vacia si no encuentra contradicciones.
 *
 * Interpretacion de "roles definidos en la etapa inicial" (DoD de US-031):
 * en Ideator los "roles" que el wizard define en la etapa de usuarios
 * objetivo (US-016, `targetUsers`) son tipos de usuario del dominio (ej.
 * "Agente de soporte"), no el rol de membresia (owner/editor/viewer, que
 * ya es fijo y esta validado en cada capa por su propio schema). La regla
 * `targetUsersCoverage` chequea que cada tipo de usuario definido este
 * mencionado en al menos una etapa posterior (modelo de datos, API o
 * pantallas) — la misma heuristica de texto que coverage.js (screens).
 */

function normalize(text) {
  return (text || '').toLowerCase();
}

function buildHaystack({ dataModel, apiSpec, screenMap } = {}) {
  const parts = [];

  (dataModel?.entities || []).forEach((entity) => {
    parts.push(entity.name);
    (entity.attributes || []).forEach((attr) => parts.push(attr.name));
  });

  (apiSpec?.endpoints || []).forEach((endpoint) => {
    parts.push(endpoint.description, endpoint.path, endpoint.resourceEntity);
  });

  (screenMap?.screens || []).forEach((screen) => {
    parts.push(screen.name, screen.purpose, ...(screen.mainElements || []));
  });

  return normalize(parts.join(' '));
}

/** Entidades referenciadas por la API aprobada que ya no existen en el modelo de datos aprobado (drift post-aprobacion). */
function checkEntitiesCoverage({ dataModel, apiSpec }) {
  if (!dataModel || !apiSpec) return [];

  const entityNames = new Set(dataModel.entities.map((entity) => entity.name));
  const missing = apiSpec.endpoints.filter((endpoint) => !entityNames.has(endpoint.resourceEntity));

  return missing.map((endpoint) => ({
    rule: 'entities-coverage',
    stages: ['data-model', 'api-spec'],
    message: `El endpoint ${endpoint.method} ${endpoint.path} referencia la entidad "${endpoint.resourceEntity}", que ya no existe en el modelo de datos aprobado.`,
  }));
}

/** Tipos de usuario definidos en el wizard que ninguna etapa posterior refleja. */
function checkTargetUsersCoverage({ definition, dataModel, apiSpec, screenMap }) {
  const targetUsers = definition?.targetUsers || [];
  if (targetUsers.length === 0) return [];

  const haystack = buildHaystack({ dataModel, apiSpec, screenMap });

  return targetUsers
    .filter((user) => !haystack.includes(normalize(user.label)))
    .map((user) => ({
      rule: 'target-users-coverage',
      stages: ['definition', 'data-model', 'api-spec', 'screens'],
      message: `El tipo de usuario "${user.label}" no esta reflejado en el modelo de datos, la API ni las pantallas generadas.`,
    }));
}

/** Funcionalidad explicitamente fuera del MVP que aparece en la API o en las pantallas (drift post-definicion). */
function checkMvpScopeDrift({ definition, apiSpec, screenMap }) {
  const outScope = definition?.mvpScope?.out || [];
  if (outScope.length === 0) return [];

  const haystack = buildHaystack({ apiSpec, screenMap });

  return outScope
    .filter((feature) => haystack.includes(normalize(feature)))
    .map((feature) => ({
      rule: 'mvp-scope-drift',
      stages: ['definition', 'api-spec', 'screens'],
      message: `"${feature}" esta explicitamente fuera del alcance del MVP, pero aparece referenciada en la API o en el mapa de pantallas.`,
    }));
}

const RULES = [checkEntitiesCoverage, checkTargetUsersCoverage, checkMvpScopeDrift];

function runAllRules(context) {
  return RULES.flatMap((rule) => rule(context));
}

module.exports = { checkEntitiesCoverage, checkTargetUsersCoverage, checkMvpScopeDrift, runAllRules };
