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
 * pantallas) — la misma heuristica por palabras clave que coverage.js
 * (screens), por el mismo motivo: en pruebas manuales reales, un tipo de
 * usuario como "Dueño de cancha" no aparece como frase exacta en ningun
 * lado (el modelo/API/pantallas usan "dueño" y "cancha" por separado), asi
 * que un substring exacto de la frase completa da falsos negativos.
 */

const STOPWORDS = new Set([
  'para', 'como', 'desde', 'hacia', 'hasta', 'sobre', 'entre', 'pero', 'esta', 'esto', 'este',
  'todo', 'toda', 'todos', 'todas', 'cada', 'otro', 'otra', 'tiene', 'tener', 'puede', 'debe',
  'cuando', 'donde', 'mediante',
]);
const STEM_LENGTH = 5;

function normalize(text) {
  return (text || '').toLowerCase();
}

function stem(word) {
  return word.slice(0, STEM_LENGTH);
}

function significantStems(text) {
  return normalize(text)
    .split(/[^a-záéíóúñ0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
    .map(stem);
}

// requireAll=false (default, para "falta cobertura"): alcanza con la mitad
// de las palabras clave — un falso negativo bloquearia sin razon. true
// (para "fuga de alcance"): exige todas — un falso positivo bloquearia
// igual sin razon.
function mentionsPhrase(haystack, phrase, { requireAll = false } = {}) {
  const keywords = significantStems(phrase);
  if (keywords.length === 0) return haystack.includes(normalize(phrase));

  const matches = keywords.filter((word) => haystack.includes(word)).length;
  return requireAll ? matches === keywords.length : matches >= Math.ceil(keywords.length / 2);
}

// LIMITACION CONOCIDA (visto en pruebas manuales reales, no resuelta todavia):
// el haystack junta TODO el proyecto (todas las pantallas, toda la API) en un
// solo string antes de buscar palabras clave. Con requireAll=true esto puede
// dar un falso positivo si dos funcionalidades distintas y legitimas (ej. una
// pantalla de registro del dueño + una pantalla de reserva del jugador)
// juntas contienen, repartidas entre ambas, todas las palabras clave de una
// frase de mvpScope.out que ninguna de las dos implementa en realidad (ej.
// "Cuentas/registro del jugador"). La forma correcta de resolverlo es la
// misma que ya usa coverage.js (screens): comparar por pantalla/entidad/
// endpoint individual en vez de un unico blob combinado — pendiente, es un
// cambio mas grande que excede un ajuste de heuristica puntual.
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
    .filter((user) => !mentionsPhrase(haystack, user.label))
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
    .filter((feature) => mentionsPhrase(haystack, feature, { requireAll: true }))
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
