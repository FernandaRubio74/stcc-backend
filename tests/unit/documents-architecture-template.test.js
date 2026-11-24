/**
 * T-036.4 - Tests de la plantilla del documento de arquitectura.
 *
 * El test central es el de coherencia: el documento tiene que describir la
 * arquitectura CONFIRMADA y no otra del catalogo. Por eso se usa el catalogo
 * real (no un fixture inventado) y se verifica tanto lo que debe aparecer
 * como lo que no.
 */
const { buildArchitectureDocument } = require('../../src/modules/documents/architecture.template');
const { ARCHITECTURE_CATALOG } = require('../../src/modules/architecture/catalog');

const MONOLITO = ARCHITECTURE_CATALOG.find((entry) => entry.id === 'monolito-modular');
const SERVERLESS = ARCHITECTURE_CATALOG.find((entry) => entry.id === 'serverless-managed');

const CONTEXT = {
  project: { name: 'Reservas de canchas' },
  architecture: {
    selectedId: 'monolito-modular',
    recommendedId: 'monolito-modular',
    justification: 'Dominio chico y consistencia transaccional.',
  },
  catalogEntry: MONOLITO,
  dataModel: {
    versionNumber: 2,
    entities: [
      {
        name: 'Cancha',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, nullable: false, foreignKey: null },
          { name: 'duenoId', type: 'uuid', nullable: false, foreignKey: { entity: 'Dueno', attribute: 'id' } },
        ],
        indexes: [],
      },
      {
        name: 'Reserva',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, nullable: false, foreignKey: null },
          { name: 'canchaId', type: 'uuid', nullable: false, foreignKey: { entity: 'Cancha', attribute: 'id' } },
        ],
        indexes: [{ name: 'uq_reserva_slot', attributes: ['canchaId', 'inicio'], unique: true }],
      },
    ],
  },
  apiSpec: {
    versionNumber: 3,
    endpoints: [
      {
        method: 'GET',
        path: '/canchas',
        description: 'Lista canchas',
        resourceEntity: 'Cancha',
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
        responses: [
          { status: 201, description: 'creada' },
          { status: 401, description: 'no autenticado' },
          { status: 403, description: 'no autorizado' },
        ],
      },
    ],
  },
  screenMap: { screens: [{ name: 'Listado', purpose: 'x', mainElements: [], visibleToRoles: ['viewer'] }] },
  versionNumber: 1,
  generatedAt: new Date('2026-11-15T12:00:00.000Z'),
};

describe('buildArchitectureDocument', () => {
  test('incluye las 7 secciones que pide el DoD', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain('## 1. Arquitectura seleccionada');
    expect(doc).toContain('## 2. Tecnologias seleccionadas');
    expect(doc).toContain('## 3. Organizacion de la solucion');
    expect(doc).toContain('## 4. Decisiones de base de datos');
    expect(doc).toContain('## 5. Decisiones de backend y frontend');
    expect(doc).toContain('## 6. Autenticacion y autorizacion');
    expect(doc).toContain('## 7. Despliegue y entornos');
  });

  test('es coherente con la arquitectura confirmada: trae sus tecnologias y no las de otro escenario', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain(MONOLITO.name);
    expect(doc).toContain(MONOLITO.persistence);
    expect(doc).toContain(MONOLITO.backend);
    expect(doc).toContain(MONOLITO.frontend);
    expect(doc).toContain(MONOLITO.communication);
    expect(doc).toContain(MONOLITO.infrastructure);
    expect(doc).toContain(MONOLITO.observability);
    expect(doc).toContain(MONOLITO.authSsoAuthorization);

    expect(doc).not.toContain(SERVERLESS.persistence);
    expect(doc).not.toContain(SERVERLESS.backend);
  });

  test('incluye la justificacion registrada y deja claro que coincide con la recomendacion', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain('Dominio chico y consistencia transaccional.');
    expect(doc).toContain('coincide con la que el analisis del proyecto habia recomendado');
  });

  test('deja constancia cuando el owner confirmo una opcion distinta de la recomendada', () => {
    const doc = buildArchitectureDocument({
      ...CONTEXT,
      architecture: { ...CONTEXT.architecture, recommendedId: 'serverless-managed' },
    });

    expect(doc).toContain('La recomendacion inicial habia sido `serverless-managed`');
    expect(doc).toContain('confirmo explicitamente `monolito-modular`');
  });

  test('deriva la organizacion de la solucion del modelo y de la API aprobados', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain('Cancha');
    expect(doc).toContain('Reserva');
    expect(doc).toContain('GET /canchas');
    expect(doc).toContain('sin endpoints propios');
  });

  test('documenta los invariantes de base de datos derivados del modelo', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain('2 entidades tienen claves foraneas');
    expect(doc).toContain('indices unicos (Reserva)');
  });

  test('distingue autenticacion de autorizacion segun los codigos declarados en la API', () => {
    const doc = buildArchitectureDocument(CONTEXT);

    expect(doc).toContain('2 de 2 endpoints declaran 401');
    expect(doc).toContain('1 endpoints declaran ademas 403');
    expect(doc).toContain('POST /canchas');
  });

  test('es deterministico: el mismo estado produce el mismo documento', () => {
    expect(buildArchitectureDocument(CONTEXT)).toBe(buildArchitectureDocument(CONTEXT));
  });

  test('avisa si la API quedo referenciando una entidad inexistente', () => {
    const doc = buildArchitectureDocument({
      ...CONTEXT,
      apiSpec: {
        versionNumber: 4,
        endpoints: [
          {
            method: 'GET',
            path: '/facturas',
            description: 'x',
            resourceEntity: 'Factura',
            responses: [{ status: 200, description: 'ok' }],
          },
        ],
      },
    });

    expect(doc).toContain('endpoints que referencian entidades inexistentes');
    expect(doc).toContain('GET /facturas (entidad "Factura")');
  });
});
