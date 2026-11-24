/**
 * Cobertura directa del adaptador de Azure AI Foundry al Google ADK
 * (`BaseLlm` -> `completeWithRetry`). Hasta ahora esta clase solo se
 * probaba indirectamente a traves de adk.runAgentTurn.test.js (un turno
 * completo con Agent+Runner+InMemorySessionService) - util para probar la
 * integracion end-to-end, pero no aisla la logica propia del adaptador
 * (conversion de roles Gemini<->OpenAI, aplanado de systemInstruction en
 * sus 3 formas posibles, filtrado de contenido vacio) de la del Runner.
 */
const { AzureFoundryLlm } = require('../../src/modules/ai/adk/azureFoundryLlm');

async function collect(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

jest.mock('../../src/modules/ai/ai.client', () => ({
  completeWithRetry: jest.fn(),
}));
const { completeWithRetry } = require('../../src/modules/ai/ai.client');

describe('AzureFoundryLlm', () => {
  beforeEach(() => {
    completeWithRetry.mockReset();
  });

  test('convierte roles Gemini (user/model) a los de ai.client (user/assistant)', async () => {
    completeWithRetry.mockResolvedValue('respuesta');
    const llm = new AzureFoundryLlm({});

    await collect(
      llm.generateContentAsync({
        contents: [
          { role: 'user', parts: [{ text: 'hola' }] },
          { role: 'model', parts: [{ text: 'como te puedo ayudar' }] },
        ],
        config: {},
      }),
    );

    expect(completeWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: 'como te puedo ayudar' },
        ],
      }),
      expect.any(Object),
    );
  });

  test('concatena multiples parts de un mismo content en un solo texto', async () => {
    completeWithRetry.mockResolvedValue('ok');
    const llm = new AzureFoundryLlm({});

    await collect(
      llm.generateContentAsync({
        contents: [{ role: 'user', parts: [{ text: 'primera parte ' }, { text: 'segunda parte' }] }],
        config: {},
      }),
    );

    expect(completeWithRetry.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'primera parte segunda parte' },
    ]);
  });

  test('descarta contents sin texto (ej. llamadas a funcion no soportadas aca)', async () => {
    completeWithRetry.mockResolvedValue('ok');
    const llm = new AzureFoundryLlm({});

    await collect(
      llm.generateContentAsync({
        contents: [
          { role: 'user', parts: [{ text: '' }] },
          { role: 'user', parts: [{ text: 'mensaje real' }] },
        ],
        config: {},
      }),
    );

    expect(completeWithRetry.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'mensaje real' }]);
  });

  test.each([
    ['string plano', 'sos un asistente', 'sos un asistente'],
    ['objeto con parts', { parts: [{ text: 'parte 1' }, { text: 'parte 2' }] }, 'parte 1parte 2'],
    ['array de strings', ['linea 1', 'linea 2'], 'linea 1\nlinea 2'],
  ])('aplana systemInstruction en formato %s', async (_label, systemInstruction, expectedPrompt) => {
    completeWithRetry.mockResolvedValue('ok');
    const llm = new AzureFoundryLlm({});

    await collect(
      llm.generateContentAsync({ contents: [], config: { systemInstruction } }),
    );

    expect(completeWithRetry.mock.calls[0][0].systemPrompt).toBe(expectedPrompt);
  });

  test('systemInstruction ausente se convierte en string vacio, no en un crash', async () => {
    completeWithRetry.mockResolvedValue('ok');
    const llm = new AzureFoundryLlm({});

    await collect(llm.generateContentAsync({ contents: [], config: {} }));

    expect(completeWithRetry.mock.calls[0][0].systemPrompt).toBe('');
  });

  test('reenvia maxOutputTokens y deps tal cual a completeWithRetry', async () => {
    completeWithRetry.mockResolvedValue('ok');
    const deps = { fetch: jest.fn() };
    const llm = new AzureFoundryLlm({ maxOutputTokens: 999, deps });

    await collect(llm.generateContentAsync({ contents: [], config: {} }));

    expect(completeWithRetry).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 999 }), deps);
  });

  test('produce exactamente un evento STOP con el texto devuelto por completeWithRetry', async () => {
    completeWithRetry.mockResolvedValue('contenido final');
    const llm = new AzureFoundryLlm({});

    const events = await collect(llm.generateContentAsync({ contents: [], config: {} }));

    expect(events).toEqual([
      { content: { role: 'model', parts: [{ text: 'contenido final' }] }, finishReason: 'STOP' },
    ]);
  });

  test('propaga el error de completeWithRetry (ej. AiTimeoutError) sin envolverlo', async () => {
    const boom = new Error('fallo de red');
    completeWithRetry.mockRejectedValue(boom);
    const llm = new AzureFoundryLlm({});

    await expect(collect(llm.generateContentAsync({ contents: [], config: {} }))).rejects.toThrow('fallo de red');
  });

  test('connect() no esta soportado (sin modo streaming/live)', async () => {
    const llm = new AzureFoundryLlm({});

    await expect(llm.connect()).rejects.toThrow(/no soporta conexiones live/);
  });
});
