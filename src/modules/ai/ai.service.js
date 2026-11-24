/**
 * Capa de validacion sobre el cliente de IA: toda llamada a la IA en
 * GENIAL devuelve JSON, pero la *forma* esperada depende de la tarea
 * (turno de wizard vs. generacion de un artefacto). `requestStructuredJson`
 * es el helper generico (parsear + validar con un schema de zod); las
 * tareas especificas (wizard, data-model, etc.) le pasan su propio schema.
 *
 * La llamada en si ya no le pega directo a completeWithRetry: pasa por un
 * agente real del Google ADK (ver adk/runAgentTurn.js), que corre sobre un
 * adaptador de Azure AI Foundry (adk/azureFoundryLlm.js). El contrato hacia
 * afuera de este modulo (firma de las funciones, validacion con zod, tipos
 * de error) no cambia - lo unico que cambia es que la orquestacion del
 * turno ahora la maneja el framework de agentes en vez de un fetch directo.
 */
const { z } = require('zod');
const { runAgentTurn } = require('./adk/runAgentTurn');
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
  const raw = await runAgentTurn(
    {
      name: 'genial-structured-task-agent',
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxOutputTokens,
    },
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
  const raw = await runAgentTurn({ name: 'genial-wizard-agent', systemPrompt, messages, maxOutputTokens }, deps);

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

const suggestionsResponseSchema = z.object({
  suggestions: z.array(z.string().min(1)).max(5).default([]),
});

/**
 * Agente de sugerencias (US de UX del wizard): separado del agente que
 * conduce la conversacion (`genial-wizard-agent`) y del generico de
 * tareas de un solo artefacto (`genial-structured-task-agent`) - tiene su
 * propio nombre de agente a proposito, para que quede claro en los logs
 * del ADK que es un agente distinto coordinandose con el principal, no el
 * mismo agente reutilizado para dos cosas.
 *
 * @param {{systemPrompt: string, userContent: string, maxOutputTokens?: number}} params
 * @param {object} [deps] se reenvia tal cual a runAgentTurn
 */
async function requestSuggestions({ systemPrompt, userContent, maxOutputTokens }, deps = {}) {
  const raw = await runAgentTurn(
    {
      name: 'genial-suggestion-agent',
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxOutputTokens,
    },
    deps
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AiResponseValidationError('El agente de sugerencias no devolvio JSON valido', { cause: err });
  }

  const result = suggestionsResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiResponseValidationError('La respuesta del agente de sugerencias no cumple el contrato esperado');
  }

  return result.data.suggestions;
}

module.exports = {
  requestStructuredTurn,
  requestStructuredJson,
  requestSuggestions,
  aiTurnResponseSchema,
};
