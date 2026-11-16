/**
 * T-027.3 - Validacion deterministica de cobertura MVP <-> pantallas:
 * - toda funcionalidad dentro del alcance del MVP (mvpScope.in) tiene al
 *   menos una pantalla cuyo nombre/proposito/elementos la mencionen.
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
const { MvpCoverageError } = require('./screens.errors');

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
  return [screen.name, screen.purpose, ...screen.mainElements].join(' ').toLowerCase();
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

// Visto en pruebas manuales reales: el wizard a veces repite una exclusion
// dentro de mvpScope.in, redactada como negacion (ej. "Sin pagos online"),
// aunque el mismo concepto ya este (correctamente, en positivo) en
// mvpScope.out. Una negacion no es una funcionalidad que una pantalla
// pueda "cubrir", asi que se descarta antes de exigir cobertura.
const NEGATION_PREFIX = /^(sin|no)\s+/i;

function isPositiveFeature(feature) {
  return !NEGATION_PREFIX.test(feature.trim());
}

function validateMvpCoverage(screens, mvpScope) {
  const inFeatures = (mvpScope?.in || []).filter(isPositiveFeature);
  const outFeatures = mvpScope?.out || [];

  const uncovered = inFeatures.filter(
    (feature) => !screens.some((screen) => screenMentionsFeature(screen, feature))
  );
  if (uncovered.length > 0) {
    throw new MvpCoverageError(
      `Las siguientes funcionalidades del MVP no tienen ninguna pantalla asociada: ${uncovered.join(', ')}`
    );
  }

  const leaked = outFeatures.filter((feature) =>
    screens.some((screen) => screenMentionsFeature(screen, feature, { requireAll: true }))
  );
  if (leaked.length > 0) {
    throw new MvpCoverageError(
      `Las siguientes pantallas incluyen funcionalidad explicitamente fuera del alcance del MVP: ${leaked.join(', ')}`
    );
  }
}

module.exports = { validateMvpCoverage };
