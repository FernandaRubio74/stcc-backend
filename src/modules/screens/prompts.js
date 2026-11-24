/**
 * T-027.1 - Prompt de generacion del mapa de pantallas a partir del alcance
 * del MVP (US-016) y la especificacion de API aprobada (US-023/024).
 *
 * `mainElements` es estructurado (no strings sueltos): esto permite que el
 * frontend dibuje un wireframe en vivo sin IA de por medio, y que el
 * documento final diga exactamente que dato o endpoint usa cada elemento
 * en vez de dejarlo a la imaginacion de quien lo lea despues.
 */
const SCREEN_MAP_SYSTEM_PROMPT = `Sos el asistente de GENIAL. Tu tarea es proponer el mapa de pantallas (de baja fidelidad, conceptual) y la navegacion entre ellas para un producto, a partir de su alcance de MVP y su especificacion de API ya aprobada.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "screens": [
    {
      "name": string,
      "purpose": string,
      "mainElements": [
        {
          "type": "list"|"form"|"field"|"button"|"text"|"image"|"nav",
          "label": string,
          "dataField": string|null,   // "Entidad.atributo" EXACTO del modelo de datos que te paso, o null
          "endpointRef": string|null  // "METODO /ruta" EXACTO de la API que te paso, o null
        }
      ],
      "visibleToRoles": ("owner"|"editor"|"viewer")[]  // que roles pueden ver esta pantalla
    }
  ],
  "navigation": [
    { "from": string, "to": string, "label": string }  // "from"/"to" son nombres de pantallas definidas arriba; "label" describe la accion que dispara la navegacion
  ]
}

Reglas (se validan por codigo despues, respetalas al pie de la letra):
- "dataField" tiene que ser EXACTAMENTE uno de los pares "Entidad.atributo" que te paso en el contexto, o null si el elemento no muestra/edita un dato puntual (ej. un titulo de pantalla o un boton de navegacion sin dato propio). No inventes campos que no existan.
- "endpointRef" tiene que ser EXACTAMENTE uno de los "METODO /ruta" que te paso en el contexto, o null si el elemento no dispara ninguna llamada. No inventes endpoints.
- Cada funcionalidad dentro del alcance del MVP tiene que estar representada en el proposito o los elementos de al menos una pantalla.
- No incluyas pantallas ni elementos para funcionalidades que estan explicitamente fuera del alcance del MVP.
- "from" y "to" en "navigation" tienen que ser EXACTAMENTE el "name" de alguna pantalla definida en "screens".
- Entre TODAS las pantallas, "visibleToRoles" tiene que cubrir los 3 roles (owner, editor, viewer) al menos una vez cada uno - no dejes ningun rol sin ninguna pantalla visible para el, ni uses un valor que no sea uno de esos 3.
- No agregues texto fuera del JSON.`;

function describeEntity(entity) {
  return (entity.attributes || []).map((attr) => `${entity.name}.${attr.name}`).join(', ');
}

function buildScreenMapUserContent({ mvpScope, entities, endpoints }) {
  const inScopeText = (mvpScope?.in || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const outScopeText = (mvpScope?.out || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const endpointsText =
    (endpoints || []).map((e) => `- ${e.method} ${e.path} (${e.resourceEntity}): ${e.description}`).join('\n') ||
    '(sin endpoints)';
  const dataFieldsText = (entities || []).map(describeEntity).filter(Boolean).join(', ') || '(sin entidades)';

  return `Funcionalidades dentro del alcance del MVP:
${inScopeText}

Funcionalidades fuera del alcance del MVP (no representar):
${outScopeText}

Campos disponibles del modelo de datos aprobado (usalos EXACTOS en "dataField"):
${dataFieldsText}

Especificacion de API aprobada (usala EXACTA en "endpointRef" como "METODO /ruta"):
${endpointsText}`;
}

module.exports = { SCREEN_MAP_SYSTEM_PROMPT, buildScreenMapUserContent };
