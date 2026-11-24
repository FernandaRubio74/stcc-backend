/**
 * Cobertura de `selectModel` (adk/runAgentTurn.js): decide entre Vertex AI,
 * Gemini por API key, o Azure como respaldo, segun la configuracion real
 * (env.ai.gemini) o una señal explicita (`deps.provider`, que usan los
 * tests y el propio frontend de diagnostico). Hasta ahora esta logica
 * corria sin ningun test directo - el resto de la suite de ADK siempre fuerza
 * `deps.provider: 'azure'`, asi que un error de precedencia entre
 * Vertex/Gemini/Azure podia pasar desapercibido (fue, de hecho, la fuente de
 * varias horas de diagnostico manual real durante la migracion a GCP).
 *
 * `env.js` se mockea por completo (en vez de depender del .env real del
 * proceso) para que estos tests sean deterministas sin importar que
 * credenciales de Google esten configuradas en la maquina donde corren.
 */
jest.mock('../../src/config/env', () => ({
  ai: {
    timeoutMs: 5000,
    maxRetries: 0,
    gemini: {
      model: 'gemini-env-default',
      apiKey: undefined,
      vertexProject: undefined,
      vertexLocation: 'us-central1',
    },
  },
}));

jest.mock('@google/adk', () => {
  const actual = jest.requireActual('@google/adk');

  class FakeGemini extends actual.BaseLlm {
    constructor(config) {
      super({ model: config.model });
      FakeGemini.lastConfig = config;
    }

    // eslint-disable-next-line require-yield
    async *generateContentAsync() {
      yield { content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' };
    }
  }
  FakeGemini.lastConfig = null;

  return { ...actual, Gemini: FakeGemini };
});

const { Gemini } = require('@google/adk');
const env = require('../../src/config/env');
const { runAgentTurn } = require('../../src/modules/ai/adk/runAgentTurn');
const { AiProviderError } = require('../../src/modules/ai/ai.errors');

function fetchCapturing(content) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
}

const BASE_PARAMS = { name: 'test-agent', systemPrompt: 's', messages: [{ role: 'user', content: 'u' }] };

beforeEach(() => {
  Gemini.lastConfig = null;
  env.ai.gemini.apiKey = undefined;
  env.ai.gemini.vertexProject = undefined;
});

describe('selectModel - precedencia Vertex > Gemini API key > Azure', () => {
  test('usa Vertex AI cuando hay un project configurado, sin señal explicita de deps.provider', async () => {
    await runAgentTurn(BASE_PARAMS, { vertexProject: 'proj-genial', vertexLocation: 'us-east1' });

    expect(Gemini.lastConfig).toMatchObject({
      vertexai: true,
      project: 'proj-genial',
      location: 'us-east1',
      model: 'gemini-env-default',
    });
  });

  test('usa Gemini por API key cuando no hay project de Vertex pero si una api key', async () => {
    await runAgentTurn(BASE_PARAMS, { geminiApiKey: 'fake-key', geminiModel: 'gemini-custom' });

    expect(Gemini.lastConfig).toMatchObject({ apiKey: 'fake-key', model: 'gemini-custom' });
    expect(Gemini.lastConfig.vertexai).toBeUndefined();
  });

  test('cae a Azure cuando no hay ni project de Vertex ni api key de Gemini', async () => {
    const fetchImpl = fetchCapturing('{"ok":true}');

    const result = await runAgentTurn(BASE_PARAMS, {
      endpoint: 'https://fake.openai.azure.com/openai/v1',
      apiKey: 'fake-azure-key',
      deployment: 'gpt-5',
      fetch: fetchImpl,
    });

    expect(result).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Gemini.lastConfig).toBeNull();
  });

  test('deps.provider explicito pisa la precedencia automatica, incluso con un project de Vertex configurado', async () => {
    const fetchImpl = fetchCapturing('{"ok":true}');

    await runAgentTurn(BASE_PARAMS, {
      provider: 'azure',
      endpoint: 'https://fake.openai.azure.com/openai/v1',
      apiKey: 'fake-azure-key',
      deployment: 'gpt-5',
      fetch: fetchImpl,
      // Si la precedencia automatica ganara sobre el override explicito,
      // esto haria que se usara Vertex en vez de Azure.
      vertexProject: 'deberia-ser-ignorado',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Gemini.lastConfig).toBeNull();
  });
});

describe('selectModel - validacion temprana de configuracion', () => {
  test('provider "vertex" sin GOOGLE_CLOUD_PROJECT tira un error claro sin intentar construir el modelo', async () => {
    await expect(runAgentTurn(BASE_PARAMS, { provider: 'vertex' })).rejects.toThrow(AiProviderError);
    await expect(runAgentTurn(BASE_PARAMS, { provider: 'vertex' })).rejects.toThrow(/GOOGLE_CLOUD_PROJECT/);

    expect(Gemini.lastConfig).toBeNull();
  });

  test('provider "gemini" sin GEMINI_API_KEY tira un error claro sin intentar construir el modelo', async () => {
    await expect(runAgentTurn(BASE_PARAMS, { provider: 'gemini' })).rejects.toThrow(AiProviderError);
    await expect(runAgentTurn(BASE_PARAMS, { provider: 'gemini' })).rejects.toThrow(/GEMINI_API_KEY/);

    expect(Gemini.lastConfig).toBeNull();
  });

  test('un error de configuracion no es retryable: no reintenta aunque agentMaxRetries > 0', async () => {
    const sleepImpl = jest.fn();

    await expect(
      runAgentTurn(BASE_PARAMS, { provider: 'gemini', agentMaxRetries: 3, sleep: sleepImpl }),
    ).rejects.toThrow(AiProviderError);

    expect(sleepImpl).not.toHaveBeenCalled();
  });
});
