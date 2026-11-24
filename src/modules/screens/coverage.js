/**
 * T-027.3 - Validacion deterministica de cobertura MVP <-> pantallas:
 * - toda funcionalidad dentro del alcance del MVP (mvpScope.in) tiene al
 *   menos una pantalla cuyo nombre/proposito/elementos la mencionen, O
 *   esta documentada en el modelo de datos/API aprobados (ver backendText
 *   mas abajo), O es una funcionalidad de rol/permiso y las pantallas ya
 *   diferencian de verdad por rol (ver isRoleDifferentiationFeature mas
 *   abajo): no toda funcionalidad del MVP es una pantalla.
 * - ninguna pantalla menciona una funcionalidad explicitamente fuera del
 *   alcance del MVP (mvpScope.out).
 *
 * Es una heuristica textual, no NLP: alcanza para el DoD ("todo el MVP
 * relevante tiene pantalla asociada" / "no incluyen funcionalidad fuera
 * del MVP") sin depender de que la IA lo haga bien por su cuenta.
 *
 * No es un substring exacto de la frase completa: en pruebas manuales
 * reales, el wizard describe cada funcionalidad del MVP con una oracion
 * larga (ej. "Panel simple para dueños: alta de sede y canchas, edicion
 * basica de datos"), que ninguna pantalla va a repetir palabra por
 * palabra. En cambio, se compara por palabras clave significativas (se
 * descartan conectores y palabras cortas), truncadas a un prefijo corto
 * para tolerar variaciones de plural/genero (ej. "cancha" encaja con
 * "canchas").
 *
 * El umbral de coincidencia es distinto segun la direccion, a proposito:
 * para "falta cobertura" conviene ser laxo (al menos la mitad de las
 * palabras clave) porque un falso negativo bloquea al usuario sin razon.
 * Para "fuga de alcance" conviene ser estricto (TODAS las palabras clave
 * en la misma pantalla) porque un falso positivo tambien bloquea sin
 * razon — visto en pruebas manuales: una pantalla legitima de "reserva
 * como invitado" quedaba marcada como fuga de "Cuentas/registro del
 * jugador (el jugador reserva como invitado)" solo por compartir las
 * palabras "jugador"/"invitado" de esa frase aclaratoria.
 */
const { RoleCoverageError } = require('./screens.errors');

// Los unicos roles reales del sistema (ProjectRole, ver schema.prisma) -
// no son un dato del dominio del wizard, son fijos.
const ALL_PROJECT_ROLES = ['owner', 'editor', 'viewer'];

const STOPWORDS = new Set([
  'para', 'como', 'desde', 'hacia', 'hasta', 'sobre', 'entre', 'pero', 'esta', 'esto', 'este',
  'todo', 'toda', 'todos', 'todas', 'cada', 'otro', 'otra', 'tiene', 'tener', 'puede', 'debe',
  'cuando', 'donde', 'mediante',
]);
const STEM_LENGTH = 5;

function stem(word) {
  return word.slice(0, STEM_LENGTH);
}

function significantStems(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-záéíóúñ0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
    .map(stem);
}

function screenText(screen) {
  const elementLabels = (screen.mainElements || []).map((element) => element.label);
  return [screen.name, screen.purpose, ...elementLabels].join(' ').toLowerCase();
}

function screenMentionsFeature(screen, feature, { requireAll = false } = {}) {
  const keywords = significantStems(feature);
  if (keywords.length === 0) {
    return screenText(screen).includes(feature.toLowerCase());
  }

  const text = screenText(screen);
  const matches = keywords.filter((word) => text.includes(word)).length;
  return requireAll ? matches === keywords.length : matches >= Math.ceil(keywords.length / 2);
}

/**
 * Texto del modelo de datos y la API aprobados, para el chequeo de "falta
 * cobertura" (nunca para el de "fuga de alcance", que se mantiene estricto
 * y solo contra pantallas). Visto en pruebas manuales reales: no toda
 * funcionalidad del MVP es una pantalla - una automatizacion de backend
 * (ej. "Actualizacion automatica de stock" al confirmar una venta) o una
 * restriccion transversal (ej. "Restriccion de accesos mediante roles de
 * empleado", que ya se implementa via permisos de la API/visibleToRoles,
 * no con una pantalla propia) quedan documentadas en el modelo de datos o
 * en la especificacion de API, no en una pantalla dedicada. Exigir una
 * pantalla para ese tipo de funcionalidad bloqueaba sin razon.
 */
function backendText({ apiSpec, dataModel } = {}) {
  const apiParts = (apiSpec?.endpoints || []).flatMap((endpoint) => [
    endpoint.method,
    endpoint.path,
    endpoint.description,
    endpoint.resourceEntity,
  ]);
  const dataParts = (dataModel?.entities || []).flatMap((entity) => [
    entity.name,
    ...(entity.attributes || []).map((attribute) => attribute.name),
  ]);
  return [...apiParts, ...dataParts].filter(Boolean).join(' ').toLowerCase();
}

function mentionsFeature(text, feature, { requireAll = false } = {}) {
  const keywords = significantStems(feature);
  if (keywords.length === 0) {
    return text.includes(feature.toLowerCase());
  }
  const matches = keywords.filter((word) => text.includes(word)).length;
  return requireAll ? matches === keywords.length : matches >= Math.ceil(keywords.length / 2);
}

// La lista fija de palabras de rol/permiso que vivia aca (para eximir de
// "falta pantalla" a funcionalidades de permisos) se elimino: la regla B de
// la revision transversal prohibe decidir esto con vocabulario fijo en el
// codigo, y ya no hace falta porque este chequeo dejo de bloquear.

// Visto en pruebas manuales reales: el wizard a veces repite una exclusion
// dentro de mvpScope.in, redactada como negacion (ej. "Sin pagos online"),
// aunque el mismo concepto ya este (correctamente, en positivo) en
// mvpScope.out. Una negacion no es una funcionalidad que una pantalla
// pueda "cubrir", asi que se descarta antes de exigir cobertura.
const NEGATION_PREFIX = /^(sin|no)\s+/i;

function isPositiveFeature(feature) {
  return !NEGATION_PREFIX.test(feature.trim());
}

function findUncoveredMvpFeatures(screens, mvpScope, context = {}) {
  const inFeatures = (mvpScope?.in || []).filter(isPositiveFeature);
  const backend = backendText(context);

  // Diagnostico, NO bloqueo (hallazgo H-04 de la revision transversal):
  // decidir por coincidencia de palabras sobre texto libre si una
  // funcionalidad "tiene pantalla" produce falsos positivos que bloquean
  // una generacion correcta - visto con el caso del courier, donde
  // "Pesaje diferenciado por tipo de contenido" estaba implementado (campos
  // `peso` y `tipo` + pantalla de pesaje) y ninguna palabra clave llegaba
  // al umbral dentro de un mismo artefacto. Lo que SI bloquea son las
  // validaciones estructurales exactas: referencias de datos/endpoints
  // (coherence.js), cobertura de roles reales y navegacion.
  //
  // La fuga de alcance tampoco se evalua aca: la cubre el motor de
  // consistencia por artefacto individual (regla `mvp-scope-drift`), que es
  // mas preciso que este blob de texto y no bloquea la generacion de la
  // etapa sino la generacion final.
  return inFeatures.filter((feature) => {
    if (screens.some((screen) => screenMentionsFeature(screen, feature))) return false;
    if (mentionsFeature(backend, feature)) return false;
    return true;
  });
}

// Pedido explicito: "cada rol del proyecto tiene sus pantallas y no sobran
// ni faltan" - se interpreta al pie de la letra: el conjunto de roles
// (owner/editor/viewer) referenciado en "visibleToRoles" de TODAS las
// pantallas tiene que ser exactamente el conjunto completo. Un valor que
// no sea uno de los 3 roles reales ya es imposible (lo rechaza el schema
// de zod antes de llegar aca).
function validateRoleCoverage(screens) {
  const covered = new Set();
  screens.forEach((screen) => (screen.visibleToRoles || []).forEach((role) => covered.add(role)));

  const missing = ALL_PROJECT_ROLES.filter((role) => !covered.has(role));
  if (missing.length > 0) {
    throw new RoleCoverageError(
      `Los siguientes roles no tienen ninguna pantalla visible para ellos: ${missing.join(', ')}`
    );
  }
}

module.exports = { findUncoveredMvpFeatures, validateRoleCoverage, ALL_PROJECT_ROLES };
