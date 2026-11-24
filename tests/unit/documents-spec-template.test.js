/**
 * T-035.4 - Tests de la plantilla del documento de especificacion: secciones
 * obligatorias del DoD, autocontencion y determinismo.
 */
const { buildSpecDocument } = require('../../src/modules/documents/spec.template');

const CONTEXT = {
  project: { name: 'Reservas de canchas', description: 'App para publicar y reservar canchas' },
  definition: {
    problemSummary: 'Los duenos coordinan reservas por WhatsApp y se producen dobles reservas del mismo horario.',
    targetUsers: [
      { label: 'Dueno de cancha', description: 'Publica sus canchas y los horarios disponibles' },
      { label: 'Jugador', description: 'Busca una cancha y reserva un horario' },
    ],
    mvpScope: { in: ['Publicar canchas', 'Reservar un horario'], out: ['Pagos online'] },
    userJourney: ['El jugador abre el listado', 'Elige un horario libre', 'Confirma la reserva'],
  },
  dataModel: {
    versionNumber: 2,
    entities: [
      {
        name: 'Cancha',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
          { name: 'nombre', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null },
          {
            name: 'duenoId',
            type: 'uuid',
            primaryKey: false,
            unique: false,
            nullable: false,
            foreignKey: { entity: 'Dueno', attribute: 'id' },
          },
        ],
        indexes: [],
      },
      {
        name: 'Reserva',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
          {
            name: 'canchaId',
            type: 'uuid',
            primaryKey: false,
            unique: false,
            nullable: false,
            foreignKey: { entity: 'Cancha', attribute: 'id' },
          },
          { name: 'inicio', type: 'timestamp', primaryKey: false, unique: false, nullable: false, foreignKey: null },
          { name: 'codigo', type: 'string', primaryKey: false, unique: true, nullable: true, foreignKey: null },
        ],
        indexes: [{ name: 'uq_reserva_slot', attributes: ['canchaId', 'inicio'], unique: true }],
      },
    ],
    diagram: 'erDiagram\n  CANCHA ||--o{ RESERVA : tiene',
  },
  apiSpec: {
    versionNumber: 3,
    endpoints: [
      {
        method: 'GET',
        path: '/canchas',
        description: 'Lista las canchas publicadas',
        resourceEntity: 'Cancha',
        parameters: [{ name: 'fecha', in: 'query', type: 'string', required: false, description: 'Filtra por fecha' }],
        responses: [
          { status: 200, description: 'ok' },
          { status: 401, description: 'no autenticado' },
        ],
      },
      {
        method: 'POST',
        path: '/canchas',
        description: 'Crea una cancha',
        resourceEntity: 'Cancha',
        parameters: [],
        responses: [
          { status: 201, description: 'creada' },
          { status: 401, description: 'no autenticado' },
          { status: 403, description: 'no autorizado' },
        ],
      },
    ],
  },
  screenMap: {
    screens: [
      {
        name: 'Listado de canchas',
        purpose: 'Mostrar las canchas disponibles',
        mainElements: [
          { type: 'list', label: 'Lista de canchas', dataField: 'Cancha.nombre', endpointRef: 'GET /canchas' },
          { type: 'button', label: 'Boton ver detalle', dataField: null, endpointRef: null },
        ],
        visibleToRoles: ['viewer', 'owner'],
      },
      {
        name: 'Reserva',
        purpose: 'Confirmar un horario',
        mainElements: [{ type: 'form', label: 'Formulario', dataField: null, endpointRef: 'POST /canchas' }],
        visibleToRoles: ['viewer'],
      },
    ],
    navigation: [{ from: 'Listado de canchas', to: 'Reserva', label: 'Elegir horario' }],
    diagram: 'flowchart TD\n  Listado --> Reserva',
  },
  architecture: { selectedId: 'monolito-modular', justification: 'Dominio chico y consistencia transaccional.' },
  catalogEntry: {
    id: 'monolito-modular',
    name: 'Monolito modular (Node.js + Express + PostgreSQL)',
    summary: 'Aplicacion unica organizada por modulos de dominio.',
  },
  testPlan: {
    strategy: {
      inScope: ['Publicar canchas', 'Reservar un horario'],
      outOfScope: ['Pruebas de carga'],
      riskPriorities: [{ item: 'Reservar un horario', risk: 'alto', rationale: 'evita dobles reservas' }],
    },
    acceptanceCases: [
      { id: 'AC-1', ruleRef: 'Reservar un horario', given: 'una cancha con horario libre', when: 'el jugador confirma la reserva', then: 'el horario queda reservado' },
    ],
    endpointCases: [
      { endpointRef: 'GET /canchas', happyPath: 'devuelve 200 con el listado', invalidData: 'ignora una fecha con formato invalido', unauthorized: 'devuelve 401 sin token' },
      { endpointRef: 'POST /canchas', happyPath: 'crea la cancha y devuelve 201', invalidData: 'devuelve 400 sin nombre', unauthorized: 'devuelve 403 si no es dueno' },
    ],
    screenCases: [
      { screenRef: 'Listado de canchas', loading: 'muestra spinner', empty: 'muestra "sin canchas"', error: 'muestra mensaje de error' },
      { screenRef: 'Reserva', loading: 'muestra spinner', empty: 'no aplica (siempre hay un horario elegido)', error: 'muestra mensaje de error' },
    ],
    e2eFlows: [{ name: 'Reservar una cancha', steps: ['Abre el listado', 'Elige un horario', 'Confirma'], relatedCaseIds: ['AC-1'] }],
    securityCases: [
      { id: 'SEC-1', description: 'un jugador no puede publicar canchas', type: 'permisos' },
      { id: 'SEC-2', description: 'acceder a la reserva de otro jugador adivinando el id', type: 'id-adivinado' },
      { id: 'SEC-3', description: 'request con token vencido', type: 'token-vencido' },
    ],
    negativeCases: [{ id: 'NEG-1', description: 'reservar un horario ya tomado', expectedRejection: '409 por conflicto de horario' }],
    usabilityCases: [{ id: 'UX-1', description: 'el boton de confirmar reserva tiene foco visible' }],
    testData: [{ entity: 'Cancha', environment: 'desarrollo', description: '5 a 10 canchas con horarios variados' }],
    traceabilityMatrix: [
      { requirementRef: 'Publicar canchas', caseIds: ['AC-1'] },
      { requirementRef: 'Reservar un horario', caseIds: ['AC-1'] },
    ],
  },
  versionNumber: 1,
  generatedAt: new Date('2026-11-15T12:00:00.000Z'),
};

describe('buildSpecDocument', () => {
  test('incluye las 10 secciones obligatorias del DoD', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('## 1. Problema y contexto');
    expect(doc).toContain('## 2. Usuarios objetivo');
    expect(doc).toContain('## 3. Alcance del MVP');
    expect(doc).toContain('## 4. Reglas de negocio y recorrido principal');
    expect(doc).toContain('## 5. Modelo de datos');
    expect(doc).toContain('## 6. Endpoints de la API');
    expect(doc).toContain('## 7. Interfaz de usuario');
    expect(doc).toContain('## 8. Arquitectura seleccionada');
    expect(doc).toContain('## 9. Plan de pruebas');
    expect(doc).toContain('## 10. Datos de ejemplo');
  });

  test('genera datos de ejemplo por entidad, coherentes con las relaciones del modelo', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('### Cancha');
    expect(doc).toContain('### Reserva');
    // Las FK de los registros de ejemplo de Reserva apuntan a canchas reales generadas para Cancha.
    expect(doc).toContain('cancha-1');
  });

  test('documenta el plan de pruebas: estrategia, casos por endpoint/pantalla, seguridad y trazabilidad', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('### Estrategia');
    expect(doc).toContain('Publicar canchas');
    expect(doc).toContain('### Casos de aceptacion (Dado / Cuando / Entonces)');
    expect(doc).toContain('una cancha con horario libre');
    expect(doc).toContain('### Casos por endpoint');
    expect(doc).toContain('GET /canchas');
    expect(doc).toContain('### Casos por pantalla');
    expect(doc).toContain('Listado de canchas');
    expect(doc).toContain('### Flujos de punta a punta');
    expect(doc).toContain('Reservar una cancha');
    expect(doc).toContain('### Casos de seguridad');
    expect(doc).toContain('id-adivinado');
    expect(doc).toContain('### Casos negativos');
    expect(doc).toContain('409 por conflicto de horario');
    expect(doc).toContain('### Usabilidad y accesibilidad basica');
    expect(doc).toContain('### Datos de prueba necesarios');
    expect(doc).toContain('### Matriz de trazabilidad');
    expect(doc).toContain('Reservar un horario');
  });

  test('incluye el problema, los usuarios objetivo y el alcance del MVP', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('dobles reservas del mismo horario');
    expect(doc).toContain('Dueno de cancha');
    expect(doc).toContain('Jugador');
    expect(doc).toContain('Publicar canchas');
    expect(doc).toContain('Pagos online');
  });

  test('documenta todas las entidades con sus atributos y el diagrama ER', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('### Entidad: Cancha');
    expect(doc).toContain('### Entidad: Reserva');
    expect(doc).toContain('duenoId');
    expect(doc).toContain('Dueno.id');
    expect(doc).toContain('uq_reserva_slot');
    expect(doc).toContain('```mermaid');
    expect(doc).toContain('erDiagram');
  });

  test('documenta todos los endpoints con sus parametros y respuestas', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('### GET /canchas');
    expect(doc).toContain('### POST /canchas');
    expect(doc).toContain('fecha');
    expect(doc).toContain('| 401 | no autenticado |');
    expect(doc).toContain('| 403 | no autorizado |');
  });

  test('documenta todas las pantallas y la navegacion entre ellas', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('### Pantalla: Listado de canchas');
    expect(doc).toContain('### Pantalla: Reserva');
    expect(doc).toContain('Elegir horario');
    expect(doc).toContain('flowchart TD');
  });

  test('deriva reglas de negocio de las restricciones del modelo y de los permisos de la API', () => {
    const doc = buildSpecDocument(CONTEXT);

    // Indice unico: es la regla que impide la doble reserva del mismo horario.
    expect(doc).toContain('La combinacion (canchaId, inicio) debe ser unica en "Reserva".');
    expect(doc).toContain('En "Cancha" son obligatorios: nombre, duenoId.');
    expect(doc).toContain('En "Reserva" no puede haber dos registros con el mismo valor de: codigo.');
    expect(doc).toContain('Cada "Reserva" referencia un "Cancha" existente (Reserva.canchaId -> Cancha.id).');
    expect(doc).toContain('Todas las operaciones de la API requieren autenticacion');
    expect(doc).toContain('La operacion POST /canchas esta restringida por rol o permiso');
    expect(doc).toContain('Queda fuera del alcance del MVP y no debe implementarse: Pagos online.');
  });

  test('incluye la arquitectura confirmada con su justificacion', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).toContain('Monolito modular (Node.js + Express + PostgreSQL)');
    expect(doc).toContain('monolito-modular');
    expect(doc).toContain('Dominio chico y consistencia transaccional.');
  });

  test('es autocontenido: con el proyecto completo no deja ninguna seccion sin informacion', () => {
    const doc = buildSpecDocument(CONTEXT);

    expect(doc).not.toContain('_No se registro');
    expect(doc).not.toContain('_No se registraron');
    expect(doc).not.toContain('_Sin descripcion._');
    expect(doc).not.toContain('_El diagrama');
  });

  test('es deterministico: el mismo estado produce exactamente el mismo documento', () => {
    expect(buildSpecDocument(CONTEXT)).toBe(buildSpecDocument(CONTEXT));
  });

  test('escapa los pipes del contenido para no romper las tablas Markdown', () => {
    const doc = buildSpecDocument({
      ...CONTEXT,
      apiSpec: {
        ...CONTEXT.apiSpec,
        endpoints: [
          {
            ...CONTEXT.apiSpec.endpoints[0],
            description: 'Lista canchas | ordenadas por nombre',
          },
        ],
      },
    });

    expect(doc).toContain('Lista canchas \\| ordenadas por nombre');
  });

  test('deja constancia explicita en lugar de omitir una seccion sin datos', () => {
    const doc = buildSpecDocument({
      ...CONTEXT,
      definition: { problemSummary: null, targetUsers: [], mvpScope: {}, userJourney: [] },
      architecture: { selectedId: null, justification: null },
      catalogEntry: null,
    });

    expect(doc).toContain('## 1. Problema y contexto');
    expect(doc).toContain('## 2. Usuarios objetivo');
    expect(doc).toContain('## 8. Arquitectura seleccionada');
    expect(doc).toContain('_El problema y el contexto no quedaron registrados._');
    expect(doc).toContain('_El proyecto todavia no tiene una arquitectura confirmada._');
  });
});
