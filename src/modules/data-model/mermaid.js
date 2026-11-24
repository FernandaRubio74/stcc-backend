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

/**
 * En `erDiagram`, el tipo y el nombre de un atributo tienen que ser UNA
 * sola palabra (el parser espera ATTRIBUTE_WORD). Cualquier otra cosa
 * rompe el diagrama entero, no solo esa linea.
 *
 * Regresion real: al pedirle al modelo de datos que deje los tipos de
 * usuario escritos en el `type` del campo de rol (ej.
 * "enum: miembro del equipo | admin"), eso se emitia tal cual y el
 * diagrama fallaba con "Expecting 'ATTRIBUTE_WORD', got ':'". Tambien
 * podia pasar con una edicion manual del modelo.
 */
function sanitizeAttributeWord(value) {
  const cleaned = (value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'campo';
}

/**
 * Para un tipo compuesto se muestra solo su "cabeza" (ej. `enum` de
 * "enum: miembro del equipo | admin"): el detalle completo va igual en el
 * comentario, y asi el diagrama queda legible en vez de con un tipo
 * larguisimo con guiones bajos.
 */
function attributeType(rawType) {
  const trimmed = (rawType || '').trim();
  const head = trimmed.split(/[:(|]/)[0].trim();
  const candidate = head && /^[a-zA-Z0-9_-]+$/.test(head) ? head : trimmed;
  return sanitizeAttributeWord(candidate);
}

/**
 * El texto original no se pierde: va como comentario del atributo (que
 * Mermaid si soporta y admite espacios). Las comillas dobles se cambian
 * por simples porque el comentario va entre comillas dobles.
 */
function attributeComment(originalType, sanitizedType) {
  if (originalType === sanitizedType) return '';
  return ` "${originalType.trim().replace(/"/g, "'")}"`;
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
      const type = attributeType(attribute.type);
      const name = sanitizeAttributeWord(attribute.name);
      const comment = attributeComment(attribute.type || '', type);
      lines.push(`    ${type} ${name}${key ? ` ${key}` : ''}${comment}`);
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
