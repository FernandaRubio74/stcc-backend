/**
 * T-014.1/T-014.2 - Cliente HTTP del proveedor de IA (Azure AI Foundry /
 * Azure OpenAI, superficie compatible con OpenAI v1) con timeout y
 * reintentos con backoff exponencial.
 *
 * Solo reintenta errores transitorios (timeout, 429, 5xx); un 4xx del
 * proveedor (ej. credenciales invalidas, payload rechazado) no se reintenta
 * porque reintentar no lo va a arreglar.
 */
const env = require('../../config/env');
const { AiTimeoutError, AiProviderError } = require('./ai.errors');

const DEFAULT_BASE_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestOnce({
  endpoint,
  apiKey,
  deployment,
  systemPrompt,
  messages,
  maxOutputTokens,
  timeoutMs,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        model: deployment,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_completion_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Nunca se loguea el body crudo: puede incluir fragmentos del prompt.
      throw new AiProviderError(`El proveedor de IA respondio con estado ${res.status}`, {
        retryable: res.status === 429 || res.status >= 500,
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiProviderError('El proveedor de IA respondio sin contenido');
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiTimeoutError();
    }
    if (err instanceof AiProviderError) {
      throw err;
    }
    throw new AiProviderError('Fallo de red al llamar al proveedor de IA', {
      cause: err,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{systemPrompt: string, messages: Array<{role: 'user'|'assistant', content: string}>, maxOutputTokens?: number}} params
 * @param {object} [deps] inyeccion para tests: fetch, sleep, endpoint, apiKey, deployment, timeoutMs, maxRetries
 * @returns {Promise<string>} el contenido crudo (string) devuelto por el modelo
 */
// gpt-5 es un modelo de razonamiento: consume tokens de "pensamiento" ocultos
// antes de emitir contenido visible, y ese consumo varia con la complejidad
// del prompt. Un budget bajo puede agotarse entero en razonamiento y dejar
// el contenido visible vacio (visto en pruebas manuales con 800 y 1200).
async function completeWithRetry({ systemPrompt, messages, maxOutputTokens = 4096 }, deps = {}) {
  const endpoint = deps.endpoint ?? env.ai.endpoint;
  const apiKey = deps.apiKey ?? env.ai.apiKey;
  const deployment = deps.deployment ?? env.ai.deployment;
  const timeoutMs = deps.timeoutMs ?? env.ai.timeoutMs;
  const maxRetries = deps.maxRetries ?? env.ai.maxRetries;
  const baseDelayMs = deps.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const fetchImpl = deps.fetch ?? fetch;
  const sleepImpl = deps.sleep ?? sleep;

  if (!endpoint || !apiKey || !deployment) {
    throw new AiProviderError(
      'Falta configuracion del proveedor de IA (AI_ENDPOINT / AI_PROVIDER_API_KEY / AI_DEPLOYMENT)'
    );
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await requestOnce({
        endpoint,
        apiKey,
        deployment,
        systemPrompt,
        messages,
        maxOutputTokens,
        timeoutMs,
        fetchImpl,
      });
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AiTimeoutError || err.retryable;
      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }
      await sleepImpl(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

module.exports = { completeWithRetry };
