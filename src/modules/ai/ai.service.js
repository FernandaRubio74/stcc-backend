/**
 * Capa de validacion sobre el cliente de IA: toda llamada a la IA en
 * Ideator devuelve JSON, pero la *forma* esperada depende de la tarea
 * (turno de wizard vs. generacion de un artefacto). `requestStructuredJson`
 * es el helper generico (parsear + validar con un schema de zod); las
 * tareas especificas (wizard, data-model, etc.) le pasan su propio schema.
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
 * @param {{systemPrompt: string, userContent: string, schema: import('zod').ZodType, maxOutputTokens?: number}} params
 * @param {object} [deps] se reenvia tal cual a completeWithRetry (ver ai.client)
 */
async function requestStructuredJson({ systemPrompt, userContent, schema, maxOutputTokens }, deps = {}) {
  const raw = await completeWithRetry(
    { systemPrompt, messages: [{ role: 'user', content: userContent }], maxOutputTokens },
    deps
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiResponseValidationError('El proveedor de IA no devolvio JSON valido', { cause: err });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseValidationError('La respuesta de la IA no cumple el contrato esperado para esta tarea');
  }

  return result.data;
}

/**
 * El wizard conversacional (US-015/016/017) necesita el historial completo
 * como mensajes, a diferencia de las tareas de un solo turno que usan
 * `requestStructuredJson` con un unico `userContent`. Por eso no reutiliza
 * ese helper: la forma de la llamada al cliente de IA es distinta.
 *
 * @param {{systemPrompt: string, messages: Array<{role: string, content: string}>, maxOutputTokens?: number}} params
 * @param {object} [deps] se reenvia tal cual a completeWithRetry (ver ai.client)
 */
async function requestStructuredTurn({ systemPrompt, messages, maxOutputTokens }, deps = {}) {
  const raw = await completeWithRetry({ systemPrompt, messages, maxOutputTokens }, deps);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiResponseValidationError('El proveedor de IA no devolvio JSON valido', { cause: err });
  }

  const result = aiTurnResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseValidationError(
      'La respuesta de la IA no cumple el contrato esperado (reply/stageComplete/blockingQuestions/extracted)'
    );
  }

  return result.data;
}

module.exports = { requestStructuredTurn, requestStructuredJson, aiTurnResponseSchema };
