/**
 * Tests de la generacion deterministica de datos de ejemplo a partir del
 * modelo de datos aprobado (sin IA, ver seedData.js).
 */
const { generateSeedData, RECORD_COUNT } = require('../../src/modules/data-model/seedData');

const TICKET = {
  name: 'Ticket',
  attributes: [
    { name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, foreignKey: null },
    { name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null },
    { name: 'resolved', type: 'boolean', primaryKey: false, unique: false, nullable: false, foreignKey: null },
    { name: 'createdAt', type: 'datetime', primaryKey: false, unique: false, nullable: false, foreignKey: null },
    { name: 'priority', type: 'integer', primaryKey: false, unique: false, nullable: false, foreignKey: null },
    {
      name: 'agentId',
      type: 'uuid',
      primaryKey: false,
      unique: false,
      nullable: true,
      foreignKey: { entity: 'Agent', attribute: 'id' },
    },
  ],
};

const AGENT = {
  name: 'Agent',
  attributes: [
    { name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, foreignKey: null },
    { name: 'email', type: 'string', primaryKey: false, unique: true, nullable: false, foreignKey: null },
  ],
};

describe('generateSeedData', () => {
  test('devuelve un bloque por entidad, en el mismo orden que se le paso', () => {
    const result = generateSeedData([TICKET, AGENT]);

    expect(result.map((block) => block.name)).toEqual(['Ticket', 'Agent']);
  });

  test('genera RECORD_COUNT registros por entidad', () => {
    const result = generateSeedData([TICKET, AGENT]);

    result.forEach((block) => expect(block.records).toHaveLength(RECORD_COUNT));
  });

  test('cada registro tiene todos los atributos de la entidad', () => {
    const [ticketBlock] = generateSeedData([TICKET, AGENT]);

    ticketBlock.records.forEach((record) => {
      expect(Object.keys(record).sort()).toEqual(['agentId', 'createdAt', 'id', 'priority', 'resolved', 'title'].sort());
    });
  });

  test('infiere tipos de dato plausibles segun el nombre del tipo declarado', () => {
    const [ticketBlock] = generateSeedData([TICKET, AGENT]);
    const record = ticketBlock.records[0];

    expect(typeof record.resolved).toBe('boolean');
    expect(typeof record.priority).toBe('number');
    expect(String(record.createdAt)).toMatch(/^2026-01-\d{2}$/);
  });

  test('cada clave foranea apunta a un registro que de verdad existe en la entidad referenciada', () => {
    const [ticketBlock, agentBlock] = generateSeedData([TICKET, AGENT]);
    const agentIds = new Set(agentBlock.records.map((r) => r.id));

    ticketBlock.records.forEach((record) => {
      expect(agentIds.has(record.agentId)).toBe(true);
    });
  });

  test('resuelve las FK sin importar el orden en que se pasan las entidades', () => {
    const [agentBlock, ticketBlock] = generateSeedData([AGENT, TICKET]);
    const agentIds = new Set(agentBlock.records.map((r) => r.id));

    ticketBlock.records.forEach((record) => {
      expect(agentIds.has(record.agentId)).toBe(true);
    });
  });

  test('una auto-referencia encadena con el registro anterior, sin loop infinito', () => {
    const employee = {
      name: 'Employee',
      attributes: [
        { name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, foreignKey: null },
        {
          name: 'managerId',
          type: 'uuid',
          primaryKey: false,
          unique: false,
          nullable: true,
          foreignKey: { entity: 'Employee', attribute: 'id' },
        },
      ],
    };

    const [block] = generateSeedData([employee]);

    expect(block.records[0].managerId).toBeNull();
    expect(block.records[1].managerId).toBe(block.records[0].id);
  });

  test('devuelve una lista vacia si no hay entidades', () => {
    expect(generateSeedData([])).toEqual([]);
  });
});
