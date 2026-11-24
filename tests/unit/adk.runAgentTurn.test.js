/**
 * Prueba que el agente de ADK realmente corre (LlmAgent + Runner +
 * InMemorySessionService) contra nuestro adaptador de Azure AI Foundry, y
 * que el historial previo llega completo al modelo - no solo el ultimo
 * mensaje - que es el requisito real del wizard.
 */
const { runAgentTurn } = require('../../src/modules/ai/adk/runAgentTurn');
const { AiTimeoutError, AiProviderError } = require('../../src/modules/ai/ai.errors');

const DEPS = {
  provider: 'azure',
  endpoint: 'https://fake.openai.azure.com/openai/v1',
  apiKey: 'fake-key',
  deployment: 'gpt-5',
  timeoutMs: 50,
  maxRetries: 0,
};

function fetchCapturing(content) {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
  return fn;
}

describe('runAgentTurn (Google ADK)', () => {
  test('corre un turno simple y devuelve el texto del modelo', async () => {
    const fetchImpl = fetchCapturing('{"ok":true}');

    const result = await runAgentTurn(
      { name: 'ideator-test-agent', systemPrompt: 'sos un asistente de prueba', messages: [{ role: 'user', content: 'hola' }] },
      { ...DEPS, fetch: fetchImpl },
    );

    expect(result).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('el historial previo llega al modelo como mensajes separados, no aplastado en uno solo', async () => {
    const fetchImpl = fetchCapturing('{"reply":"listo"}');

    await runAgentTurn(
      {
        name: 'ideator-wizard-agent',
        systemPrompt: 'sistema',
        messages: [
          { role: 'user', content: 'primer mensaje del usuario' },
          { role: 'assistant', content: 'primera respuesta del asistente' },
          { role: 'user', content: 'segundo mensaje del usuario' },
        ],
      },
      { ...DEPS, fetch: fetchImpl },
    );

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const roles = requestBody.messages.map((m) => m.role);
    const contents = requestBody.messages.map((m) => m.content);

    // El primer elemento de requestBody.messages es el system prompt (lo
    // agrega ai.client.js); el ADK le antepone de forma automatica una
    // frase de identidad del agente ("You are an agent...") antes de
    // nuestro texto, por eso se verifica con "contains" y no con igualdad
    // exacta. Lo que importa de verdad aca es esto: los 3 turnos de
    // historial llegan COMPLETOS y en el rol correcto, no aplastados en
    // un solo mensaje.
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(contents[0]).toContain('sistema');
    expect(contents.slice(1)).toEqual([
      'primer mensaje del usuario',
      'primera respuesta del asistente',
      'segundo mensaje del usuario',
    ]);
  });

  test('reenvia maxOutputTokens hasta el request real', async () => {
    const fetchImpl = fetchCapturing('{}');

    await runAgentTurn(
      { name: 'a', systemPrompt: 's', messages: [{ role: 'user', content: 'u' }], maxOutputTokens: 777 },
      { ...DEPS, fetch: fetchImpl },
    );

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(requestBody.max_completion_tokens).toBe(777);
  });

  // Nota sobre por que no hay un test de "reintenta un 503 y el segundo
  // intento funciona" via el fetch falso de Azure: el ADK no preserva el
  // codigo HTTP original cuando un BaseLlm propio (como AzureFoundryLlm)
  // lanza una excepcion - lo convierte en un evento con errorCode generico
  // "UNKNOWN_ERROR", que nunca matchea RETRYABLE_ERROR_CODES. En la
  // practica esto esta bien: Azure ya agoto su propio reintento interno
  // (ai.client.js) antes de llegar a tirar esa excepcion, asi que un
  // reintento extra en este nivel seria redundante para ese camino. El
  // reintento de este archivo esta pensado para Gemini/Vertex (sin
  // reintento interno propio), donde el ADK SI expone el codigo real (se
  // verifico en pruebas manuales reales: errorCode "503" para "high
  // demand" en Gemini) - verificarlo con un test unitario requeriria
  // mockear el modulo @google/adk en vez de inyectar un fetch, que es mas
  // fragil que el valor que aporta dado que ya se confirmo en vivo.
  test('no reintenta un error no retryable (ej. 400) y lo propaga de inmediato', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) });
    const sleepImpl = jest.fn();

    await expect(
      runAgentTurn(
        { name: 'a', systemPrompt: 's', messages: [{ role: 'user', content: 'u' }] },
        { ...DEPS, maxRetries: 0, agentMaxRetries: 3, sleep: sleepImpl, fetch: fetchImpl },
      ),
    ).rejects.toThrow('El proveedor de IA respondio con estado 400');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  test('corta una llamada colgada despues de timeoutMs en vez de esperar para siempre', async () => {
    // Visto en pruebas manuales reales: sin este timeout, una llamada al
    // proveedor que nunca resuelve ni rechaza se queda esperando
    // indefinidamente - ni falla ni reintenta, simplemente nunca vuelve.
    const fetchImpl = jest.fn(() => new Promise(() => {})); // nunca resuelve

    await expect(
      runAgentTurn(
        { name: 'a', systemPrompt: 's', messages: [{ role: 'user', content: 'u' }] },
        { ...DEPS, timeoutMs: 50, agentMaxRetries: 0, fetch: fetchImpl },
      ),
    ).rejects.toThrow(AiTimeoutError);
  }, 2000);
});
