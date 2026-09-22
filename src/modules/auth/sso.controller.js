const ssoService = require('./sso.service');
const { MissingAuthorizationCodeError, GoogleAuthenticationError } = require('./auth.errors');

// GET /auth/sso/callback?code=... — redireccion de Google tras el consentimiento.
async function googleCallbackController(req, res) {
  try {
    const result = await ssoService.handleGoogleSsoCallback(req.query.code);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof MissingAuthorizationCodeError || err instanceof GoogleAuthenticationError) {
      return res.status(401).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = { googleCallbackController };
