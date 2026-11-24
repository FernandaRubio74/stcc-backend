/**
 * Primitivas de escritura de HTML. TODO el texto que viene de la IA o del
 * proyecto pasa por `esc()`: la salida del modelo se trata como no
 * confiable, nunca se inyecta HTML crudo y nunca se ejecuta un script
 * dentro de una maqueta.
 */

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
};

/** Escapa texto para contenido y para valor de atributo (entre comillas). */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`=]/g, (char) => ENTITIES[char]);
}

/** Une clases ignorando vacios/falsy. */
function cls(...names) {
  return names.filter(Boolean).join(' ');
}

/** Un elemento. `attrs` se escapan; `children` ya tiene que venir escapado. */
function tag(name, attrs = {}, children = '') {
  const parts = Object.entries(attrs)
    .filter(([, value]) => value !== null && value !== undefined && value !== false && value !== '')
    .map(([key, value]) => (value === true ? esc(key) : `${esc(key)}="${esc(value)}"`));
  const open = [esc(name), ...parts].join(' ');
  if (VOID_TAGS.has(name)) return `<${open}>`;
  return `<${open}>${children}</${esc(name)}>`;
}

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);

/** Concatena hijos ya renderizados. */
function join(children) {
  return (children || []).filter(Boolean).join('');
}

module.exports = { esc, cls, tag, join, VOID_TAGS };
