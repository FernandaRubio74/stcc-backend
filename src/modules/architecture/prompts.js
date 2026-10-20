/**
 * T-028.2 - Prompt de recomendacion de arquitectura: la IA elige entre el
 * catalogo fijo (catalog.js), nunca inventa una opcion nueva.
 */
const { z } = require('zod');

const ARCHITECTURE_SYSTEM_PROMPT = `Sos el asistente de Ideator. Tu tarea es recomendar, de un catalogo FIJO de escenarios de arquitectura tecnologica, el mas apropiado para el producto definido, y justificar tu eleccion.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "recommendedId": string,   // EXACTAMENTE el "id" de uno de los escenarios del catalogo provisto abajo
  "justification": string    // por que esa opcion es apropiada para este proyecto en particular
}

Reglas:
- "recommendedId" tiene que ser exactamente el id de una de las opciones del catalogo. No inventes opciones nuevas ni modifiques los ids.
- La justificacion tiene que basarse en las necesidades concretas de este proyecto (alcance del MVP, volumen y complejidad del modelo de datos y de la API), no en generalidades aplicables a cualquier producto.
- No agregues texto fuera del JSON.`;

const aiArchitectureRecommendationSchema = z.object({
  recommendedId: z.string().min(1),
  justification: z.string().min(1),
});

function buildArchitectureUserContent({ problemSummary, mvpScope, entityNames, endpointCount, catalog }) {
  const catalogText = catalog.map((scenario) => `- ${scenario.id} (${scenario.name}): ${scenario.summary}`).join('\n');
  const inScopeText = (mvpScope?.in || []).map((f) => `- ${f}`).join('\n') || '(no especificado)';

  return `Catalogo de arquitecturas disponibles:
${catalogText}

Problema y contexto del proyecto:
${problemSummary || '(no especificado)'}

Funcionalidades dentro del alcance del MVP:
${inScopeText}

Entidades del modelo de datos aprobado: ${entityNames.join(', ') || '(ninguna)'}
Cantidad de endpoints en la especificacion de API aprobada: ${endpointCount}`;
}

module.exports = { ARCHITECTURE_SYSTEM_PROMPT, aiArchitectureRecommendationSchema, buildArchitectureUserContent };
