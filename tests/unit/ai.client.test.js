/**
 * T-014.4 - Tests del cliente de IA con proveedor mockeado: exito, timeout
 * (con reintento) y error del proveedor (sin reintento en 4xx).
 *
 * El fetch real nunca se ejercita: se inyecta via `deps.fetch` (mismo patron
 * de inyeccion de dependencias que sso.service para el cliente de Google).
 */
const { completeWithRetry } = require('../../src/modules/ai/ai.client');
const { AiTimeoutError, AiProviderError } = require('../../src/modules/ai/ai.errors');

const BASE_DEPS = {
  endpoint: 'https://fake.openai.azure.com/openai/v1',
  apiKey: 'fake-key',
  deployment: 'gpt-5',
  timeoutMs: 50,
  maxRetries: 2,
  baseDelayMs: 1,
  sleep: () => Promise.resolve(),
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('completeWithRetry', () => {
  test('devuelve el contenido del primer choice en el camino feliz', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }));

    const content = await completeWithRetry(
      { systemPrompt: 'sistema', messages: [{ role: 'user', content: 'hola' }] },
      { ...BASE_DEPS, fetch: fetchMock }
    );

    expect(content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['api-key']).toBe('fake-key');
  });

  test('reintenta un 503 y termina devolviendo el contenido si el segundo intento OK', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'listo' } }] }));

    const content = await completeWithRetry(
      { systemPrompt: 's', messages: [] },
      { ...BASE_DEPS, fetch: fetchMock }
    );

    expect(content).toBe('listo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('agota los reintentos y lanza AiProviderError si el proveedor siempre falla con 500', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({}, 500));

    await expect(
      completeWithRetry({ systemPrompt: 's', messages: [] }, { ...BASE_DEPS, fetch: fetchMock })
    ).rejects.toThrow(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
  });

  test('no reintenta un 401 (credenciales invalidas)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({}, 401));

    await expect(
      completeWithRetry({ systemPrompt: 's', messages: [] }, { ...BASE_DEPS, fetch: fetchMock })
    ).rejects.toThrow(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('un timeout (AbortError) se traduce a AiTimeoutError y se reintenta', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));

    const content = await completeWithRetry(
      { systemPrompt: 's', messages: [] },
      { ...BASE_DEPS, fetch: fetchMock }
    );

    expect(content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('lanza AiTimeoutError si todos los intentos agotan el timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchMock = jest.fn().mockRejectedValue(abortError);

    await expect(
      completeWithRetry({ systemPrompt: 's', messages: [] }, { ...BASE_DEPS, fetch: fetchMock })
    ).rejects.toThrow(AiTimeoutError);
  });

  test('reintenta una respuesta sin contenido (razonamiento agoto el budget) y devuelve el contenido del segundo intento', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'listo' } }] }));

    const content = await completeWithRetry(
      { systemPrompt: 's', messages: [] },
      { ...BASE_DEPS, fetch: fetchMock }
    );

    expect(content).toBe('listo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('lanza AiProviderError si falta configuracion del proveedor', async () => {
    await expect(
      completeWithRetry(
        { systemPrompt: 's', messages: [] },
        { ...BASE_DEPS, apiKey: undefined, fetch: jest.fn() }
      )
    ).rejects.toThrow(AiProviderError);
  });
});
