// Middleware generico de validacion de payload contra un schema de Zod.
// Usado por las rutas de auth (registro/login) y ahora tambien por SSO.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({ error: 'Datos invalidos', details: result.error.issues });
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validate };
