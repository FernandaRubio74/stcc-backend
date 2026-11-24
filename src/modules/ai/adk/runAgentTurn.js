/**
 * Orquestacion real de un turno de agente con el Google ADK: arma un
 * `LlmAgent`, lo corre con `Runner` + `InMemorySessionService`, y devuelve
 * el texto crudo que el modelo respondio (la validacion de que ese texto
 * sea el JSON esperado sigue siendo responsabilidad de ai.service.js, sin
 * cambios).
 *
 * El historial previo (si lo hay) se precarga como eventos de la sesion
 * ANTES del turno final, para que el agente reciba la conversacion
 * completa - no solo el ultimo mensaje - exactamente como lo necesita el
 * wizard (US-014 a US-017).
 *
 * Proveedor: Gemini es el modelo nativo del ADK (no necesita adaptador de
 * BaseLlm, a diferencia de Azure). Orden de preferencia en selectModel():
 * Vertex AI (GCP) > API key simple de Gemini > Azure como respaldo (la
 * cuota de Azure del profesor para este proyecto se agoto).
 */
const { Agent, Runner, InMemorySessionService, createEvent, Gemini } = require('@google/adk');
const env = require('../../../config/env');
const { AzureFoundryLlm } = require('./azureFoundryLlm');
const { AiProviderError, AiTimeoutError } = require('../ai.errors');

// Codigos de error que tiene sentido reintentar (limite de cuota/transitorio
// del lado del proveedor); todo lo demas (ej. 403 por facturacion
// deshabilitada, 400 por request mal formado) no se arregla reintentando.
const RETRYABLE_ERROR_CODES = new Set(['429', '500', '502', '503', '504']);

const APP_NAME = 'genial';
const DEFAULT_BASE_DELAY_MS = 300;
// Margen fijo sobre la suma de timeouts por intento, para que el reloj
// global no corte justo cuando el ultimo intento legitimo iba a responder.
const HARD_DEADLINE_BUFFER_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// `deps.provider` fuerza un proveedor especifico (lo usan los tests, que
// inyectan un `fetch` falso con forma de respuesta de Azure vía `deps` y
// necesitan que esa inyeccion se respete sin importar que credenciales de
// Google haya configuradas en el .env del proceso que corre los tests).
// Sin esa senal explicita: Vertex AI si hay GOOGLE_CLOUD_PROJECT, si no
// Gemini via API key si esta esa, si no Azure. Este chequeo tiene que mirar
// `deps` ADEMAS de `env.ai.gemini` (no solo env): un test real encontro que,
// si solo se miraba env aca pero despues SI se usaba `deps.vertexProject` /
// `deps.geminiApiKey` para construir el modelo (ver mas abajo), inyectar
// esas credenciales por deps sin ademas fijar `deps.provider` no tenia
// ningun efecto - la decision de que proveedor usar y los datos para
// construirlo quedaban desincronizados entre si.
// El camino de Azure (AzureFoundryLlm -> completeWithRetry) ya valida su
// configuracion temprano y con un mensaje claro si falta algo (ver
// ai.client.js). Los caminos nativos de Gemini/Vertex no tenian el mismo
// chequeo: si faltaba GEMINI_API_KEY o GOOGLE_CLOUD_PROJECT, el error real
// lo tiraba el SDK de Google recien al intentar generar contenido, con un
// mensaje generico que no dice que variable de entorno falta. Validar aca,
// ANTES de construir el modelo, tiene ademas una ventaja sobre el camino de
// Azure: al tirar la excepcion antes de que exista un Runner, no pasa por
// el event loop del ADK (que convierte las excepciones de un BaseLlm propio
// en un evento generico "UNKNOWN_ERROR", perdiendo el mensaje especifico).
function selectModel({ maxOutputTokens, deps }) {
  const { gemini } = env.ai;
  const hasVertexProject = Boolean(deps.vertexProject || gemini.vertexProject);
  const hasGeminiApiKey = Boolean(deps.geminiApiKey || gemini.apiKey);
  const provider = deps.provider || (hasVertexProject ? 'vertex' : hasGeminiApiKey ? 'gemini' : 'azure');

  if (provider === 'vertex') {
    const project = deps.vertexProject || gemini.vertexProject;
    if (!project) {
      throw new AiProviderError('Falta configuracion de Vertex AI (GOOGLE_CLOUD_PROJECT)');
    }
    return new Gemini({
      model: deps.geminiModel || gemini.model,
      vertexai: true,
      project,
      location: deps.vertexLocation || gemini.vertexLocation,
    });
  }
  if (provider === 'gemini') {
    const apiKey = deps.geminiApiKey || gemini.apiKey;
    if (!apiKey) {
      throw new AiProviderError('Falta configuracion de Gemini (GEMINI_API_KEY)');
    }
    return new Gemini({ model: deps.geminiModel || gemini.model, apiKey });
  }
  return new AzureFoundryLlm({ maxOutputTokens, deps });
}

// Bug real encontrado probando la app en el navegador: el ADK interpreta
// CUALQUIER "{algo}" dentro de la instruccion del agente como una variable
// de sesion a resolver (ver injectSessionState en
// node_modules/@google/adk/dist/cjs/agents/instructions.js) y tira
// `Context variable not found` si no existe - rompia la generacion del
// plan de pruebas porque su prompt tenia el ejemplo literal "GET
// /pedidos/{id}". Nuestros prompts nunca usan esa feature (siempre
// interpolamos los datos reales nosotros mismos antes de armar el string),
// asi que se neutraliza aca UNA sola vez con el escape que el propio motor
// reconoce (`\{` no dispara el patron), en vez de confiar en que ningun
// prompt futuro vuelva a usar "{algo}" en un texto de ejemplo.
function escapeInstructionBraces(text) {
  return text.replace(/\{/g, '\\{');
}

function toContent(message) {
  return { role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] };
}

function extractText(event) {
  return (event?.content?.parts || []).map((part) => part.text || '').join('');
}

async function consumeRunnerEvents(runner, { userId, sessionId, newMessage, abortSignal }) {
  let finalText = '';
  for await (const event of runner.runAsync({ userId, sessionId, newMessage, abortSignal })) {
    // Un evento de error (ej. "403: facturacion deshabilitada en el
    // proyecto") no tira una excepcion por si solo - queda en el evento. Sin
    // este chequeo, el motivo real se pierde y lo unico que ve quien llama
    // es "el proveedor de IA no devolvio JSON valido", que no dice nada.
    if (event.errorCode || event.errorMessage) {
      throw new AiProviderError(event.errorMessage || `El proveedor de IA devolvio el error ${event.errorCode}`, {
        retryable: RETRYABLE_ERROR_CODES.has(String(event.errorCode)),
      });
    }
    const text = extractText(event);
    if (text) finalText = text;
  }
  return finalText;
}

async function runAgentTurnOnce({ name, systemPrompt, messages, maxOutputTokens }, deps = {}) {
  const model = selectModel({ maxOutputTokens, deps });
  const agent = new Agent({
    name,
    model,
    instruction: escapeInstructionBraces(systemPrompt),
    // Fuerza JSON valido en Gemini (equivalente al response_format:
    // json_object que ya usa Azure dentro de ai.client.js); AzureFoundryLlm
    // ignora este campo, asi que es inocuo para ese camino.
    generateContentConfig: { responseMimeType: 'application/json' },
  });

  const sessionService = new InMemorySessionService();
  const userId = 'genial-system';
  const session = await sessionService.createSession({ appName: APP_NAME, userId });

  // `messages` vacio es un caso valido del contrato (ver ai.service.test.js):
  // sin historial y sin turno nuevo, se corre el agente igual con un
  // mensaje de usuario vacio, para no cambiar ese comportamiento preexistente.
  const history = messages && messages.length > 1 ? messages.slice(0, -1) : [];
  const currentTurn = messages && messages.length > 0 ? messages[messages.length - 1] : { role: 'user', content: '' };

  for (const message of history) {
    const author = message.role === 'assistant' ? name : 'user';
    await sessionService.appendEvent({ session, event: createEvent({ author, content: toContent(message) }) });
  }

  const runner = new Runner({ appName: APP_NAME, agent, sessionService });

  // El camino de Azure ya tenia timeout propio (AbortController dentro de
  // ai.client.js); el camino nativo de Gemini/Vertex no tenia ninguno - se
  // vio en pruebas manuales reales: una llamada se quedo colgada varios
  // minutos sin resolver ni rechazar nunca, bloqueando tambien el
  // reintento (no hay nada que reintentar si la promesa nunca termina). Se
  // usa un Promise.race en vez de confiar solo en que el SDK honre
  // abortSignal, para garantizar el limite sin importar como responda el
  // proveedor ante el abort.
  const timeoutMs = deps.timeoutMs ?? env.ai.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      consumeRunnerEvents(runner, {
        userId,
        sessionId: session.id,
        newMessage: toContent(currentTurn),
        abortSignal: controller.signal,
      }),
      new Promise((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new AiTimeoutError()));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{name: string, systemPrompt: string, messages: Array<{role: 'user'|'assistant', content: string}>, maxOutputTokens?: number}} params
 *   `messages` sigue la misma convencion que ya usaba ai.client.js: el
 *   ultimo elemento es el turno nuevo, los anteriores son el historial.
 * @param {object} [deps] se reenvia a AzureFoundryLlm -> completeWithRetry
 *   (inyeccion de `fetch` para tests, igual que antes de esta migracion).
 *   El reintento de ESTE nivel (el del agente) usa sus propias claves -
 *   `agentMaxRetries`/`agentBaseDelayMs`/`sleep` - a proposito distintas de
 *   `maxRetries` (que ya significaba "reintentos dentro de ai.client.js"):
 *   si compartieran el nombre, un test o una config que ajuste uno
 *   terminaria pisando el otro sin darse cuenta.
 *
 * El camino de Azure ya reintentaba errores transitorios (429/5xx) dentro
 * de ai.client.js; el camino nativo de Gemini no tenia ese reintento (se
 * vio en pruebas manuales reales: Gemini devuelve 503 "high demand" con el
 * lanzamiento de un modelo nuevo, y sin reintento eso se le mostraba al
 * usuario como un fallo total en vez de resolverse solo en el segundo intento).
 */
async function runAgentTurnWithRetries(params, deps) {
  const maxRetries = deps.agentMaxRetries ?? env.ai.maxRetries;
  const baseDelayMs = deps.agentBaseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleepImpl = deps.sleep ?? sleep;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {

      return await runAgentTurnOnce(params, deps);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AiTimeoutError || (err instanceof AiProviderError && err.retryable);
      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }

      await sleepImpl(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * El timeout de `runAgentTurnOnce` depende de que el SDK respete
 * `abortSignal` para cortar la llamada real al proveedor - visto en
 * pruebas manuales reales: para el camino de Azure esto es confiable
 * (`fetch` nativo SI corta la conexion con `AbortController`), pero para el
 * camino nativo de Gemini/Vertex el ADK solo CHEQUEA `abortSignal.aborted`
 * en puntos especificos de su propio loop interno (ver
 * `node_modules/@google/adk/dist/cjs/runner/runner.js`) - no es garantia de
 * que la llamada de red subyacente se cancele de verdad. Una vez (en
 * pruebas manuales reales) una generacion se quedo colgada mas de 20
 * minutos a pesar del timeout por intento de 90s configurado, señal de que
 * ese camino de cancelacion cooperativa fallo para esa llamada puntual.
 *
 * Este reloj GLOBAL es una segunda capa de defensa independiente de ese
 * mecanismo: un `Promise.race` con un `setTimeout` propio (el mismo patron
 * ya probado para el timeout por intento), que cubre la suma de TODOS los
 * intentos+reintentos. Si el mecanismo cooperativo de abort falla para
 * cualquier intento, este reloj global igual acota cuanto puede esperar
 * quien llamo, en vez de heredar un cuelgue sin limite.
 */
async function runAgentTurn(params, deps = {}) {
  const maxRetries = deps.agentMaxRetries ?? env.ai.maxRetries;
  const perAttemptTimeoutMs = deps.timeoutMs ?? env.ai.timeoutMs;
  const hardDeadlineMs = deps.hardDeadlineMs ?? perAttemptTimeoutMs * (maxRetries + 1) + HARD_DEADLINE_BUFFER_MS;

  let hardTimer;
  const hardDeadline = new Promise((_resolve, reject) => {
    hardTimer = setTimeout(() => reject(new AiTimeoutError()), hardDeadlineMs);
  });

  try {
    return await Promise.race([runAgentTurnWithRetries(params, deps), hardDeadline]);
  } finally {
    clearTimeout(hardTimer);
  }
}

module.exports = { runAgentTurn };
