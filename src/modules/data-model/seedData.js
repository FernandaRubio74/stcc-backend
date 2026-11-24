/**
 * Generacion DETERMINISTICA (sin IA) de datos de ejemplo a partir del
 * modelo de datos aprobado. Pedido explicito: el documento final tiene que
 * traer datos "quemados" coherentes con el modelo y las relaciones, para
 * que la otra IA pueda probar el flujo sin tener que inventarlos ella
 * misma - y, para no afectar el tiempo total del flujo, generarlos con
 * codigo es muchisimo mas rapido y 100% reproducible que pedirselos a la
 * IA (mismo criterio que mermaid.js/flowchart.js/wireframe.js).
 *
 * `attribute.type` es texto libre (lo decide la IA al definir el modelo,
 * no un enum fijo - ver entity.schema.js), asi que el tipo de dato de
 * ejemplo se infiere por palabras clave dentro del string, igual espiritu
 * que coverage.js con las funcionalidades del MVP.
 */
const RECORD_COUNT = 6;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function inferScalarValue(entityName, attribute, index) {
  const type = (attribute.type || '').toLowerCase();
  const name = (attribute.name || '').toLowerCase();

  if (attribute.primaryKey || type.includes('uuid')) {
    return `${slugify(entityName)}-${index + 1}`;
  }
  if (type.includes('bool')) {
    return index % 2 === 0;
  }
  if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('numeric') || type.includes('number')) {
    return index + 1;
  }
  if (type.includes('date') || type.includes('time')) {
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2026-01-${day}`;
  }
  if (name.includes('email')) {
    return `${slugify(attribute.name)}${index + 1}@ejemplo.com`;
  }
  return `${entityName} ${attribute.name} ${index + 1}`;
}

/** Orden topologico por dependencias de clave foranea: una entidad se genera despues de las que referencia. */
function topologicalOrder(entities) {
  const byName = new Map(entities.map((entity) => [entity.name, entity]));
  const visited = new Set();
  const order = [];

  function visit(entity) {
    if (visited.has(entity.name)) return;
    visited.add(entity.name);
    (entity.attributes || []).forEach((attribute) => {
      const refEntity = attribute.foreignKey && byName.get(attribute.foreignKey.entity);
      if (refEntity && refEntity.name !== entity.name) {
        visit(refEntity);
      }
    });
    order.push(entity);
  }

  entities.forEach(visit);
  return order;
}

function resolveForeignKeyValue(attribute, entity, records, index, recordsByEntity) {
  const refEntity = attribute.foreignKey.entity;
  const refAttribute = attribute.foreignKey.attribute;

  // Auto-referencia (ej. "reporta_a" dentro de la misma entidad): el
  // primer registro no tiene antecesor, el resto encadena con el anterior.
  if (refEntity === entity.name) {
    return index === 0 ? null : records[index - 1][refAttribute] ?? null;
  }

  const refRecords = recordsByEntity.get(refEntity) || [];
  if (refRecords.length === 0) return null;
  return refRecords[index % refRecords.length][refAttribute] ?? null;
}

/**
 * @param {object[]} entities modelo de datos aprobado (dataModel.entities)
 * @returns {{name: string, attributes: string[], records: object[]}[]} en el mismo orden que `entities`
 */
function generateSeedData(entities) {
  if (!entities || entities.length === 0) return [];

  const recordsByEntity = new Map();
  const order = topologicalOrder(entities);

  order.forEach((entity) => {
    const records = [];
    for (let i = 0; i < RECORD_COUNT; i += 1) {
      const record = {};
      (entity.attributes || []).forEach((attribute) => {
        record[attribute.name] = attribute.foreignKey
          ? resolveForeignKeyValue(attribute, entity, records, i, recordsByEntity)
          : inferScalarValue(entity.name, attribute, i);
      });
      records.push(record);
    }
    recordsByEntity.set(entity.name, records);
  });

  return entities.map((entity) => ({
    name: entity.name,
    attributes: (entity.attributes || []).map((attribute) => attribute.name),
    records: recordsByEntity.get(entity.name) || [],
  }));
}

module.exports = { generateSeedData, RECORD_COUNT };
