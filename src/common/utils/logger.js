/**
 * T-039.2 - Logger estructurado centralizado.
 *
 * Escribe una linea JSON por evento a stdout/stderr, que es lo que esperan
 * los agregadores de logs de los escenarios del catalogo de arquitectura. No
 * se agrega una dependencia (pino/winston) porque lo unico que hace falta es
 * formatear y redactar: son ~40 lineas y quedan testeables como funcion pura.
 *
 * Regla de seguridad: nunca se emiten credenciales. Las claves sensibles se
 * redactan por nombre, para que un `logger.info('request', req.headers)` no
 * pueda filtrar un token por descuido.
 */
const env = require('../../config/env');

const SENSITIVE_KEY = /authorization|cookie|api[-_]?key|password|secret|token/i;
const REDACTED = '[redactado]';

function sanitize(meta) {
  if (!meta || typeof meta !== 'object') return {};

  return Object.entries(meta).reduce((acc, [key, value]) => {
    if (SENSITIVE_KEY.test(key)) {
      acc[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      acc[key] = sanitize(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
}

/** Funcion pura: es lo que se testea. */
function formatLine(level, message, meta = {}, now = new Date()) {
  return JSON.stringify({
    level,
    timestamp: now.toISOString(),
    message,
    ...sanitize(meta),
  });
}

// En los tests el logger queda mudo: 300+ tests que hacen requests HTTP
// llenarian la salida y taparian los resultados.
const enabled = env.nodeEnv !== 'test';

// Se escribe directo al stream y no via console: un logger necesita stdout
// para los niveles informativos, y console.log esta vedado por el linter
// justamente para que no se use como mecanismo de log.
function emit(level, message, meta) {
  if (!enabled) return;
  const line = `${formatLine(level, message, meta)}\n`;
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(line);
}

const logger = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};

module.exports = { logger, formatLine, sanitize };
