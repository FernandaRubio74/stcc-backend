const { AI_UNAVAILABLE_MESSAGE, isAiFailure, logAiFailure, scrub } = require('../../src/modules/ai/aiFailure');
const { AiTimeoutError, AiProviderError, AiResponseValidationError } = require('../../src/modules/ai/ai.errors');
const { logger } = require('../../src/common/utils/logger');

describe('isAiFailure', () => {
  it('reconoce los tres errores de IA', () => {
    expect(isAiFailure(new AiTimeoutError('se corto'))).toBe(true);
    expect(isAiFailure(new AiProviderError('429'))).toBe(true);
    expect(isAiFailure(new AiResponseValidationError('json invalido'))).toBe(true);
  });

  it('no reconoce un error de negocio ni nada raro', () => {
    expect(isAiFailure(new Error('entidad inexistente'))).toBe(false);
    expect(isAiFailure(undefined)).toBe(false);
    expect(isAiFailure(null)).toBe(false);
  });
});

describe('scrub', () => {
  // Los mensajes de error de los SDKs de Google a veces traen la URL de la
  // llamada, y esa URL puede llevar la API key como query param. El logger
  // redacta por NOMBRE de clave, lo que no alcanza para un secreto embutido
  // dentro de un string.
  it('redacta la API key embutida en una URL', () => {
    const texto = 'request failed: https://generativelanguage.googleapis.com/v1beta/models/x?key=AQ.secretazo123 (401)';

    const limpio = scrub(texto);

    expect(limpio).not.toContain('AQ.secretazo123');
    expect(limpio).toContain('key=[redactado]');
    expect(limpio).toContain('(401)');
  });

  it('redacta tambien api_key y access_token', () => {
    expect(scrub('?api_key=abc123')).toBe('?api_key=[redactado]');
    expect(scrub('&access_token=xyz789')).toBe('&access_token=[redactado]');
  });

  it('deja intacto un mensaje sin secretos', () => {
    expect(scrub('el modelo devolvio JSON invalido')).toBe('el modelo devolvio JSON invalido');
  });
});

describe('logAiFailure', () => {
  let escrito;

  beforeEach(() => {
    escrito = [];
    jest.spyOn(logger, 'error').mockImplementation((message, meta) => escrito.push({ message, meta }));
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra la causa real, la etapa y la accion', () => {
    const err = new AiProviderError('el proveedor respondio 429');
    err.retryable = true;

    logAiFailure(err, { stage: 'data-model', action: 'generate', projectId: 'p1' });

    expect(escrito).toHaveLength(1);
    expect(escrito[0].message).toBe('ai_failure');
    expect(escrito[0].meta).toMatchObject({
      stage: 'data-model',
      action: 'generate',
      projectId: 'p1',
      kind: 'AiProviderError',
      detail: 'el proveedor respondio 429',
      retryable: true,
    });
  });

  it('distingue un timeout de una validacion fallida', () => {
    logAiFailure(new AiTimeoutError('se agoto el tiempo'), { stage: 'screens', action: 'generate' });
    logAiFailure(new AiResponseValidationError('no cumple el contrato'), { stage: 'screens', action: 'refine' });

    expect(escrito.map((l) => l.meta.kind)).toEqual(['AiTimeoutError', 'AiResponseValidationError']);
  });

  it('incluye la causa encadenada cuando existe', () => {
    const err = new AiProviderError('fallo la llamada', { cause: new Error('socket hang up') });

    logAiFailure(err, { stage: 'api-spec', action: 'generate' });

    expect(escrito[0].meta.cause).toBe('socket hang up');
  });

  it('nunca deja pasar un secreto embutido en el mensaje', () => {
    logAiFailure(new AiProviderError('GET https://x/y?key=AQ.supersecreto fallo'), { stage: 'testing' });

    expect(JSON.stringify(escrito[0].meta)).not.toContain('AQ.supersecreto');
  });
});

describe('AI_UNAVAILABLE_MESSAGE', () => {
  // El mensaje al usuario NO cambia: el valor de este refactor es el log del
  // lado del servidor, no un texto nuevo en la interfaz.
  it('mantiene exactamente el texto que ya devolvian los controllers', () => {
    expect(AI_UNAVAILABLE_MESSAGE).toBe('El asistente de IA no esta disponible en este momento, intenta de nuevo');
  });
});
