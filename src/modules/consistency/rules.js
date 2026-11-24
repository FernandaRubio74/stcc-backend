/**
 * T-031.1 - Reglas de validacion cruzada entre etapas.
 *
 * CONTRATO DE EVALUACION (revision transversal, regla A):
 * Cada regla declara que etapas compara y SOLO se evalua si TODOS esos
 * artefactos ya existen (estan generados y aprobados). Si falta alguno, la
 * regla no se evalua: queda en estado `pendiente`, nunca en `error`. Antes
 * no habia esa distincion y una etapa inexistente se trataba igual que una
 * etapa que existe y no cumple, asi que apenas se terminaba la Definicion
 * ya aparecian "inconsistencias" contra el modelo de datos, la API y las
 * pantallas - que todavia no se habian generado.
 *
 * ROLES Y ACTORES NO SON ENTIDADES (regla B):
 * los `targetUsers` del wizard son ACTORES del dominio (ej. "revisador",
 * "supervisor"), no necesariamente tablas. Un actor puede modelarse como
 * valor de un campo de rol, como tabla de roles, como entidad propia, o
 * puede no estar en el modelo en absoluto (ej. un participante externo que
 * no usa la plataforma). Por eso NINGUNA regla exige que un actor exista
 * como entidad, y la cobertura de actores se detecta de forma ESTRUCTURAL
 * (no por coincidencia de palabras sobre texto libre) y como mucho da una
 * `advertencia`, jamas un `error` que bloquee.
 *
 * La unica regla que afirma "falta una entidad" es `entities-coverage`, y
 * lo hace de forma 100% estructural: un endpoint de la API aprobada declara
 * `resourceEntity` y ese nombre no existe en el modelo de datos aprobado.
 */

const STATUS = {
  OK: 'ok',
  PENDIENTE: 'pendiente',
  ADVERTENCIA: 'advertencia',
  ERROR: 'error',
};

/** Ids de etapa del motor (kebab-case), en orden de dependencia. */
const RULE_STAGES = {
  DEFINITION: 'definition',
  DATA_MODEL: 'data-model',
  API_SPEC: 'api-spec',
  SCREENS: 'screens',
};

const STAGE_LABELS = {
  [RULE_STAGES.DEFINITION]: 'la definicion del producto',
  [RULE_STAGES.DATA_MODEL]: 'el modelo de datos',
  [RULE_STAGES.API_SPEC]: 'la especificacion de API',
  [RULE_STAGES.SCREENS]: 'el mapa de pantallas',
};

// Tipos escalares genericos que el prompt del modelo de datos declara como
// vocabulario fijo (ver data-model/prompts.js). NO es vocabulario del
// dominio del proyecto: es la lista de tipos primitivos del propio schema,
// y se usa solo para distinguir "tipo escalar comun" de "tipo enumerado o
// acotado" al detectar si el modelo diferencia actores de forma estructural.
const SCALAR_TYPES = new Set([
  'uuid', 'string', 'text', 'integer', 'int', 'decimal', 'float', 'number',
  'boolean', 'bool', 'timestamp', 'datetime', 'date', 'time', 'json',
]);

function normalize(text) {
  return (text || '').toString().trim().toLowerCase();
}

/**
 * Presencia de cada artefacto. `definition` cuenta como existente cuando
 * tiene los datos estructurados minimos de la etapa de usuarios y alcance
 * (lo unico que consumen estas reglas), no por tener la fila creada.
 */
function artifactPresence({ definition, dataModel, apiSpec, screenMap } = {}) {
  const targetUsers = Array.isArray(definition?.targetUsers) ? definition.targetUsers : [];
  const mvpScope = definition?.mvpScope && typeof definition.mvpScope === 'object' ? definition.mvpScope : null;

  return {
    [RULE_STAGES.DEFINITION]: Boolean(definition && (targetUsers.length > 0 || mvpScope)),
    [RULE_STAGES.DATA_MODEL]: Boolean(dataModel),
    [RULE_STAGES.API_SPEC]: Boolean(apiSpec),
    [RULE_STAGES.SCREENS]: Boolean(screenMap),
  };
}

function missingStages(stages, presence) {
  return stages.filter((stage) => !presence[stage]);
}

function pendingCheck(rule, stages, missing) {
  const labels = missing.map((stage) => STAGE_LABELS[stage] || stage);
  return {
    rule,
    stages,
    status: STATUS.PENDIENTE,
    message: `Todavia no se puede comprobar: falta generar ${labels.join(' y ')}`,
    pendingStages: missing,
  };
}

/* ------------------------------------------------------------------ *
 * Regla: entidades referenciadas por la API que no existen en el modelo
 * ------------------------------------------------------------------ */

/**
 * 100% estructural: compara `resourceEntity` (un nombre exacto de entidad,
 * garantizado por endpoint.schema.js) contra los nombres del modelo
 * aprobado. Es la unica regla que puede decir "falta esta entidad".
 */
function checkEntitiesCoverage({ dataModel, apiSpec }) {
  if (!dataModel || !apiSpec) return [];

  const entityNames = new Set((dataModel.entities || []).map((entity) => entity.name));
  const missing = (apiSpec.endpoints || []).filter((endpoint) => !entityNames.has(endpoint.resourceEntity));

  return missing.map((endpoint) => ({
    id: `entities-coverage:${endpoint.method} ${endpoint.path}:${endpoint.resourceEntity}`,
    rule: 'entities-coverage',
    stages: [RULE_STAGES.DATA_MODEL, RULE_STAGES.API_SPEC],
    status: STATUS.ERROR,
    message: `El endpoint ${endpoint.method} ${endpoint.path} referencia la entidad "${endpoint.resourceEntity}", que ya no existe en el modelo de datos aprobado.`,
    evidence: `${endpoint.method} ${endpoint.path} -> resourceEntity: "${endpoint.resourceEntity}"`,
    suggestion: `Agregá la entidad "${endpoint.resourceEntity}" al modelo de datos, o corregí ese endpoint para que apunte a una entidad que si exista.`,
  }));
}

/* ------------------------------------------------------------------ *
 * Regla: cobertura de actores (antes "target-users-coverage")
 * ------------------------------------------------------------------ */

/** Un `type` de atributo que no es un escalar comun (ej. "enum: revisador | supervisor"). */
function hasEnumeratedAttribute(dataModel) {
  return (dataModel?.entities || []).some((entity) =>
    (entity.attributes || []).some((attribute) => {
      const type = normalize(attribute.type);
      return type.length > 0 && !SCALAR_TYPES.has(type);
    })
  );
}

/** Una entidad cuyo nombre ES el actor (comparacion exacta, no por palabras sueltas). */
function hasEntityNamedAfterActor(dataModel, actorLabels) {
  const entityNames = new Set((dataModel?.entities || []).map((entity) => normalize(entity.name)));
  return actorLabels.some((label) => entityNames.has(label));
}

/** La API distingue autorizacion (403) de autenticacion (401): hay permisos diferenciados. */
function apiDeclaresAuthorization(apiSpec) {
  return (apiSpec?.endpoints || []).some((endpoint) =>
    (endpoint.responses || []).some((response) => Number(response.status) === 403)
  );
}

/** Las pantallas no son todas visibles para el mismo conjunto de roles. */
function screensDifferentiateByRole(screenMap) {
  const screens = screenMap?.screens || [];
  if (screens.length === 0) return false;
  const roleSets = new Set(screens.map((screen) => [...(screen.visibleToRoles || [])].sort().join(',')));
  return roleSets.size > 1;
}

/**
 * Con 2 o mas actores definidos, el proyecto tiene que diferenciarlos de
 * ALGUNA forma. Se acepta cualquiera de las formas legitimas y se detectan
 * de forma estructural, sin mirar texto libre ni listas de palabras del
 * dominio. Si ninguna aparece, es una `advertencia` (no bloquea): puede ser
 * un MVP donde la diferencia todavia no se modelo, y nunca es correcto
 * exigir por esto una entidad nueva.
 */
function checkActorsCoverage({ definition, dataModel, apiSpec, screenMap }) {
  const targetUsers = Array.isArray(definition?.targetUsers) ? definition.targetUsers : [];
  const actorLabels = targetUsers.map((user) => normalize(user?.label)).filter(Boolean);
  if (actorLabels.length < 2) return [];

  const differentiated =
    hasEnumeratedAttribute(dataModel) ||
    hasEntityNamedAfterActor(dataModel, actorLabels) ||
    apiDeclaresAuthorization(apiSpec) ||
    screensDifferentiateByRole(screenMap);

  if (differentiated) return [];

  const labels = targetUsers.map((user) => user.label).join(', ');
  return [
    {
      id: 'actors-coverage:no-differentiation',
      rule: 'actors-coverage',
      stages: [RULE_STAGES.DEFINITION, RULE_STAGES.DATA_MODEL, RULE_STAGES.API_SPEC, RULE_STAGES.SCREENS],
      status: STATUS.ADVERTENCIA,
      message: `La definicion distingue varios tipos de usuario (${labels}), pero ninguna etapa posterior los diferencia: no hay un campo de rol en el modelo, ni permisos (403) en la API, ni pantallas con visibilidad distinta por rol.`,
      evidence: `targetUsers: ${labels}`,
      suggestion:
        'Si los tipos de usuario tienen permisos distintos, agregá un campo de rol en la entidad de usuario (o respuestas 403 en los endpoints restringidos). Si en realidad todos usan el sistema igual, podés dejarlo asi: es solo un aviso, no bloquea la generacion final.',
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Regla: funcionalidad fuera del alcance que aparece en etapas posteriores
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'para', 'como', 'desde', 'hacia', 'hasta', 'sobre', 'entre', 'pero', 'esta', 'esto', 'este',
  'todo', 'toda', 'todos', 'todas', 'cada', 'otro', 'otra', 'tiene', 'tener', 'puede', 'debe',
  'cuando', 'donde', 'mediante', 'linea', 'online',
]);
const STEM_LENGTH = 5;

function significantStems(text) {
  return normalize(text)
    .split(/[^a-záéíóúñ0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
    .map((word) => word.slice(0, STEM_LENGTH));
}

/**
 * Para "fuga de alcance" se exigen TODAS las palabras clave DENTRO DE UN
 * MISMO artefacto (un endpoint, una pantalla), no repartidas por todo el
 * proyecto. El codigo anterior armaba un unico blob con toda la API y todas
 * las pantallas juntas, asi que dos funcionalidades legitimas y distintas
 * podian, entre las dos, contener todas las palabras de una frase de
 * mvpScope.out que ninguna de las dos implementaba - falso positivo que
 * bloqueaba la generacion final sin razon (estaba documentado en el codigo
 * como limitacion conocida).
 */
function artifactMentionsFeature(artifactText, feature) {
  const keywords = significantStems(feature);
  if (keywords.length === 0) return artifactText.includes(normalize(feature));
  return keywords.every((keyword) => artifactText.includes(keyword));
}

function endpointText(endpoint) {
  const paramText = (endpoint.parameters || []).map((parameter) => parameter.description).filter(Boolean);
  const responseText = (endpoint.responses || []).map((response) => response.description).filter(Boolean);
  return normalize([endpoint.method, endpoint.path, endpoint.description, endpoint.resourceEntity, ...paramText, ...responseText].join(' '));
}

function screenText(screen) {
  const labels = (screen.mainElements || []).map((element) => element.label).filter(Boolean);
  return normalize([screen.name, screen.purpose, ...labels].join(' '));
}

function checkMvpScopeDrift({ definition, apiSpec, screenMap }) {
  const outScope = (definition?.mvpScope?.out || []).filter((feature) => normalize(feature).length > 0);
  if (outScope.length === 0) return [];

  const artifacts = [
    ...(apiSpec?.endpoints || []).map((endpoint) => ({
      kind: RULE_STAGES.API_SPEC,
      ref: `${endpoint.method} ${endpoint.path}`,
      text: endpointText(endpoint),
    })),
    ...(screenMap?.screens || []).map((screen) => ({
      kind: RULE_STAGES.SCREENS,
      ref: screen.name,
      text: screenText(screen),
    })),
  ];

  const findings = [];
  outScope.forEach((feature) => {
    const hit = artifacts.find((artifact) => artifactMentionsFeature(artifact.text, feature));
    if (!hit) return;
    findings.push({
      id: `mvp-scope-drift:${hit.kind}:${hit.ref}:${feature}`,
      rule: 'mvp-scope-drift',
      stages: [RULE_STAGES.DEFINITION, hit.kind],
      status: STATUS.ERROR,
      message: `"${feature}" esta explicitamente fuera del alcance del MVP, pero aparece referenciada en ${STAGE_LABELS[hit.kind]} ("${hit.ref}").`,
      evidence: `${hit.kind}: "${hit.ref}"`,
      suggestion: `Saca "${feature}" de "${hit.ref}", o si en realidad si es parte del MVP, volve a la Definicion y pasala de "fuera de alcance" a "dentro de alcance".`,
    });
  });
  return findings;
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const RULES = [
  {
    rule: 'entities-coverage',
    stages: [RULE_STAGES.DATA_MODEL, RULE_STAGES.API_SPEC],
    evaluate: checkEntitiesCoverage,
  },
  {
    rule: 'actors-coverage',
    stages: [RULE_STAGES.DEFINITION, RULE_STAGES.DATA_MODEL, RULE_STAGES.API_SPEC, RULE_STAGES.SCREENS],
    evaluate: checkActorsCoverage,
  },
  {
    rule: 'mvp-scope-drift',
    stages: [RULE_STAGES.DEFINITION, RULE_STAGES.API_SPEC, RULE_STAGES.SCREENS],
    evaluate: checkMvpScopeDrift,
  },
];

/**
 * Corre todas las reglas respetando el gate de etapas y devuelve:
 * - findings: hallazgos reales (error o advertencia), con id/evidencia/sugerencia.
 * - checks: el estado de CADA regla, incluidas las pendientes (que no son hallazgos).
 */
function evaluateRules(context = {}) {
  const presence = artifactPresence(context);
  const findings = [];
  const checks = [];

  RULES.forEach(({ rule, stages, evaluate }) => {
    const missing = missingStages(stages, presence);
    if (missing.length > 0) {
      checks.push(pendingCheck(rule, stages, missing));
      return;
    }

    const ruleFindings = evaluate(context);
    if (ruleFindings.length === 0) {
      checks.push({ rule, stages, status: STATUS.OK, message: 'Sin inconsistencias' });
      return;
    }

    findings.push(...ruleFindings);
    const worst = ruleFindings.some((finding) => finding.status === STATUS.ERROR) ? STATUS.ERROR : STATUS.ADVERTENCIA;
    checks.push({ rule, stages, status: worst, message: `${ruleFindings.length} hallazgo(s)` });
  });

  return { findings, checks };
}

/** Compatibilidad: la forma historica (solo la lista de hallazgos). */
function runAllRules(context = {}) {
  return evaluateRules(context).findings;
}

module.exports = {
  STATUS,
  RULE_STAGES,
  STAGE_LABELS,
  artifactPresence,
  checkEntitiesCoverage,
  checkActorsCoverage,
  checkMvpScopeDrift,
  evaluateRules,
  runAllRules,
};
