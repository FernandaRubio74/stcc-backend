/**
 * T-014.1 - Contrato estructurado sobre el cliente de IA: el proveedor
 * siempre debe devolver JSON con esta forma, sin importar la etapa del
 * wizard que este conduciendo la conversacion.
 */
const { z } = require('zod');
const { completeWithRetry } = require('./ai.client');
const { AiResponseValidationError } = require('./ai.errors');

const aiTurnResponseSchema = z.object({
  reply: z.string().min(1),
  stageComplete: z.boolean().default(false),
  blockingQuestions: z.array(z.string().min(1)).default([]),
  extracted: z.record(z.string(), z.unknown()).default({}),
});

/**
 * @param {{systemPrompt: string, messages: Array<{role: string, content: string}>, maxOutputTokens?: number}} params
 * @param {object} [deps] se reenvia tal cual a completeWithRetry (ver ai.client)
 */
async function requestStructuredTurn({ systemPrompt, messages, maxOutputTokens }, deps = {}) {
  const raw = await completeWithRetry({ systemPrompt, messages, maxOutputTokens }, deps);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiResponseValidationError('El proveedor de IA no devolvio JSON valido', {
      cause: err,
    });
  }

  const result = aiTurnResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseValidationError(
      'La respuesta de la IA no cumple el contrato esperado (reply/stageComplete/blockingQuestions/extracted)'
    );
  }

  return result.data;
}

module.exports = { requestStructuredTurn, aiTurnResponseSchema };
