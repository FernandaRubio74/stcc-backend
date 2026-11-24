/**
 * Mensaje y registro unificados para las fallas de IA.
 *
 * Los 8 puntos donde una etapa llama a la IA atrapaban `AiTimeoutError`,
 * `AiProviderError` y `AiResponseValidationError` para devolver un 500 con
 * un mensaje generico, pero **sin registrar nada**. El manejador global de
 * `app.js` si loguea, solo que estos errores nunca llegan ahi: los atrapa el
 * controller antes. Resultado: en los logs del servidor desplegado no queda
 * mas que la linea del request-logger con status 500, y las tres causas
 * posibles (se corto por timeout / el proveedor rechazo la llamada / el
 * modelo devolvio algo que no cumple el contrato) son indistinguibles.
 *
 * Eso dejaba sin forma de diagnosticar "la IA no responde" en produccion.
 *
 * El mensaje al usuario NO cambia: sigue siendo el mismo texto y el mismo
 * status, a proposito. Lo que se agrega es la linea de log del lado del
 * servidor, con la causa real.
 */
const { logger } = require('../../common/utils/logger');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('./ai.errors');

const AI_UNAVAILABLE_MESSAGE = 'El asistente de IA no esta disponible en este momento, intenta de nuevo';

// Los mensajes de error de los SDKs de Google a veces incluyen la URL de la
// llamada, y esa URL puede llevar la API key como query param. El logger
// redacta por *nombre* de clave, lo que no alcanza para un secreto embutido
// dentro de un string, asi que se limpia explicitamente aca.
const SECRET_IN_TEXT = /([?&](?:key|api_?key|access_token)=)[^&\s"']+/gi;

function scrub(text) {
  return String(text).replace(SECRET_IN_TEXT, '$1[redactado]');
}

/** @returns {boolean} si el error es una falla de IA (y no un error de negocio). */
function isAiFailure(err) {
  return (
    err instanceof AiTimeoutError || err instanceof AiProviderError || err instanceof AiResponseValidationError
  );
}

/**
 * Registra la causa real de una falla de IA.
 *
 * @param {Error} err el error atrapado
 * @param {{stage: string, action: string, projectId?: string}} context que etapa y
 *   que accion lo produjeron, para poder ubicarlo entre varias llamadas a la IA
 */
function logAiFailure(err, context = {}) {
  logger.error('ai_failure', {
    ...context,
    kind: err?.constructor?.name,
    detail: scrub(err?.message ?? ''),
    // `retryable` solo lo trae AiProviderError (lo setea runAgentTurn segun el
    // codigo de error del proveedor): distingue un 429 de cuota de un 400 por
    // request mal formado.
    retryable: err?.retryable,
    cause: err?.cause ? scrub(err.cause.message ?? err.cause).slice(0, 500) : undefined,
  });
}

module.exports = { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure, scrub };
