/**
 * T-027.2 - Generacion deterministica del grafo de navegacion entre
 * pantallas, como diagrama Mermaid flowchart (igual espiritu que
 * mermaid.js del modulo data-model: el diagrama nunca lo genera la IA
 * directamente, para reducir la superficie de fallo).
 */
function sanitizeIdentifier(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function generateNavigationFlowchart(screens, navigation) {
  const lines = ['flowchart TD'];

  screens.forEach((screen) => {
    const id = sanitizeIdentifier(screen.name);
    lines.push(`  ${id}["${screen.name}"]`);
  });

  navigation.forEach((edge) => {
    const fromId = sanitizeIdentifier(edge.from);
    const toId = sanitizeIdentifier(edge.to);
    const label = edge.label ? `|${edge.label}|` : '';
    lines.push(`  ${fromId} -->${label} ${toId}`);
  });

  return lines.join('\n');
}

module.exports = { generateNavigationFlowchart, sanitizeIdentifier };
