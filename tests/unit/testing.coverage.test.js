/**
 * Tests puros de coverage.js (sin IA ni base de datos): detecta requisitos
 * del MVP, endpoints o pantallas sin ningun caso de prueba asociado.
 */
const {
  findCoverageGaps,
  hasCoverageGaps,
  describeCoverageGaps,
  assertFullCoverageOrThrow,
  buildEndpointRef,
} = require('../../src/modules/testing/coverage');
const { CoverageGapError } = require('../../src/modules/testing/testing.errors');

const FULL_CONTENT = {
  traceabilityMatrix: [{ requirementRef: 'listar tickets', caseIds: ['AC-1'] }],
  endpointCases: [{ endpointRef: 'GET /tickets' }],
  screenCases: [{ screenRef: 'Tickets' }],
};
const CONTEXT = {
  mvpScopeIn: ['listar tickets'],
  endpoints: [{ method: 'GET', path: '/tickets' }],
  screenNames: ['Tickets'],
};

describe('buildEndpointRef', () => {
  test('combina metodo y ruta con un espacio', () => {
    expect(buildEndpointRef({ method: 'POST', path: '/tickets' })).toBe('POST /tickets');
  });
});

describe('findCoverageGaps', () => {
  test('no reporta nada faltante cuando todo esta cubierto', () => {
    const gaps = findCoverageGaps(FULL_CONTENT, CONTEXT);

    expect(gaps).toEqual({ missingRequirements: [], missingEndpoints: [], missingScreens: [] });
    expect(hasCoverageGaps(gaps)).toBe(false);
  });

  test('detecta un requisito del MVP sin ninguna entrada en la matriz de trazabilidad', () => {
    const content = { ...FULL_CONTENT, traceabilityMatrix: [] };

    const gaps = findCoverageGaps(content, CONTEXT);

    expect(gaps.missingRequirements).toEqual(['listar tickets']);
    expect(hasCoverageGaps(gaps)).toBe(true);
  });

  test('detecta un endpoint real sin ningun caso de prueba', () => {
    const content = { ...FULL_CONTENT, endpointCases: [] };

    const gaps = findCoverageGaps(content, CONTEXT);

    expect(gaps.missingEndpoints).toEqual(['GET /tickets']);
  });

  test('detecta una pantalla real sin ningun caso de prueba', () => {
    const content = { ...FULL_CONTENT, screenCases: [] };

    const gaps = findCoverageGaps(content, CONTEXT);

    expect(gaps.missingScreens).toEqual(['Tickets']);
  });

  test('un endpoint/pantalla/requisito con el mismo texto pero distinto casing NO cuenta como cubierto (coincidencia exacta)', () => {
    const content = {
      traceabilityMatrix: [{ requirementRef: 'Listar Tickets', caseIds: ['AC-1'] }],
      endpointCases: [{ endpointRef: 'get /tickets' }],
      screenCases: [{ screenRef: 'tickets' }],
    };

    const gaps = findCoverageGaps(content, CONTEXT);

    expect(hasCoverageGaps(gaps)).toBe(true);
  });

  test('con context vacio (sin requisitos/endpoints/pantallas) nunca hay gaps', () => {
    const gaps = findCoverageGaps({}, {});

    expect(hasCoverageGaps(gaps)).toBe(false);
  });
});

describe('describeCoverageGaps', () => {
  test('describe solo las categorias que efectivamente tienen faltantes', () => {
    const description = describeCoverageGaps({
      missingRequirements: ['listar tickets'],
      missingEndpoints: [],
      missingScreens: [],
    });

    expect(description).toBe('requisitos del MVP sin cobertura: listar tickets');
    expect(description).not.toContain('endpoints');
  });
});

describe('assertFullCoverageOrThrow', () => {
  test('no tira nada cuando la cobertura esta completa', () => {
    expect(() => assertFullCoverageOrThrow(FULL_CONTENT, CONTEXT)).not.toThrow();
  });

  test('tira CoverageGapError con el detalle de los gaps cuando falta cobertura', () => {
    const content = { ...FULL_CONTENT, screenCases: [] };

    try {
      assertFullCoverageOrThrow(content, CONTEXT);
      throw new Error('no deberia llegar aca');
    } catch (err) {
      expect(err).toBeInstanceOf(CoverageGapError);
      expect(err.gaps.missingScreens).toEqual(['Tickets']);
      expect(err.message).toContain('Tickets');
    }
  });
});
