/**
 * Bug real encontrado probando la app en el navegador (no en un mock): un
 * prompt con un ejemplo literal como "GET /pedidos/{id}" hacia que el ADK
 * interprete "{id}" como una variable de sesion a resolver (ver
 * injectSessionState en @google/adk/dist/cjs/agents/instructions.js) y
 * tirara `Context variable not found` al generar el plan de pruebas - un
 * 500 real en produccion. Este test corre contra el motor REAL de
 * instrucciones del ADK (solo se mockea el modelo Gemini, no
 * `instructions.js`), para probar que `runAgentTurn` neutraliza esto de
 * verdad y no solo en teoria.
 */
jest.mock('../../src/config/env', () => ({
  ai: {
    timeoutMs: 5000,
    maxRetries: 0,
    gemini: { model: 'gemini-env-default', apiKey: 'fake-key', vertexProject: undefined, vertexLocation: 'us-central1' },
  },
}));

jest.mock('@google/adk', () => {
  const actual = jest.requireActual('@google/adk');

  class FakeGemini extends actual.BaseLlm {
    constructor(config) {
      super({ model: config.model });
    }

    // eslint-disable-next-line require-yield
    async *generateContentAsync() {
      yield { content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' };
    }
  }

  return { ...actual, Gemini: FakeGemini };
});

const { runAgentTurn } = require('../../src/modules/ai/adk/runAgentTurn');

const PROMPT_WITH_LITERAL_BRACES =
  'Usa el formato EXACTO "METODO /ruta" (ej. "GET /pedidos/{id}"), nunca otro.';

test('un prompt con un ejemplo literal "{id}" no rompe la generacion (regresion del 500 real de Pruebas)', async () => {
  const result = await runAgentTurn(
    { name: 'test-agent', systemPrompt: PROMPT_WITH_LITERAL_BRACES, messages: [{ role: 'user', content: 'hola' }] },
    { provider: 'gemini' }
  );

  expect(result).toBe('{"ok":true}');
});

test('sigue funcionando igual para un prompt sin llaves (no cambia el comportamiento existente)', async () => {
  const result = await runAgentTurn(
    { name: 'test-agent', systemPrompt: 'Prompt sin llaves', messages: [{ role: 'user', content: 'hola' }] },
    { provider: 'gemini' }
  );

  expect(result).toBe('{"ok":true}');
});
