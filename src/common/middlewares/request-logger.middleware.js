const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');
const metrics = require('../../modules/health/metrics');

/**
 * T-039.2/T-039.3 - Un unico middleware alimenta el log estructurado y el
 * acumulador de metricas, para que no puedan divergir.
 *
 * Se loguea al terminar la respuesta (evento `finish`): ahi ya se conoce el
 * codigo de estado y la duracion real. Nunca se loguea el body ni las
 * cabeceras: el logger redacta por nombre, pero lo mas seguro es no pasarlas.
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  req.requestId = randomUUID();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    metrics.record({ statusCode: res.statusCode, durationMs });

    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });

  next();
}

module.exports = { requestLogger };
