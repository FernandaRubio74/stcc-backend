/**
 * T-027.3 - Validacion deterministica de cobertura MVP <-> pantallas:
 * - toda funcionalidad dentro del alcance del MVP (mvpScope.in) tiene al
 *   menos una pantalla cuyo nombre/proposito/elementos la mencionen.
 * - ninguna pantalla menciona una funcionalidad explicitamente fuera del
 *   alcance del MVP (mvpScope.out).
 *
 * Es una heuristica textual (substring, case-insensitive), no NLP: alcanza
 * para el DoD ("todo el MVP relevante tiene pantalla asociada" / "no
 * incluyen funcionalidad fuera del MVP") sin depender de que la IA lo haga
 * bien por su cuenta.
 */
const { MvpCoverageError } = require('./screens.errors');

function screenText(screen) {
  return [screen.name, screen.purpose, ...screen.mainElements].join(' ').toLowerCase();
}

function screenMentionsFeature(screen, feature) {
  return screenText(screen).includes(feature.toLowerCase());
}

function validateMvpCoverage(screens, mvpScope) {
  const inFeatures = mvpScope?.in || [];
  const outFeatures = mvpScope?.out || [];

  const uncovered = inFeatures.filter(
    (feature) => !screens.some((screen) => screenMentionsFeature(screen, feature))
  );
  if (uncovered.length > 0) {
    throw new MvpCoverageError(
      `Las siguientes funcionalidades del MVP no tienen ninguna pantalla asociada: ${uncovered.join(', ')}`
    );
  }

  const leaked = outFeatures.filter((feature) => screens.some((screen) => screenMentionsFeature(screen, feature)));
  if (leaked.length > 0) {
    throw new MvpCoverageError(
      `Las siguientes pantallas incluyen funcionalidad explicitamente fuera del alcance del MVP: ${leaked.join(', ')}`
    );
  }
}

module.exports = { validateMvpCoverage };
