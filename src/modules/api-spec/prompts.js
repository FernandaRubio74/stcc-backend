/**
 * T-023.1 - Prompt de generacion de la especificacion de API a partir del
 * modelo de datos ya aprobado (US-021). El prompt es la primera linea de
 * defensa para la coherencia endpoint-entidad y para distinguir 401 de 403;
 * coherence.js valida ambas cosas de forma deterministica igual.
 */
const API_SPEC_SYSTEM_PROMPT = `Sos el asistente de Ideator. Tu tarea es proponer la especificacion de la API REST necesaria para implementar el producto, a partir del modelo de datos ya aprobado.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "endpoints": [
    {
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "path": string,              // ej. "/projects/:projectId/tasks/:taskId"
      "description": string,
      "resourceEntity": string,    // nombre EXACTO de una entidad del modelo de datos provisto abajo
      "parameters": [ { "name": string, "in": "path"|"query"|"body", "type": string, "required": boolean, "description": string } ],
      "responses": [ { "status": number, "description": string } ]
    }
  ]
}

Reglas:
- "resourceEntity" tiene que ser exactamente el nombre de una de las entidades del modelo de datos provisto abajo. No inventes entidades nuevas.
- Todo endpoint requiere autenticacion: incluí siempre una respuesta 401 ("No autenticado") en "responses".
- Si el endpoint requiere un rol o permiso especifico (ej. solo el owner puede aprobar, solo owner/editor puede modificar), incluí ADEMAS una respuesta 403 ("No autorizado") distinta de la 401 — nunca combines autenticacion y autorizacion en un solo codigo.
- Incluí siempre al menos una respuesta de exito (200, 201 o 204) y, cuando aplique, 404 (recurso no encontrado) y 400 (datos invalidos).
- Los codigos de respuesta tienen que estar entre 200 y 500.
- Cubrí las operaciones CRUD basicas (listar, obtener, crear, actualizar, eliminar) para cada entidad relevante del modelo, salvo que no tenga sentido para el dominio.
- No agregues texto fuera del JSON.`;

function buildApiSpecUserContent(entities) {
  const entitiesText = (entities || [])
    .map((entity) => {
      const attrs = entity.attributes
        .map((attr) => {
          const tags = [attr.primaryKey && 'PK', attr.foreignKey && `FK -> ${attr.foreignKey.entity}.${attr.foreignKey.attribute}`]
            .filter(Boolean)
            .join(', ');
          return `${attr.name}: ${attr.type}${tags ? ` (${tags})` : ''}`;
        })
        .join(', ');
      return `- ${entity.name}: ${attrs}`;
    })
    .join('\n');

  return `Modelo de datos aprobado:\n${entitiesText || '(sin entidades)'}`;
}

module.exports = { API_SPEC_SYSTEM_PROMPT, buildApiSpecUserContent };
