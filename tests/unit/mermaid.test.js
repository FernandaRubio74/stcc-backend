/**
 * T-019.2 - Generacion deterministica (sin IA) del diagrama Mermaid ER a
 * partir de las entidades.
 */
const { generateMermaidDiagram } = require('../../src/modules/data-model/mermaid');

describe('generateMermaidDiagram', () => {
  test('genera el bloque erDiagram con entidades y atributos', () => {
    const entities = [
      {
        name: 'User',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
          { name: 'email', type: 'string', primaryKey: false, unique: true, nullable: false, foreignKey: null },
        ],
      },
    ];

    const diagram = generateMermaidDiagram(entities);

    expect(diagram).toContain('erDiagram');
    expect(diagram).toContain('USER {');
    expect(diagram).toContain('uuid id PK');
    expect(diagram).toContain('string email UK');
  });

  test('dibuja una relacion 1-a-muchos por cada foreignKey', () => {
    const entities = [
      {
        name: 'User',
        attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
      },
      {
        name: 'Project',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
          {
            name: 'owner_id',
            type: 'uuid',
            primaryKey: false,
            unique: false,
            nullable: false,
            foreignKey: { entity: 'User', attribute: 'id' },
          },
        ],
      },
    ];

    const diagram = generateMermaidDiagram(entities);

    expect(diagram).toContain('uuid owner_id FK');
    expect(diagram).toContain('USER ||--o{ PROJECT : "owner_id"');
  });

  test('sanitiza nombres con espacios o caracteres no alfanumericos', () => {
    const entities = [
      {
        name: 'Order Item',
        attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
      },
    ];

    const diagram = generateMermaidDiagram(entities);

    expect(diagram).toContain('ORDER_ITEM {');
  });
});

/**
 * Regresion reportada: "Parse error on line 5: ...ng email UK enum: miembro
 * del equipo / Expecting 'ATTRIBUTE_WORD', '?', got ':'".
 *
 * En erDiagram de Mermaid, el tipo y el nombre de un atributo tienen que
 * ser una sola palabra (ATTRIBUTE_WORD). Al pedirle al modelo de datos que
 * deje los tipos de usuario escritos en el `type` de un campo de rol
 * (ej. "enum: miembro del equipo | admin"), ese texto se emitia tal cual y
 * rompia el parseo del diagrama completo. El valor legible no se pierde:
 * va como comentario del atributo, que Mermaid si soporta.
 */
describe('tipos y nombres que no son una sola palabra', () => {
  const ROLE_ENTITIES = [
    {
      name: 'Usuario',
      attributes: [
        { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
        { name: 'email', type: 'string', primaryKey: false, unique: true, nullable: false, foreignKey: null },
        { name: 'rol', type: 'enum: miembro del equipo | admin', primaryKey: false, unique: false, nullable: false, foreignKey: null },
      ],
    },
  ];

  test('no emite nunca un tipo con espacios, dos puntos o barras', () => {
    const diagram = generateMermaidDiagram(ROLE_ENTITIES);

    const attributeLines = diagram
      .split('\n')
      .filter((line) => /^ {4}\S/.test(line))
      .map((line) => line.trim());

    attributeLines.forEach((line) => {
      const [type, name] = line.split(/\s+/);
      expect(type).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(name).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  test('conserva el tipo original legible como comentario del atributo', () => {
    const diagram = generateMermaidDiagram(ROLE_ENTITIES);

    expect(diagram).toContain('"enum: miembro del equipo | admin"');
  });

  test('sanitiza tambien el nombre del atributo si tiene espacios', () => {
    const diagram = generateMermaidDiagram([
      {
        name: 'Paquete',
        attributes: [{ name: 'peso total', type: 'decimal', primaryKey: false, unique: false, nullable: true, foreignKey: null }],
      },
    ]);

    expect(diagram).toContain('decimal peso_total');
  });

  test('una comilla doble dentro del tipo no rompe el comentario', () => {
    const diagram = generateMermaidDiagram([
      {
        name: 'Paquete',
        attributes: [{ name: 'tipo', type: 'enum: "seco" | "humedo"', primaryKey: false, unique: false, nullable: false, foreignKey: null }],
      },
    ]);

    const comentario = diagram.split('\n').find((line) => line.includes('tipo'));
    expect((comentario.match(/"/g) || []).length).toBe(2);
  });
});
