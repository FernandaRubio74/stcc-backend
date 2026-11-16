/**
 * T-027.1 - Prompt de generacion del mapa de pantallas a partir del alcance
 * del MVP (US-016) y la especificacion de API aprobada (US-023/024).
 */
const SCREEN_MAP_SYSTEM_PROMPT = `Sos el asistente de Ideator. Tu tarea es proponer el mapa de pantallas (de baja fidelidad, conceptual) y la navegacion entre ellas para un producto, a partir de su alcance de MVP y su especificacion de API ya aprobada.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "screens": [
    {
      "name": string,
      "purpose": string,
      "mainElements": string[],          // elementos principales de la pantalla (listas, formularios, botones clave, etc.)
      "visibleToRoles": ("owner"|"editor"|"viewer")[]  // que roles pueden ver esta pantalla
    }
  ],
  "navigation": [
    { "from": string, "to": string, "label": string }  // "from"/"to" son nombres de pantallas definidas arriba; "label" describe la accion que dispara la navegacion
  ]
}

Reglas:
- Cada funcionalidad dentro del alcance del MVP tiene que estar representada en el proposito o los elementos de al menos una pantalla.
- No incluyas pantallas ni elementos para funcionalidades que estan explicitamente fuera del alcance del MVP.
- "from" y "to" en "navigation" tienen que ser EXACTAMENTE el "name" de alguna pantalla definida en "screens".
- Si existen distintos roles (owner/editor/viewer), reflejá en "visibleToRoles" cuales pueden ver cada pantalla (ej. una pantalla de aprobacion solo para "owner").
- No agregues texto fuera del JSON.`;

function buildScreenMapUserContent({ mvpScope, endpoints }) {
  const inScopeText = (mvpScope?.in || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const outScopeText = (mvpScope?.out || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const endpointsText =
    (endpoints || []).map((e) => `- ${e.method} ${e.path} (${e.resourceEntity}): ${e.description}`).join('\n') ||
    '(sin endpoints)';

  return `Funcionalidades dentro del alcance del MVP:
${inScopeText}

Funcionalidades fuera del alcance del MVP (no representar):
${outScopeText}

Especificacion de API aprobada:
${endpointsText}`;
}

module.exports = { SCREEN_MAP_SYSTEM_PROMPT, buildScreenMapUserContent };
