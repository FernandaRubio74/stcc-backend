/**
 * T-035.1 - Plantilla del documento de especificacion del producto (US-035).
 *
 * Generador DETERMINISTA: la IA no participa. Toma el estado ya aprobado de
 * cada etapa y lo escribe completo, porque el DoD exige un documento
 * autocontenido: una IA externa tiene que poder implementar el producto sin
 * acceso a la conversacion que lo origino.
 *
 * Las 10 secciones son fijas y siempre se emiten; si alguna no tuviera datos
 * se deja constancia explicita en vez de omitirla, porque el documento se usa
 * como contrato de entrada de otra herramienta y su estructura no puede
 * variar de un proyecto a otro.
 *
 * Las "reglas de negocio" no son un campo que el wizard capture: se derivan
 * de forma deterministica de las restricciones ya decididas (obligatoriedad,
 * unicidad, indices unicos, claves foraneas, codigos 401/403 de la API y lo
 * que quedo fuera del MVP). Es informacion que la IA externa necesita para
 * implementar sin volver a preguntar.
 */

const { renderScreenWireframe } = require('../screens/wireframe');
const { generateSeedData } = require('../data-model/seedData');

const EMPTY = '_No se registro informacion para esta seccion._';

/** Las tablas Markdown se rompen con `|` y con saltos de linea. */
function cell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function nonEmpty(items) {
  return (items || []).filter((item) => String(item ?? '').trim().length > 0);
}

function bulletList(items, emptyText = EMPTY) {
  const list = nonEmpty(items);
  if (list.length === 0) return emptyText;
  return list.map((item) => `- ${String(item).trim()}`).join('\n');
}

function numberedList(items, emptyText = EMPTY) {
  const list = nonEmpty(items);
  if (list.length === 0) return emptyText;
  return list.map((item, i) => `${i + 1}. ${String(item).trim()}`).join('\n');
}

function table(headers, rows, emptyText = EMPTY) {
  if (!rows || rows.length === 0) return emptyText;
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function mermaidBlock(diagram, emptyText = EMPTY) {
  if (!diagram || String(diagram).trim().length === 0) return emptyText;
  return ['```mermaid', String(diagram).trim(), '```'].join('\n');
}

function paragraph(text, emptyText = EMPTY) {
  const value = String(text ?? '').trim();
  return value.length > 0 ? value : emptyText;
}

function section(title, ...blocks) {
  return [`## ${title}`, '', ...blocks.filter((block) => block !== null && block !== undefined), ''].join('\n');
}

function buildHeader({ project, versionNumber, generatedAt, dataModel, apiSpec }) {
  const meta = table(
    ['Dato', 'Valor'],
    [
      ['Documento', `Especificacion del producto v${versionNumber}`],
      ['Proyecto', project?.name ?? '(sin nombre)'],
      ['Generado', generatedAt.toISOString()],
      ['Modelo de datos', `v${dataModel?.versionNumber ?? '-'} (aprobado)`],
      ['Especificacion de API', `v${apiSpec?.versionNumber ?? '-'} (aprobada)`],
    ]
  );

  return [
    `# Especificacion del producto — ${project?.name ?? 'Proyecto'}`,
    '',
    meta,
    '',
    'Documento generado por GENIAL a partir de las etapas ya aprobadas del proyecto.',
    'Es autocontenido: describe el producto completo y no requiere consultar la conversacion',
    'que lo origino ni ningun otro contexto previo.',
    '',
  ].join('\n');
}

function buildProblemSection(definition) {
  return section(
    '1. Problema y contexto',
    paragraph(definition?.problemSummary, '_El problema y el contexto no quedaron registrados._')
  );
}

function buildUsersSection(definition) {
  const rows = (definition?.targetUsers || []).map((user) => [user?.label, user?.description]);
  return section('2. Usuarios objetivo', table(['Tipo de usuario', 'Descripcion'], rows));
}

function buildScopeSection(definition) {
  const scope = definition?.mvpScope || {};
  return section(
    '3. Alcance del MVP',
    '### Incluido en el MVP',
    '',
    bulletList(scope.in, '_No se registraron funcionalidades dentro del alcance._'),
    '',
    '### Excluido explicitamente del MVP',
    '',
    bulletList(scope.out, '_No se registraron exclusiones explicitas._')
  );
}

function requiredAttributes(entity) {
  return (entity.attributes || [])
    .filter((attr) => attr.nullable === false && !attr.primaryKey)
    .map((attr) => attr.name);
}

function uniqueAttributes(entity) {
  return (entity.attributes || []).filter((attr) => attr.unique).map((attr) => attr.name);
}

/** Reglas derivadas de decisiones ya tomadas; nunca inventadas. */
function deriveBusinessRules({ definition, dataModel, apiSpec }) {
  const rules = [];

  (dataModel?.entities || []).forEach((entity) => {
    const required = requiredAttributes(entity);
    if (required.length > 0) {
      rules.push(`En "${entity.name}" son obligatorios: ${required.join(', ')}.`);
    }

    const unique = uniqueAttributes(entity);
    if (unique.length > 0) {
      rules.push(`En "${entity.name}" no puede haber dos registros con el mismo valor de: ${unique.join(', ')}.`);
    }

    (entity.attributes || [])
      .filter((attr) => attr.foreignKey)
      .forEach((attr) => {
        rules.push(
          `Cada "${entity.name}" referencia un "${attr.foreignKey.entity}" existente (${entity.name}.${attr.name} -> ${attr.foreignKey.entity}.${attr.foreignKey.attribute}).`
        );
      });

    (entity.indexes || [])
      .filter((index) => index.unique)
      .forEach((index) => {
        rules.push(`La combinacion (${(index.attributes || []).join(', ')}) debe ser unica en "${entity.name}".`);
      });
  });

  const endpoints = apiSpec?.endpoints || [];
  const statuses = (endpoint) => (endpoint.responses || []).map((response) => response.status);

  if (endpoints.length > 0 && endpoints.every((endpoint) => statuses(endpoint).includes(401))) {
    rules.push('Todas las operaciones de la API requieren autenticacion: sin sesion valida responden 401.');
  }

  endpoints
    .filter((endpoint) => statuses(endpoint).includes(403))
    .forEach((endpoint) => {
      rules.push(
        `La operacion ${endpoint.method} ${endpoint.path} esta restringida por rol o permiso: responde 403 si el usuario autenticado no esta autorizado.`
      );
    });

  (definition?.mvpScope?.out || []).forEach((feature) => {
    rules.push(`Queda fuera del alcance del MVP y no debe implementarse: ${feature}.`);
  });

  return [...new Set(rules)];
}

function buildBusinessRulesSection({ definition, dataModel, apiSpec }) {
  return section(
    '4. Reglas de negocio y recorrido principal',
    '### Recorrido principal del usuario',
    '',
    numberedList(definition?.userJourney, '_No se registro el recorrido principal._'),
    '',
    '### Reglas de negocio',
    '',
    'Derivadas de las restricciones del modelo de datos, de los permisos de la API y del alcance del MVP:',
    '',
    bulletList(deriveBusinessRules({ definition, dataModel, apiSpec }), '_No se derivaron reglas de negocio._')
  );
}

function buildEntityBlock(entity) {
  const rows = (entity.attributes || []).map((attr) => [
    attr.name,
    attr.type,
    attr.primaryKey ? 'si' : '',
    attr.unique ? 'si' : '',
    attr.nullable === false ? 'si' : '',
    attr.foreignKey ? `${attr.foreignKey.entity}.${attr.foreignKey.attribute}` : '',
  ]);

  const indexes = (entity.indexes || []).map((index) => [
    index.name,
    (index.attributes || []).join(', '),
    index.unique ? 'si' : '',
  ]);

  return [
    `### Entidad: ${entity.name}`,
    '',
    table(['Atributo', 'Tipo', 'PK', 'Unico', 'Obligatorio', 'Referencia'], rows, '_Entidad sin atributos._'),
    '',
    indexes.length > 0 ? ['**Indices**', '', table(['Nombre', 'Atributos', 'Unico'], indexes), ''].join('\n') : null,
  ]
    .filter((block) => block !== null)
    .join('\n');
}

function buildDataModelSection(dataModel) {
  const entities = dataModel?.entities || [];
  const summary = table(
    ['Entidad', 'Atributos', 'Referencias'],
    entities.map((entity) => [
      entity.name,
      (entity.attributes || []).length,
      (entity.attributes || [])
        .filter((attr) => attr.foreignKey)
        .map((attr) => attr.foreignKey.entity)
        .join(', '),
    ])
  );

  return section(
    '5. Modelo de datos',
    summary,
    '',
    ...entities.map((entity) => `${buildEntityBlock(entity)}\n`),
    '### Diagrama entidad-relacion',
    '',
    mermaidBlock(dataModel?.diagram, '_El diagrama no fue generado._')
  );
}

function buildEndpointBlock(endpoint) {
  const parameters = (endpoint.parameters || []).map((parameter) => [
    parameter.name,
    parameter.in,
    parameter.type,
    parameter.required === false ? 'no' : 'si',
    parameter.description,
  ]);

  const responses = (endpoint.responses || []).map((response) => [response.status, response.description]);

  return [
    `### ${endpoint.method} ${endpoint.path}`,
    '',
    paragraph(endpoint.description, '_Sin descripcion._'),
    '',
    `Entidad sobre la que opera: \`${endpoint.resourceEntity}\`.`,
    '',
    '**Parametros**',
    '',
    table(['Nombre', 'En', 'Tipo', 'Requerido', 'Descripcion'], parameters, '_Sin parametros._'),
    '',
    '**Respuestas**',
    '',
    table(['Codigo', 'Descripcion'], responses, '_Sin respuestas declaradas._'),
    '',
  ].join('\n');
}

function buildApiSection(apiSpec) {
  const endpoints = apiSpec?.endpoints || [];
  const summary = table(
    ['Metodo', 'Ruta', 'Entidad', 'Descripcion'],
    endpoints.map((endpoint) => [endpoint.method, endpoint.path, endpoint.resourceEntity, endpoint.description])
  );

  return section('6. Endpoints de la API', summary, '', ...endpoints.map((endpoint) => buildEndpointBlock(endpoint)));
}

function describeScreenElement(element) {
  const ref = element.dataField ? ` — campo \`${element.dataField}\`` : element.endpointRef ? ` — llama a \`${element.endpointRef}\`` : '';
  return `**[${element.type}]** ${element.label}${ref}`;
}

function buildScreenBlock(screen) {
  return [
    `### Pantalla: ${screen.name}`,
    '',
    paragraph(screen.purpose, '_Sin proposito declarado._'),
    '',
    `Visible para los roles: ${(screen.visibleToRoles || []).join(', ') || 'no especificado'}.`,
    '',
    '**Wireframe (baja fidelidad, texto plano)**',
    '',
    '```text',
    renderScreenWireframe(screen),
    '```',
    '',
    '**Elementos principales** (campo/endpoint real que usa cada uno, si aplica)',
    '',
    bulletList((screen.mainElements || []).map(describeScreenElement), '_Sin elementos declarados._'),
    '',
  ].join('\n');
}

function buildInterfaceSection(screenMap) {
  const screens = screenMap?.screens || [];
  const navigation = (screenMap?.navigation || []).map((edge) => [edge.from, edge.to, edge.label]);

  return section(
    '7. Interfaz de usuario',
    table(
      ['Pantalla', 'Proposito', 'Roles'],
      screens.map((screen) => [screen.name, screen.purpose, (screen.visibleToRoles || []).join(', ')])
    ),
    '',
    ...screens.map((screen) => buildScreenBlock(screen)),
    '### Navegacion entre pantallas (prototipo clicable)',
    '',
    'La navegacion de abajo es el prototipo clicable: desde cada pantalla, la accion de la columna "Accion" lleva a la pantalla de "Hacia". En la app, esto mismo se recorre en vivo sin descargar nada (modo prototipo).',
    '',
    table(['Desde', 'Hacia', 'Accion'], navigation, '_No se registraron transiciones entre pantallas._'),
    '',
    mermaidBlock(screenMap?.diagram, '_El diagrama de navegacion no fue generado._')
  );
}

function buildArchitectureSection({ architecture, catalogEntry }) {
  const selectedId = architecture?.selectedId;
  if (!selectedId) {
    return section('8. Arquitectura seleccionada', '_El proyecto todavia no tiene una arquitectura confirmada._');
  }

  return section(
    '8. Arquitectura seleccionada',
    `**${catalogEntry?.name ?? selectedId}** (\`${selectedId}\`)`,
    '',
    paragraph(catalogEntry?.summary, '_Sin resumen disponible para esta opcion del catalogo._'),
    '',
    '**Justificacion registrada**',
    '',
    paragraph(architecture?.justification, '_La opcion fue elegida sin una justificacion registrada._'),
    '',
    'El detalle tecnico completo de esta arquitectura (tecnologias, organizacion de la solucion,',
    'decisiones de base de datos, backend, frontend, autenticacion y despliegue) vive en el',
    'documento de arquitectura definitiva que acompana a esta especificacion.'
  );
}

function buildStrategySubsection(strategy) {
  const risks = (strategy?.riskPriorities || []).map((r) => [r.item, r.risk, r.rationale]);
  return [
    '### Estrategia',
    '',
    '**Dentro del alcance de pruebas**',
    '',
    bulletList(strategy?.inScope, '_No se registro que esta dentro del alcance de pruebas._'),
    '',
    '**Fuera del alcance de pruebas**',
    '',
    bulletList(strategy?.outOfScope, '_No se registro ninguna exclusion explicita._'),
    '',
    '**Riesgos priorizados**',
    '',
    table(['Item', 'Riesgo', 'Justificacion'], risks, '_No se registraron riesgos priorizados._'),
  ].join('\n');
}

function buildAcceptanceCasesSubsection(cases) {
  const rows = (cases || []).map((c) => [c.id, c.ruleRef, c.given, c.when, c.then]);
  return [
    '### Casos de aceptacion (Dado / Cuando / Entonces)',
    '',
    table(['Id', 'Regla/requisito', 'Dado', 'Cuando', 'Entonces'], rows, '_No se registraron casos de aceptacion._'),
  ].join('\n');
}

function buildEndpointCasesSubsection(cases) {
  const rows = (cases || []).map((c) => [c.endpointRef, c.happyPath, c.invalidData, c.unauthorized]);
  return [
    '### Casos por endpoint',
    '',
    table(
      ['Endpoint', 'Camino feliz', 'Datos invalidos', 'Acceso no autorizado'],
      rows,
      '_No se registraron casos por endpoint._'
    ),
  ].join('\n');
}

function buildScreenCasesSubsection(cases) {
  const rows = (cases || []).map((c) => [c.screenRef, c.loading, c.empty, c.error]);
  return [
    '### Casos por pantalla',
    '',
    table(['Pantalla', 'Estado de carga', 'Estado vacio', 'Estado de error'], rows, '_No se registraron casos por pantalla._'),
  ].join('\n');
}

function buildE2eFlowsSubsection(flows) {
  if (!flows || flows.length === 0) {
    return ['### Flujos de punta a punta', '', '_No se registraron flujos de punta a punta._'].join('\n');
  }
  const blocks = flows.map((flow) =>
    [
      `#### ${flow.name}`,
      '',
      numberedList(flow.steps),
      '',
      `Casos relacionados: ${(flow.relatedCaseIds || []).join(', ') || '(ninguno enlazado)'}`,
      '',
    ].join('\n')
  );
  return ['### Flujos de punta a punta', '', ...blocks].join('\n');
}

function buildSecurityCasesSubsection(cases) {
  const rows = (cases || []).map((c) => [c.id, c.type, c.description]);
  return [
    '### Casos de seguridad',
    '',
    table(['Id', 'Tipo', 'Descripcion'], rows, '_No se registraron casos de seguridad._'),
  ].join('\n');
}

function buildNegativeCasesSubsection(cases) {
  const rows = (cases || []).map((c) => [c.id, c.description, c.expectedRejection]);
  return [
    '### Casos negativos (lo que el sistema debe rechazar)',
    '',
    table(['Id', 'Descripcion', 'Rechazo esperado'], rows, '_No se registraron casos negativos._'),
  ].join('\n');
}

function buildUsabilitySubsection(cases) {
  const rows = (cases || []).map((c) => [c.id, c.description]);
  return [
    '### Usabilidad y accesibilidad basica',
    '',
    table(['Id', 'Descripcion'], rows, '_No se registraron casos de usabilidad/accesibilidad._'),
  ].join('\n');
}

function buildTestDataSubsection(testData) {
  const rows = (testData || []).map((d) => [d.entity, d.environment, d.description]);
  return [
    '### Datos de prueba necesarios',
    '',
    table(['Entidad', 'Entorno', 'Descripcion'], rows, '_No se registraron necesidades de datos de prueba._'),
  ].join('\n');
}

function buildTraceabilityMatrixSubsection(matrix) {
  const rows = (matrix || []).map((entry) => [entry.requirementRef, (entry.caseIds || []).join(', ')]);
  return [
    '### Matriz de trazabilidad',
    '',
    table(['Requisito / regla', 'Casos que lo prueban'], rows, '_No se registro matriz de trazabilidad._'),
  ].join('\n');
}

function buildTestPlanSection(testPlan) {
  if (!testPlan) {
    return section('9. Plan de pruebas', '_El proyecto todavia no tiene un plan de pruebas aprobado._');
  }
  return section(
    '9. Plan de pruebas',
    'Tipos de prueba: unitarias para las reglas de negocio, de integracion para la API contra la base',
    'de datos, y de punta a punta para los recorridos de usuario descriptos abajo.',
    '',
    buildStrategySubsection(testPlan.strategy),
    buildAcceptanceCasesSubsection(testPlan.acceptanceCases),
    buildEndpointCasesSubsection(testPlan.endpointCases),
    buildScreenCasesSubsection(testPlan.screenCases),
    buildE2eFlowsSubsection(testPlan.e2eFlows),
    buildSecurityCasesSubsection(testPlan.securityCases),
    buildNegativeCasesSubsection(testPlan.negativeCases),
    buildUsabilitySubsection(testPlan.usabilityCases),
    buildTestDataSubsection(testPlan.testData),
    buildTraceabilityMatrixSubsection(testPlan.traceabilityMatrix)
  );
}

function buildSeedDataEntityBlock({ name, attributes, records }) {
  const rows = records.map((record) => attributes.map((attribute) => record[attribute]));
  return [`### ${name}`, '', table(attributes, rows), ''].join('\n');
}

/**
 * Datos de ejemplo ("quemados") derivados del modelo de datos aprobado:
 * pedido explicito para que la otra IA tenga, desde el arranque, con que
 * probar el flujo sin tener que inventar sus propios datos. Se generan por
 * codigo (ver data-model/seedData.js), nunca por IA, para no agregar una
 * llamada mas al tiempo total del flujo.
 */
function buildSeedDataSection(dataModel) {
  const entities = dataModel?.entities || [];
  if (entities.length === 0) {
    return section('10. Datos de ejemplo', '_El proyecto todavia no tiene un modelo de datos aprobado._');
  }

  const seedData = generateSeedData(entities);
  return section(
    '10. Datos de ejemplo',
    'Registros sugeridos, coherentes con el modelo de datos y sus relaciones (las claves foraneas apuntan a registros reales de la tabla referenciada). Son un punto de partida para probar el flujo, no datos reales.',
    '',
    ...seedData.map(buildSeedDataEntityBlock)
  );
}

/**
 * @param {object} context estado aprobado del proyecto + metadatos del documento
 * @returns {string} el documento Markdown completo
 */
function buildSpecDocument({
  project,
  definition,
  dataModel,
  apiSpec,
  screenMap,
  architecture,
  catalogEntry,
  testPlan,
  versionNumber,
  generatedAt,
}) {
  return [
    buildHeader({ project, versionNumber, generatedAt, dataModel, apiSpec }),
    buildProblemSection(definition),
    buildUsersSection(definition),
    buildScopeSection(definition),
    buildBusinessRulesSection({ definition, dataModel, apiSpec }),
    buildDataModelSection(dataModel),
    buildApiSection(apiSpec),
    buildInterfaceSection(screenMap),
    buildArchitectureSection({ architecture, catalogEntry }),
    buildTestPlanSection(testPlan),
    buildSeedDataSection(dataModel),
  ].join('\n');
}

module.exports = { buildSpecDocument, deriveBusinessRules };
