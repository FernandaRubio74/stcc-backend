/**
 * T-014.4 - Tests de la validacion del contrato estructurado
 * (reply/stageComplete/blockingQuestions/extracted) sobre la respuesta cruda
 * del proveedor.
 */
const { requestStructuredTurn } = require('../../src/modules/ai/ai.service');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

function fetchReturning(content) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
}

const DEPS = {
  endpoint: 'https://fake.openai.azure.com/openai/v1',
  apiKey: 'fake-key',
  deployment: 'gpt-5',
  timeoutMs: 50,
  maxRetries: 0,
};

describe('requestStructuredTurn', () => {
  test('parsea y valida una respuesta bien formada', async () => {
    const content = JSON.stringify({
      reply: 'Contame mas sobre el problema',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen parcial' },
    });

    const result = await requestStructuredTurn(
      { systemPrompt: 's', messages: [] },
      { ...DEPS, fetch: fetchReturning(content) }
    );

    expect(result).toEqual({
      reply: 'Contame mas sobre el problema',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen parcial' },
    });
  });

  test('aplica defaults cuando el proveedor omite campos opcionales', async () => {
    const content = JSON.stringify({ reply: 'hola' });

    const result = await requestStructuredTurn(
      { systemPrompt: 's', messages: [] },
      { ...DEPS, fetch: fetchReturning(content) }
    );

    expect(result).toEqual({
      reply: 'hola',
      stageComplete: false,
      blockingQuestions: [],
      extracted: {},
    });
  });

  test('lanza AiResponseValidationError si el contenido no es JSON', async () => {
    await expect(
      requestStructuredTurn(
        { systemPrompt: 's', messages: [] },
        { ...DEPS, fetch: fetchReturning('esto no es json') }
      )
    ).rejects.toThrow(AiResponseValidationError);
  });

  test('lanza AiResponseValidationError si falta el campo "reply"', async () => {
    const content = JSON.stringify({ stageComplete: true });

    await expect(
      requestStructuredTurn(
        { systemPrompt: 's', messages: [] },
        { ...DEPS, fetch: fetchReturning(content) }
      )
    ).rejects.toThrow(AiResponseValidationError);
  });
});
