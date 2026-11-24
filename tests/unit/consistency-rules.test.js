/**
 * T-031.4 - Tests de cada regla de validacion cruzada de forma aislada.
 *
 * Caso base: el servicio de courier de la revision transversal. Actores:
 * "revisador" y "supervisor". Los clientes que envian paquetes NO usan la
 * plataforma. Fuera del MVP: pagos en linea, rastreo, aduana.
 */
const {
  STATUS,
  checkEntitiesCoverage,
  checkActorsCoverage,
  checkMvpScopeDrift,
  evaluateRules,
  runAllRules,
  artifactPresence,
} = require('../../src/modules/consistency/rules');

const COURIER_DEFINITION = {
  problemSummary: 'Servicio de courier: se clasifican, pesan y etiquetan paquetes',
  targetUsers: [
    { label: 'Revisador', description: 'Clasifica paquetes, lista productos, pesa y emite etiqueta' },
    { label: 'Supervisor', description: 'Revisa, corrige y consulta historial por destinatario' },
  ],
  mvpScope: {
    in: ['Clasificar paquetes en secos y humedos', 'Emitir etiqueta con correlativo por destinatario'],
    out: ['Pagos en linea', 'Rastreo de paquetes', 'Gestion de aduana'],
  },
  userJourney: ['El revisador clasifica el paquete', 'El supervisor revisa'],
};

// Modelo valido del caso courier: un solo campo de rol, SIN entidad "Cliente".
const COURIER_DATA_MODEL = {
  entities: [
    {
      name: 'Usuario',
      attributes: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'rol', type: 'enum: revisador | supervisor' },
      ],
    },
    {
      name: 'Paquete',
      attributes: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'tipo', type: 'enum: seco | humedo' },
        { name: 'peso', type: 'decimal' },
      ],
    },
  ],
};

const COURIER_API_SPEC = {
  endpoints: [
    {
      method: 'GET',
      path: '/paquetes',
      description: 'Lista paquetes clasificados',
      resourceEntity: 'Paquete',
      parameters: [],
      responses: [{ status: 200, description: 'ok' }, { status: 401, description: 'No autenticado' }],
    },
  ],
};

const COURIER_SCREEN_MAP = {
  screens: [
    {
      name: 'ClasificacionScreen',
      purpose: 'Clasificar paquetes en secos y humedos',
      mainElements: [{ type: 'list', label: 'Paquetes pendientes', dataField: 'Paquete.tipo', endpointRef: 'GET /paquetes' }],
      visibleToRoles: ['owner', 'editor'],
    },
    {
      name: 'HistorialScreen',
      purpose: 'Consultar historial por destinatario',
      mainElements: [{ type: 'list', label: 'Historial', dataField: 'Paquete.id', endpointRef: 'GET /paquetes' }],
      visibleToRoles: ['owner'],
    },
  ],
};

const FULL_COURIER_CONTEXT = {
  definition: COURIER_DEFINITION,
  dataModel: COURIER_DATA_MODEL,
  apiSpec: COURIER_API_SPEC,
  screenMap: COURIER_SCREEN_MAP,
};

describe('artifactPresence', () => {
  test('la definicion cuenta como existente solo con sus datos estructurados', () => {
    expect(artifactPresence({ definition: COURIER_DEFINITION }).definition).toBe(true);
    expect(artifactPresence({ definition: { problemSummary: 'solo texto' } }).definition).toBe(false);
    expect(artifactPresence({}).definition).toBe(false);
  });
});

describe('checkEntitiesCoverage', () => {
  test('no reporta nada si falta el modelo de datos o la api (todavia no hay nada aprobado)', () => {
    expect(checkEntitiesCoverage({ dataModel: null, apiSpec: COURIER_API_SPEC })).toEqual([]);
    expect(checkEntitiesCoverage({ dataModel: COURIER_DATA_MODEL, apiSpec: null })).toEqual([]);
  });

  test('no reporta nada si todos los endpoints referencian entidades existentes', () => {
    expect(checkEntitiesCoverage({ dataModel: COURIER_DATA_MODEL, apiSpec: COURIER_API_SPEC })).toEqual([]);
  });

  // Prueba obligatoria 3: entidad de datos realmente ausente -> hallazgo real.
  test('reporta un error estructural por cada endpoint que referencia una entidad inexistente', () => {
    const modelSinPaquete = { entities: [{ name: 'Usuario', attributes: [{ name: 'id', type: 'uuid' }] }] };
    const issues = checkEntitiesCoverage({ dataModel: modelSinPaquete, apiSpec: COURIER_API_SPEC });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: 'entities-coverage',
      stages: ['data-model', 'api-spec'],
      status: STATUS.ERROR,
    });
    expect(issues[0].message).toContain('Paquete');
    expect(issues[0].id).toBe('entities-coverage:GET /paquetes:Paquete');
    expect(issues[0].evidence).toContain('GET /paquetes');
    expect(issues[0].suggestion).toContain('Paquete');
  });

  test('el id del hallazgo es estable entre corridas (no se recrea distinto)', () => {
    const modelSinPaquete = { entities: [{ name: 'Usuario', attributes: [{ name: 'id', type: 'uuid' }] }] };
    const first = checkEntitiesCoverage({ dataModel: modelSinPaquete, apiSpec: COURIER_API_SPEC });
    const second = checkEntitiesCoverage({ dataModel: modelSinPaquete, apiSpec: COURIER_API_SPEC });

    expect(first[0].id).toBe(second[0].id);
  });
});

describe('checkActorsCoverage (roles y actores no son entidades)', () => {
  // Prueba obligatoria 2: modelo sin entidad "Cliente" pero con rol como
  // campo -> cero hallazgos por roles.
  test('un rol modelado como campo enum alcanza: no exige entidad por actor', () => {
    expect(checkActorsCoverage(FULL_COURIER_CONTEXT)).toEqual([]);
  });

  test('tampoco exige nada si hay un solo tipo de usuario', () => {
    const definition = { targetUsers: [{ label: 'Fanáticos de la música', description: 'x' }] };
    expect(checkActorsCoverage({ definition, dataModel: { entities: [] }, apiSpec: { endpoints: [] }, screenMap: { screens: [] } })).toEqual([]);
  });

  test('alcanza con que la API declare autorizacion (403) aunque el modelo no tenga campo de rol', () => {
    const issues = checkActorsCoverage({
      definition: COURIER_DEFINITION,
      dataModel: { entities: [{ name: 'Paquete', attributes: [{ name: 'id', type: 'uuid' }] }] },
      apiSpec: {
        endpoints: [
          {
            method: 'DELETE',
            path: '/paquetes/:id',
            resourceEntity: 'Paquete',
            responses: [{ status: 403, description: 'No autorizado' }],
          },
        ],
      },
      screenMap: { screens: [{ name: 'A', visibleToRoles: ['owner'] }] },
    });

    expect(issues).toEqual([]);
  });

  test('alcanza con que las pantallas diferencien por rol', () => {
    const issues = checkActorsCoverage({
      definition: COURIER_DEFINITION,
      dataModel: { entities: [{ name: 'Paquete', attributes: [{ name: 'id', type: 'uuid' }] }] },
      apiSpec: { endpoints: [] },
      screenMap: COURIER_SCREEN_MAP,
    });

    expect(issues).toEqual([]);
  });

  test('si NADA diferencia a los actores, es advertencia (no error) y no pide una entidad', () => {
    const issues = checkActorsCoverage({
      definition: COURIER_DEFINITION,
      dataModel: { entities: [{ name: 'Paquete', attributes: [{ name: 'id', type: 'uuid' }] }] },
      apiSpec: { endpoints: [{ method: 'GET', path: '/paquetes', resourceEntity: 'Paquete', responses: [{ status: 200, description: 'ok' }] }] },
      screenMap: { screens: [{ name: 'A', visibleToRoles: ['owner'] }, { name: 'B', visibleToRoles: ['owner'] }] },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].status).toBe(STATUS.ADVERTENCIA);
    expect(issues[0].rule).toBe('actors-coverage');
    expect(issues[0].message).not.toContain('entidad');
  });
});

describe('checkMvpScopeDrift', () => {
  test('no reporta nada si no hay funcionalidades fuera de scope', () => {
    expect(checkMvpScopeDrift({ definition: { mvpScope: { out: [] } } })).toEqual([]);
  });

  // Prueba obligatoria 4: elemento fuera del alcance -> sin hallazgo.
  test('no reporta nada si lo que esta fuera del alcance no aparece en ningun artefacto', () => {
    expect(checkMvpScopeDrift(FULL_COURIER_CONTEXT)).toEqual([]);
  });

  test('reporta un error cuando un endpoint implementa algo fuera del alcance', () => {
    const issues = checkMvpScopeDrift({
      definition: COURIER_DEFINITION,
      apiSpec: {
        endpoints: [
          {
            method: 'POST',
            path: '/pagos',
            description: 'Procesa pagos en linea con tarjeta',
            resourceEntity: 'Pago',
            responses: [{ status: 201, description: 'ok' }],
          },
        ],
      },
      screenMap: COURIER_SCREEN_MAP,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].status).toBe(STATUS.ERROR);
    expect(issues[0].stages).toEqual(['definition', 'api-spec']);
    expect(issues[0].evidence).toContain('POST /pagos');
  });

  test('reporta un error cuando una pantalla implementa algo fuera del alcance', () => {
    const issues = checkMvpScopeDrift({
      definition: COURIER_DEFINITION,
      apiSpec: { endpoints: [] },
      screenMap: { screens: [{ name: 'RastreoScreen', purpose: 'Rastreo de paquetes en tiempo real', mainElements: [], visibleToRoles: ['owner'] }] },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].stages).toEqual(['definition', 'screens']);
  });

  // Falso positivo que estaba documentado en el codigo como limitacion
  // conocida: el haystack global juntaba toda la API y todas las pantallas,
  // asi que dos artefactos legitimos y distintos podian, entre los dos,
  // contener todas las palabras de una exclusion que ninguno implementaba.
  test('no reporta fuga cuando las palabras de la exclusion estan repartidas entre artefactos distintos', () => {
    const definition = { mvpScope: { out: ['Rastreo de aduana'] } };
    const issues = checkMvpScopeDrift({
      definition,
      apiSpec: {
        endpoints: [{ method: 'GET', path: '/rastreo-interno', description: 'Rastreo del estado interno del paquete', resourceEntity: 'Paquete', responses: [] }],
      },
      screenMap: { screens: [{ name: 'AduanaInfoScreen', purpose: 'Informacion de aduana para el operador', mainElements: [], visibleToRoles: ['owner'] }] },
    });

    expect(issues).toEqual([]);
  });
});

describe('evaluateRules (gate por etapa, regla A)', () => {
  // Prueba obligatoria 1: definicion completa sin modelo de datos -> cero
  // errores, reglas en estado pendiente.
  test('con solo la definicion lista, ninguna regla da error: todas quedan pendientes', () => {
    const { findings, checks } = evaluateRules({ definition: COURIER_DEFINITION });

    expect(findings).toEqual([]);
    expect(checks.every((check) => check.status === STATUS.PENDIENTE)).toBe(true);
    expect(checks.find((check) => check.rule === 'entities-coverage').message).toContain('falta generar');
  });

  // Prueba obligatoria 7: en cada etapa no se valida contra etapas posteriores inexistentes.
  test('con definicion + modelo de datos (sin API ni pantallas) sigue sin dar errores', () => {
    const { findings, checks } = evaluateRules({ definition: COURIER_DEFINITION, dataModel: COURIER_DATA_MODEL });

    expect(findings).toEqual([]);
    expect(checks.find((check) => check.rule === 'entities-coverage').pendingStages).toEqual(['api-spec']);
  });

  test('con definicion + modelo + API (sin pantallas) solo se evalua lo evaluable', () => {
    const { findings, checks } = evaluateRules({
      definition: COURIER_DEFINITION,
      dataModel: COURIER_DATA_MODEL,
      apiSpec: COURIER_API_SPEC,
    });

    expect(findings).toEqual([]);
    expect(checks.find((check) => check.rule === 'entities-coverage').status).toBe(STATUS.OK);
    expect(checks.find((check) => check.rule === 'mvp-scope-drift').pendingStages).toEqual(['screens']);
  });

  test('el caso courier completo y correcto no da ningun hallazgo', () => {
    const { findings, checks } = evaluateRules(FULL_COURIER_CONTEXT);

    expect(findings).toEqual([]);
    expect(checks.every((check) => check.status === STATUS.OK)).toBe(true);
  });

  test('runAllRules sigue devolviendo solo la lista de hallazgos (forma historica)', () => {
    const modelSinPaquete = { entities: [{ name: 'Usuario', attributes: [{ name: 'id', type: 'uuid' }] }] };
    const issues = runAllRules({ ...FULL_COURIER_CONTEXT, dataModel: modelSinPaquete });

    expect(issues.map((issue) => issue.rule)).toContain('entities-coverage');
  });

  test('no devuelve nada si no hay ninguna etapa con datos (proyecto recien creado)', () => {
    expect(runAllRules({ definition: null, dataModel: null, apiSpec: null, screenMap: null })).toEqual([]);
  });
});
