class AiTimeoutError extends Error {
  constructor(message = 'Tiempo de espera agotado al llamar al proveedor de IA', options = {}) {
    super(message, options);
    this.name = 'AiTimeoutError';
  }
}

class AiProviderError extends Error {
  constructor(message = 'El proveedor de IA no pudo procesar la solicitud', options = {}) {
    super(message, options);
    this.name = 'AiProviderError';
    this.retryable = Boolean(options.retryable);
  }
}

class AiResponseValidationError extends Error {
  constructor(message = 'La respuesta del proveedor de IA no es valida', options = {}) {
    super(message, options);
    this.name = 'AiResponseValidationError';
  }
}

module.exports = { AiTimeoutError, AiProviderError, AiResponseValidationError };
