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
