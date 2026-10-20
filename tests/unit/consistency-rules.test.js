/**
 * T-031.4 - Tests de cada regla de validacion cruzada de forma aislada.
 */
const {
  checkEntitiesCoverage,
  checkTargetUsersCoverage,
  checkMvpScopeDrift,
  runAllRules,
} = require('../../src/modules/consistency/rules');

const DATA_MODEL = { entities: [{ name: 'Ticket', attributes: [{ name: 'title' }] }, { name: 'Agent', attributes: [] }] };

const API_SPEC_OK = {
  endpoints: [{ method: 'GET', path: '/tickets', description: 'Lista tickets', resourceEntity: 'Ticket' }],
};

const API_SPEC_DRIFT = {
  endpoints: [{ method: 'GET', path: '/invoices', description: 'Lista facturas', resourceEntity: 'Invoice' }],
};

describe('checkEntitiesCoverage', () => {
  test('no reporta nada si falta el modelo de datos o la api (todavia no hay nada aprobado)', () => {
    expect(checkEntitiesCoverage({ dataModel: null, apiSpec: API_SPEC_OK })).toEqual([]);
    expect(checkEntitiesCoverage({ dataModel: DATA_MODEL, apiSpec: null })).toEqual([]);
  });

  test('no reporta nada si todos los endpoints referencian entidades existentes', () => {
    expect(checkEntitiesCoverage({ dataModel: DATA_MODEL, apiSpec: API_SPEC_OK })).toEqual([]);
  });

  test('reporta un item accionable por cada endpoint que referencia una entidad que ya no existe', () => {
    const issues = checkEntitiesCoverage({ dataModel: DATA_MODEL, apiSpec: API_SPEC_DRIFT });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: 'entities-coverage', stages: ['data-model', 'api-spec'] });
    expect(issues[0].message).toContain('Invoice');
  });
});

describe('checkTargetUsersCoverage', () => {
  const DEFINITION = { targetUsers: [{ label: 'Agente de soporte', description: 'x' }] };

  test('no reporta nada si no hay tipos de usuario definidos', () => {
    expect(checkTargetUsersCoverage({ definition: { targetUsers: [] } })).toEqual([]);
  });

  test('no reporta nada si el tipo de usuario esta mencionado en alguna etapa posterior', () => {
    const issues = checkTargetUsersCoverage({
      definition: DEFINITION,
      dataModel: { entities: [{ name: 'Agente de soporte', attributes: [] }] },
    });
    expect(issues).toEqual([]);
  });

  test('reporta un item si el tipo de usuario no aparece en ninguna etapa posterior', () => {
    const unrelatedDataModel = { entities: [{ name: 'Factura', attributes: [{ name: 'monto' }] }] };
    const issues = checkTargetUsersCoverage({ definition: DEFINITION, dataModel: unrelatedDataModel });

    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('target-users-coverage');
    expect(issues[0].message).toContain('Agente de soporte');
  });

  test('reporta un item si el tipo de usuario es una frase compuesta que no aparece en ninguna etapa, aunque alguna palabra suelta sea ambigua', () => {
    const definition = { targetUsers: [{ label: 'Dueño de cancha', description: 'x' }] };
    const dataModel = { entities: [{ name: 'Usuario', attributes: [{ name: 'nombre' }] }] };

    const issues = checkTargetUsersCoverage({ definition, dataModel, apiSpec: null, screenMap: null });

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Dueño de cancha');
  });

  test('cubre un tipo de usuario compuesto cuando sus palabras clave aparecen por separado en distintas etapas', () => {
    const definition = { targetUsers: [{ label: 'Dueño de cancha', description: 'x' }] };
    const dataModel = { entities: [{ name: 'Dueno', attributes: [] }, { name: 'Cancha', attributes: [] }] };

    const issues = checkTargetUsersCoverage({ definition, dataModel, apiSpec: null, screenMap: null });

    expect(issues).toEqual([]);
  });
});

describe('checkMvpScopeDrift', () => {
  const DEFINITION = { mvpScope: { out: ['Reportes avanzados'] } };

  test('no reporta nada si no hay funcionalidades fuera de scope', () => {
    expect(checkMvpScopeDrift({ definition: { mvpScope: { out: [] } } })).toEqual([]);
  });

  test('no reporta nada si la funcionalidad fuera de scope no aparece en la API ni en las pantallas', () => {
    const issues = checkMvpScopeDrift({ definition: DEFINITION, apiSpec: API_SPEC_OK, screenMap: null });
    expect(issues).toEqual([]);
  });

  test('reporta un item si una funcionalidad fuera de scope aparece referenciada en la API', () => {
    const issues = checkMvpScopeDrift({
      definition: DEFINITION,
      apiSpec: { endpoints: [{ method: 'GET', path: '/reportes', description: 'Reportes avanzados', resourceEntity: 'Ticket' }] },
      screenMap: null,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('mvp-scope-drift');
  });

  test('reporta un item si una funcionalidad fuera de scope aparece en una pantalla', () => {
    const issues = checkMvpScopeDrift({
      definition: DEFINITION,
      apiSpec: null,
      screenMap: { screens: [{ name: 'Reportes', purpose: 'Reportes avanzados', mainElements: [] }] },
    });

    expect(issues).toHaveLength(1);
  });
});

describe('runAllRules', () => {
  test('combina los resultados de las 3 reglas', () => {
    const issues = runAllRules({
      definition: { targetUsers: [{ label: 'Cliente', description: 'x' }], mvpScope: { out: [] } },
      dataModel: DATA_MODEL,
      apiSpec: API_SPEC_DRIFT,
      screenMap: null,
    });

    const rules = issues.map((i) => i.rule).sort();
    expect(rules).toEqual(['entities-coverage', 'target-users-coverage']);
  });

  test('no devuelve nada si no hay ninguna etapa con datos (proyecto recien creado)', () => {
    expect(runAllRules({ definition: null, dataModel: null, apiSpec: null, screenMap: null })).toEqual([]);
  });
});
