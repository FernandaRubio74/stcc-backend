/**
 * T-019.2 - Representacion visual del modelo. Se genera de forma
 * deterministica a partir de `entities` (no se le pide a la IA que
 * tambien redacte el diagrama): la IA ya tiene que acertar una estructura
 * JSON compleja, pedirle ademas sintaxis Mermoid valida duplica superficie
 * de fallo para un dato que se puede derivar sin ambiguedad del modelo.
 */
function sanitizeIdentifier(name) {
  return name.trim().replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}

function keyAnnotation(attribute) {
  const tags = [];
  if (attribute.primaryKey) tags.push('PK');
  if (attribute.foreignKey) tags.push('FK');
  if (attribute.unique && !attribute.primaryKey) tags.push('UK');
  return tags.join(',');
}

function generateMermaidDiagram(entities) {
  const lines = ['erDiagram'];

  for (const entity of entities) {
    const entityId = sanitizeIdentifier(entity.name);
    lines.push(`  ${entityId} {`);
    for (const attribute of entity.attributes) {
      const key = keyAnnotation(attribute);
      lines.push(key ? `    ${attribute.type} ${attribute.name} ${key}` : `    ${attribute.type} ${attribute.name}`);
    }
    lines.push('  }');
  }

  // Todas las relaciones se dibujan como 1-a-muchos (el lado "1" es la
  // entidad referenciada por la FK): es la cardinalidad por defecto mas
  // comun y evita tener que inferir la cardinalidad real desde el JSON.
  for (const entity of entities) {
    const entityId = sanitizeIdentifier(entity.name);
    for (const attribute of entity.attributes) {
      if (!attribute.foreignKey) continue;
      const targetId = sanitizeIdentifier(attribute.foreignKey.entity);
      lines.push(`  ${targetId} ||--o{ ${entityId} : "${attribute.name}"`);
    }
  }

  return lines.join('\n');
}

module.exports = { generateMermaidDiagram };
