class MissingAuthorizationCodeError extends Error {
  constructor(message = 'No se recibió código de autorización') {
    super(message);
    this.name = 'MissingAuthorizationCodeError';
  }
}

class GoogleAuthenticationError extends Error {
  constructor(message = 'Autenticación con Google fallida', options = {}) {
    super(message, options);
    this.name = 'GoogleAuthenticationError';
  }
}

module.exports = { MissingAuthorizationCodeError, GoogleAuthenticationError };
