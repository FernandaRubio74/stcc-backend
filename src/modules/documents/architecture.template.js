/**
 * T-036.1 - Plantilla del documento de arquitectura definitiva (US-036).
 *
 * Mismo criterio que spec.template.js: generador DETERMINISTA, sin IA.
 *
 * La fuente de verdad de las tecnologias es el catalogo de arquitecturas
 * (architecture/catalog.js) mas el `selectedId` que el owner confirmo en
 * US-028/US-030. Eso es lo que hace al documento coherente por construccion
 * con la arquitectura elegida: no se describe una arquitectura "parecida",
 * se transcribe la que quedo seleccionada.
 *
 * La organizacion de la solucion se deriva del modelo de datos y de la API ya
 * aprobados (un modulo por entidad con endpoints), para que la IA externa
 * sepa como repartir el codigo sin tener que inventarlo.
 */

const EMPTY = '_No se registro informacion para esta seccion._';

function cell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function table(headers, rows, emptyText = EMPTY) {
  if (!rows || rows.length === 0) return emptyText;
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function bulletList(items, emptyText = EMPTY) {
  const list = (items || []).filter((item) => String(item ?? '').trim().length > 0);
  if (list.length === 0) return emptyText;
  return list.map((item) => `- ${String(item).trim()}`).join('\n');
}

function paragraph(text, emptyText = EMPTY) {
  const value = String(text ?? '').trim();
  return value.length > 0 ? value : emptyText;
}

function section(title, ...blocks) {
  return [`## ${title}`, '', ...blocks.filter((block) => block !== null && block !== undefined), ''].join('\n');
}

function buildHeader({ project, versionNumber, generatedAt, architecture, catalogEntry }) {
  const meta = table(
    ['Dato', 'Valor'],
    [
      ['Documento', `Arquitectura definitiva v${versionNumber}`],
      ['Proyecto', project?.name ?? '(sin nombre)'],
      ['Generado', generatedAt.toISOString()],
      ['Arquitectura confirmada', catalogEntry?.name ?? architecture?.selectedId ?? '-'],
    ]
  );

  return [
    `# Arquitectura definitiva — ${project?.name ?? 'Proyecto'}`,
    '',
    meta,
    '',
    'Complementa el documento de especificacion del producto con el detalle tecnico de',
    'implementacion. Describe la arquitectura que quedo confirmada en el proyecto, no una',
    'propuesta alternativa.',
    '',
  ].join('\n');
}

function buildSelectionSection({ architecture, catalogEntry }) {
  const selectedId = architecture?.selectedId;
  const eligioLaRecomendada = architecture?.recommendedId && architecture.recommendedId === selectedId;

  return section(
    '1. Arquitectura seleccionada',
    `**${catalogEntry?.name ?? selectedId ?? '(sin arquitectura confirmada)'}** (\`${selectedId ?? '-'}\`)`,
    '',
    paragraph(catalogEntry?.summary, '_Sin resumen disponible para esta opcion del catalogo._'),
    '',
    '**Justificacion registrada**',
    '',
    paragraph(architecture?.justification, '_La opcion fue elegida sin una justificacion registrada._'),
    '',
    eligioLaRecomendada
      ? 'La opcion confirmada coincide con la que el analisis del proyecto habia recomendado.'
      : architecture?.recommendedId
        ? `La recomendacion inicial habia sido \`${architecture.recommendedId}\`; el owner confirmo explicitamente \`${selectedId}\`.`
        : 'La opcion fue confirmada por el owner sin una recomendacion previa registrada.'
  );
}

function buildTechnologiesSection(catalogEntry) {
  const rows = [
    ['Persistencia', catalogEntry?.persistence],
    ['Backend', catalogEntry?.backend],
    ['Frontend', catalogEntry?.frontend],
    ['Comunicacion', catalogEntry?.communication],
    ['Infraestructura', catalogEntry?.infrastructure],
    ['Operacion', catalogEntry?.operation],
    ['Observabilidad', catalogEntry?.observability],
    ['Autenticacion / SSO / Autorizacion', catalogEntry?.authSsoAuthorization],
  ].filter(([, value]) => String(value ?? '').trim().length > 0);

  return section('2. Tecnologias seleccionadas', table(['Dimension', 'Definicion'], rows));
}

function buildSolutionLayoutSection({ dataModel, apiSpec, screenMap }) {
  const entities = dataModel?.entities || [];
  const endpoints = apiSpec?.endpoints || [];

  const modules = entities.map((entity) => {
    const propios = endpoints.filter((endpoint) => endpoint.resourceEntity === entity.name);
    return [
      entity.name,
      `${(entity.attributes || []).length} atributos`,
      propios.length > 0 ? propios.map((endpoint) => `${endpoint.method} ${endpoint.path}`).join('; ') : 'sin endpoints propios',
    ];
  });

  const huerfanos = endpoints
    .filter((endpoint) => !entities.some((entity) => entity.name === endpoint.resourceEntity))
    .map((endpoint) => `${endpoint.method} ${endpoint.path} (entidad "${endpoint.resourceEntity}")`);

  return section(
    '3. Organizacion de la solucion',
    'Un modulo de dominio por entidad del modelo aprobado, con los endpoints que operan sobre ella:',
    '',
    table(['Modulo / entidad', 'Tamano', 'Endpoints'], modules),
    '',
    `El frontend consume esa API y se organiza en ${(screenMap?.screens || []).length} pantallas (ver el documento de especificacion).`,
    '',
    huerfanos.length > 0
      ? ['**Atencion**: hay endpoints que referencian entidades inexistentes:', '', bulletList(huerfanos), ''].join('\n')
      : null
  );
}

function buildDatabaseSection({ catalogEntry, dataModel }) {
  const entities = dataModel?.entities || [];
  const conIndicesUnicos = entities.filter((entity) => (entity.indexes || []).some((index) => index.unique));
  const conFks = entities.filter((entity) => (entity.attributes || []).some((attr) => attr.foreignKey));

  return section(
    '4. Decisiones de base de datos',
    paragraph(catalogEntry?.persistence),
    '',
    bulletList([
      `El modelo aprobado (v${dataModel?.versionNumber ?? '-'}) define ${entities.length} entidades.`,
      `${conFks.length} entidades tienen claves foraneas: la integridad referencial se declara en el schema, no solo en la aplicacion.`,
      conIndicesUnicos.length > 0
        ? `${conIndicesUnicos.length} entidades tienen indices unicos (${conIndicesUnicos
            .map((entity) => entity.name)
            .join(', ')}): son invariantes que deben imponerse en la base, no solo validarse en codigo.`
        : 'Ninguna entidad declara indices unicos compuestos.',
      'Las migraciones se versionan y se aplican de forma explicita (nunca de forma automatica al arrancar el servicio).',
    ])
  );
}

function buildBackendFrontendSection({ catalogEntry, apiSpec, screenMap }) {
  const endpoints = apiSpec?.endpoints || [];
  const metodos = [...new Set(endpoints.map((endpoint) => endpoint.method))].sort();

  return section(
    '5. Decisiones de backend y frontend',
    '### Backend',
    '',
    paragraph(catalogEntry?.backend),
    '',
    bulletList([
      `La API aprobada (v${apiSpec?.versionNumber ?? '-'}) expone ${endpoints.length} endpoints (${metodos.join(', ') || 'sin metodos'}).`,
      'Separacion por capas dentro de cada modulo: rutas, controlador, servicio y validacion de entrada.',
      'La validacion de entrada se hace en el borde (schemas), antes de llegar al servicio.',
    ]),
    '',
    '### Frontend',
    '',
    paragraph(catalogEntry?.frontend),
    '',
    bulletList([
      `${(screenMap?.screens || []).length} pantallas con navegacion definida (ver documento de especificacion).`,
      'Estado de servidor manejado con cache de consultas; el estado de UI queda local al componente.',
      'Los componentes presentacionales se mantienen separados de los contenedores que hacen las llamadas.',
    ]),
    '',
    '### Comunicacion',
    '',
    paragraph(catalogEntry?.communication)
  );
}

function buildAuthSection({ catalogEntry, apiSpec }) {
  const endpoints = apiSpec?.endpoints || [];
  const statuses = (endpoint) => (endpoint.responses || []).map((response) => response.status);
  const conAutenticacion = endpoints.filter((endpoint) => statuses(endpoint).includes(401)).length;
  const conAutorizacion = endpoints.filter((endpoint) => statuses(endpoint).includes(403));

  return section(
    '6. Autenticacion y autorizacion',
    paragraph(catalogEntry?.authSsoAuthorization),
    '',
    bulletList([
      `${conAutenticacion} de ${endpoints.length} endpoints declaran 401: requieren sesion valida.`,
      conAutorizacion.length > 0
        ? `${conAutorizacion.length} endpoints declaran ademas 403 (restriccion por rol): ${conAutorizacion
            .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
            .join(', ')}.`
        : 'Ningun endpoint declara restricciones por rol (403).',
      'Autenticacion (401) y autorizacion (403) se responden con codigos distintos: nunca se combinan en uno.',
      'El acceso a los recursos de un proyecto se resuelve siempre por membresia, nunca asumiendo que el cliente ya filtro.',
    ])
  );
}

function buildDeploymentSection(catalogEntry) {
  return section(
    '7. Despliegue y entornos',
    paragraph(catalogEntry?.infrastructure),
    '',
    '**Operacion y observabilidad**',
    '',
    paragraph(catalogEntry?.operation),
    '',
    paragraph(catalogEntry?.observability),
    '',
    '**Entornos y configuracion**',
    '',
    bulletList([
      'Backend, frontend y base de datos se levantan en contenedores, con un solo comando para el entorno completo.',
      'Toda configuracion sensible se inyecta por variables de entorno; nunca se commitea.',
      'Cada variable requerida esta documentada en el archivo de ejemplo del repositorio.',
      'Las migraciones de base de datos se ejecutan como paso explicito del despliegue.',
    ])
  );
}

/**
 * @param {object} context arquitectura confirmada + estado aprobado + metadatos
 * @returns {string} el documento Markdown completo
 */
function buildArchitectureDocument({
  project,
  architecture,
  catalogEntry,
  dataModel,
  apiSpec,
  screenMap,
  versionNumber,
  generatedAt,
}) {
  return [
    buildHeader({ project, versionNumber, generatedAt, architecture, catalogEntry }),
    buildSelectionSection({ architecture, catalogEntry }),
    buildTechnologiesSection(catalogEntry),
    buildSolutionLayoutSection({ dataModel, apiSpec, screenMap }),
    buildDatabaseSection({ catalogEntry, dataModel }),
    buildBackendFrontendSection({ catalogEntry, apiSpec, screenMap }),
    buildAuthSection({ catalogEntry, apiSpec }),
    buildDeploymentSection(catalogEntry),
  ].join('\n');
}

module.exports = { buildArchitectureDocument };
