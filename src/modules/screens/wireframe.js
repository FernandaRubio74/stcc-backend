/**
 * Wireframe de baja fidelidad en texto plano, generado DETERMINISTICAMENTE
 * a partir de los elementos estructurados de la pantalla (mismo criterio
 * que mermaid.js/flowchart.js: nunca lo genera la IA directamente, para
 * que el documento final sea reproducible y no dependa de un segundo
 * llamado). Es la representacion textual que el pedido original exige
 * para que "la otra IA no tenga que adivinar la interfaz".
 */
const TYPE_ICONS = {
  list: '≡',
  form: '▭',
  field: '▯',
  button: '▶',
  text: '¶',
  image: '▣',
  nav: '→',
};

const MIN_WIDTH = 42;
const MAX_WIDTH = 72;

function renderScreenWireframe(screen) {
  const contentWidths = (screen.mainElements || []).map((el) => elementLine(el).length);
  const innerWidth = Math.min(Math.max(screen.name.length, ...contentWidths, MIN_WIDTH - 4), MAX_WIDTH - 4);
  const width = innerWidth + 4;

  const top = `┌${'─'.repeat(width - 2)}┐`;
  const divider = `├${'─'.repeat(width - 2)}┤`;
  const bottom = `└${'─'.repeat(width - 2)}┘`;

  const row = (text) => `│ ${text.padEnd(innerWidth).slice(0, innerWidth)} │`;

  const lines = (screen.mainElements || []).map((el) => row(elementLine(el)));

  return [top, row(screen.name), divider, ...lines, bottom].join('\n');
}

function elementLine(element) {
  const icon = TYPE_ICONS[element.type] || '•';
  const ref = element.dataField ? ` (${element.dataField})` : element.endpointRef ? ` [${element.endpointRef}]` : '';
  return `${icon} ${element.label}${ref}`;
}

function generateScreenWireframes(screens) {
  return (screens || []).map((screen) => ({ name: screen.name, wireframe: renderScreenWireframe(screen) }));
}

module.exports = { renderScreenWireframe, generateScreenWireframes, elementLine };
