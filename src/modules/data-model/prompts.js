/**
 * T-019.1 - Prompt de generacion del modelo fisico de base de datos a
 * partir de la definicion funcional ya recolectada por el wizard
 * (US-015/US-016: problema/contexto, usuarios objetivo, alcance del MVP,
 * user journey).
 */
const DATA_MODEL_SYSTEM_PROMPT = `Sos el asistente de Ideator. Tu tarea es proponer un modelo de base de datos relacional a partir del contexto funcional de un proyecto.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "entities": [
    {
      "name": string,
      "attributes": [
        {
          "name": string,
          "type": string,            // tipo generico: uuid, string, text, integer, decimal, boolean, timestamp
          "primaryKey": boolean,
          "unique": boolean,
          "nullable": boolean,
          "foreignKey": { "entity": string, "attribute": string } | null
        }
      ],
      "indexes": [ { "name": string, "attributes": string[], "unique": boolean } ]
    }
  ]
}

Reglas:
- Cada entidad debe tener exactamente un atributo con primaryKey=true.
- Modelá las relaciones entre entidades usando foreignKey (apuntando al nombre de la entidad y atributo referenciados), no como texto libre.
- El modelo tiene que ser coherente con los usuarios objetivo, las funcionalidades dentro del alcance del MVP y el recorrido principal descritos abajo. No incluyas entidades para funcionalidades que estan explicitamente fuera del alcance del MVP.
- No agregues texto fuera del JSON.`;

function buildDataModelUserContent({ problemSummary, targetUsers, mvpScope, userJourney }) {
  const targetUsersText = (targetUsers || [])
    .map((u) => `- ${u.label}: ${u.description}`)
    .join('\n') || '(no especificado)';
  const inScopeText = (mvpScope?.in || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const outScopeText = (mvpScope?.out || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';
  const journeyText = (userJourney || []).map((step, i) => `${i + 1}. ${step}`).join('\n') || '(no especificado)';

  return `Problema y contexto:
${problemSummary || '(no especificado)'}

Usuarios objetivo:
${targetUsersText}

Funcionalidades dentro del alcance del MVP:
${inScopeText}

Funcionalidades fuera del alcance del MVP (no modelar):
${outScopeText}

Recorrido principal (user journey):
${journeyText}`;
}

module.exports = { DATA_MODEL_SYSTEM_PROMPT, buildDataModelUserContent };
