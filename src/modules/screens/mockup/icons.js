/**
 * Set unico de iconos, como SVG en linea. Sin librerias externas y sin
 * emojis: una maqueta tiene que abrirse sin red y los emojis estan
 * prohibidos en la interfaz.
 *
 * Trazo de 1.5 px, caja de 24, `currentColor`: heredan el color del
 * contenedor, asi un icono activo toma el acento sin CSS extra.
 */

const PATHS = {
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  box: '<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  users: '<path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="3"/><path d="M22 19v-1a4 4 0 0 0-3-3.87"/><path d="M16 4.13A4 4 0 0 1 16 11"/>',
  tag: '<path d="M20.6 12.6L12 21.2 2.8 12V2.8H12z"/><circle cx="7.3" cy="7.3" r="1.3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.4 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.7l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  print: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
  scale: '<path d="M12 3v18M7 21h10M12 6l-7 5h14z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};

/** Palabras clave -> icono, para elegir el icono de una seccion del menu. */
const SECTION_HINTS = [
  [/panel|dashboard|inicio|resumen/i, 'grid'],
  [/paquete|envio|package|pedido|orden/i, 'box'],
  [/producto|inventario|stock|catalogo/i, 'list'],
  [/usuario|cliente|remitente|destinatario|equipo|persona/i, 'users'],
  [/etiqueta|label|correlativo/i, 'tag'],
  [/peso|pesaje|balanza/i, 'scale'],
  [/historial|registro|log|auditoria/i, 'clock'],
  [/reporte|metrica|estadistica|analitica/i, 'chart'],
  [/imprimir|impresion/i, 'print'],
  [/ajuste|configuracion|preferencia/i, 'settings'],
];

function iconFor(label) {
  const hit = SECTION_HINTS.find(([pattern]) => pattern.test(String(label || '')));
  return hit ? hit[1] : 'list';
}

/** SVG en linea. `size` en px; hereda el color por `currentColor`. */
function icon(name, size = 18) {
  const body = PATHS[name] || PATHS.list;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

module.exports = { icon, iconFor, PATHS };
