/**
 * T-027.2 - Generacion deterministica del grafo de navegacion entre
 * pantallas, como diagrama Mermaid flowchart (igual espiritu que
 * mermaid.js del modulo data-model: el diagrama nunca lo genera la IA
 * directamente, para reducir la superficie de fallo).
 */
function sanitizeIdentifier(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * El nombre de pantalla va entre comillas dentro de `["..."]`, asi que
 * tolera parentesis y demas (ver sanitizeIdentifier, que solo sanea el
 * ID). La etiqueta de navegacion en cambio va SIN comillas dentro de
 * `|...|`: en ese contexto Mermaid interpreta un parentesis como el
 * inicio de otra forma de nodo y el parseo explota (visto en pruebas
 * manuales reales: "Ver etiquetas (envio cerrado)" rompia el diagrama).
 * La correccion documentada por Mermaid para esto es citar tambien el
 * texto dentro del pipe (`|"texto (con parentesis)"|`), que si soporta
 * caracteres especiales. Las comillas dobles internas se escapan
 * reemplazandolas, porque cerrarian el label antes de tiempo.
 */
function sanitizeEdgeLabel(label) {
  return label.replace(/"/g, "'").replace(/\r?\n/g, ' ').trim();
}

function generateNavigationFlowchart(screens, navigation) {
  const lines = ['flowchart TD'];

  screens.forEach((screen) => {
    const id = sanitizeIdentifier(screen.name);
    // El nombre va entre comillas dobles: una comilla doble dentro del
    // nombre cerraria la etiqueta antes de tiempo y romperia el diagrama
    // completo (mismo motivo por el que ya se escapaban las etiquetas de
    // navegacion).
    lines.push(`  ${id}["${sanitizeEdgeLabel(screen.name)}"]`);
  });

  navigation.forEach((edge) => {
    const fromId = sanitizeIdentifier(edge.from);
    const toId = sanitizeIdentifier(edge.to);
    const label = edge.label ? `|"${sanitizeEdgeLabel(edge.label)}"|` : '';
    lines.push(`  ${fromId} -->${label} ${toId}`);
  });

  return lines.join('\n');
}

module.exports = { generateNavigationFlowchart, sanitizeIdentifier, sanitizeEdgeLabel };
