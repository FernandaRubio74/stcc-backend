/**
 * Reproduce en un test el incidente real visto en pruebas manuales: una
 * generacion con el camino nativo de Gemini se quedo colgada mas de 20
 * minutos a pesar de tener un timeout por intento de 90s configurado. La
 * causa raiz: el ADK solo CHEQUEA `abortSignal.aborted` de forma
 * cooperativa en puntos especificos de su loop interno (ver
 * node_modules/@google/adk/dist/cjs/runner/runner.js) - no cancela de
 * verdad la llamada de red subyacente. El timeout por intento de
 * runAgentTurnOnce (adk.selectModel.test.js / adk.runAgentTurn.test.js) ya
 * esta probado para el camino de Azure (fetch nativo SI corta la conexion
 * con AbortController), pero nunca para el camino nativo de Gemini - este
 * archivo cubre justamente ese punto ciego, mockeando un modelo que ignora
 * el abortSignal por completo (la peor situacion posible, igual que la
 * vista en vivo).
 */
jest.mock('@google/adk', () => {
  const actual = jest.requireActual('@google/adk');

  class NeverRespondingGemini extends actual.BaseLlm {
    constructor(config) {
      super({ model: config.model });
    }

    // eslint-disable-next-line require-yield
    async *generateContentAsync() {
      // Ignora el abortSignal a proposito: es exactamente el escenario real
      // en el que el mecanismo cooperativo del ADK no corta la llamada.
      await new Promise(() => {});
    }
  }

  return { ...actual, Gemini: NeverRespondingGemini };
});

const { runAgentTurn } = require('../../src/modules/ai/adk/runAgentTurn');
const { AiTimeoutError } = require('../../src/modules/ai/ai.errors');

const BASE_PARAMS = { name: 'test-agent', systemPrompt: 's', messages: [{ role: 'user', content: 'u' }] };

describe('runAgentTurn - reloj global independiente del abort cooperativo del ADK', () => {
  test('no se cuelga para siempre si el modelo ignora el abortSignal: el reloj global corta la espera', async () => {
    const start = Date.now();

    await expect(
      runAgentTurn(BASE_PARAMS, {
        provider: 'gemini',
        geminiApiKey: 'fake-key',
        timeoutMs: 50,
        agentMaxRetries: 1,
        agentBaseDelayMs: 1,
        hardDeadlineMs: 300,
      })
    ).rejects.toThrow(AiTimeoutError);

    // La garantia real: acota la espera a un numero chico y conocido de
    // milisegundos, no a "lo que tarde el proveedor en algun momento".
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test('el reloj global por defecto se deriva de timeoutMs y agentMaxRetries (no hace falta pasarlo a mano)', async () => {
    const start = Date.now();

    await expect(
      runAgentTurn(BASE_PARAMS, {
        provider: 'gemini',
        geminiApiKey: 'fake-key',
        timeoutMs: 50,
        agentMaxRetries: 0,
        // sin hardDeadlineMs explicito: tiene que calcularse solo y seguir acotando.
      })
    ).rejects.toThrow(AiTimeoutError);

    expect(Date.now() - start).toBeLessThan(3000);
  });
});
