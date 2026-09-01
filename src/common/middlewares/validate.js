/**
 * Middleware de validacion de entrada con Zod.
 *
 * `auth.routes.js` ya lo importaba desde la US-005, pero el archivo nunca
 * llego a commitearse: `require('./src/app')` fallaba con MODULE_NOT_FOUND y
 * la app no levantaba. Ningun test importaba `app.js`, asi que CI no lo veia
 * (ver `tests/unit/app.test.js`, agregado junto con este arreglo).
 */

/**
 * Valida una parte de la request contra un esquema de Zod.
 *
 * Si valida, reemplaza el objeto original por el resultado parseado, para que
 * los controllers reciban datos ya normalizados y sin campos de mas.
 *
 * @param {import('zod').ZodType} schema
 * @param {'body'|'params'} [source='body'] que parte de la request validar
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        error: 'Datos invalidos',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };
