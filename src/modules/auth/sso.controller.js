const ssoService = require('./sso.service');
const env = require('../../config/env');
const { MissingAuthorizationCodeError, GoogleAuthenticationError } = require('./auth.errors');

// GET /auth/sso/callback?code=... — redireccion de Google tras el consentimiento.
// Redirige de vuelta al frontend (nunca responde JSON): el navegador del
// usuario llega aqui via una navegacion completa iniciada por Google, no via
// fetch desde la SPA, asi que la sesion se entrega como querystring de una
// redireccion 302 hacia la pantalla de callback del frontend (T-011.3).
async function googleCallbackController(req, res) {
  try {
    const { token, user } = await ssoService.handleGoogleSsoCallback(req.query.code);
    const params = new URLSearchParams({
      token,
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    return res.redirect(302, `${env.frontendUrl}/auth/sso/callback?${params.toString()}`);
  } catch (err) {
    if (err instanceof MissingAuthorizationCodeError || err instanceof GoogleAuthenticationError) {
      const params = new URLSearchParams({ ssoError: err.message });
      return res.redirect(302, `${env.frontendUrl}/login?${params.toString()}`);
    }
    throw err;
  }
}

module.exports = { googleCallbackController };
