/**
 * Validacion deterministica de cobertura del plan de pruebas (pedido
 * explicito: no se puede avanzar de esta etapa si algun requisito del MVP,
 * endpoint o pantalla se queda sin casos de prueba). Mismo patron que
 * api-spec/coherence.js: se corre tanto despues de generar con IA como
 * despues de una edicion manual.
 */
const { CoverageGapError } = require('./testing.errors');

function buildEndpointRef(endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * @param {object} content testPlanContentSchema ya parseado
 * @param {{mvpScopeIn?: string[], endpoints?: Array<{method,path}>, screenNames?: string[]}} context
 */
function findCoverageGaps(content, { mvpScopeIn = [], endpoints = [], screenNames = [] } = {}) {
  const coveredRequirements = new Set((content.traceabilityMatrix || []).map((entry) => entry.requirementRef));
  const missingRequirements = mvpScopeIn.filter((requirement) => !coveredRequirements.has(requirement));

  const coveredEndpoints = new Set((content.endpointCases || []).map((entry) => entry.endpointRef));
  const missingEndpoints = endpoints.map(buildEndpointRef).filter((ref) => !coveredEndpoints.has(ref));

  const coveredScreens = new Set((content.screenCases || []).map((entry) => entry.screenRef));
  const missingScreens = screenNames.filter((name) => !coveredScreens.has(name));

  return { missingRequirements, missingEndpoints, missingScreens };
}

function hasCoverageGaps(gaps) {
  return gaps.missingRequirements.length > 0 || gaps.missingEndpoints.length > 0 || gaps.missingScreens.length > 0;
}

function describeCoverageGaps(gaps) {
  const parts = [];
  if (gaps.missingRequirements.length > 0) {
    parts.push(`requisitos del MVP sin cobertura: ${gaps.missingRequirements.join(', ')}`);
  }
  if (gaps.missingEndpoints.length > 0) {
    parts.push(`endpoints sin casos de prueba: ${gaps.missingEndpoints.join(', ')}`);
  }
  if (gaps.missingScreens.length > 0) {
    parts.push(`pantallas sin casos de prueba: ${gaps.missingScreens.join(', ')}`);
  }
  return parts.join('; ');
}

function assertFullCoverageOrThrow(content, context) {
  const gaps = findCoverageGaps(content, context);
  if (hasCoverageGaps(gaps)) {
    throw new CoverageGapError(`El plan de pruebas no cubre todo lo necesario: ${describeCoverageGaps(gaps)}`, gaps);
  }
}

module.exports = {
  buildEndpointRef,
  findCoverageGaps,
  hasCoverageGaps,
  describeCoverageGaps,
  assertFullCoverageOrThrow,
};
