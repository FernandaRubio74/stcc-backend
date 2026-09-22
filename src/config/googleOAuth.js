const { OAuth2Client } = require('google-auth-library');
const env = require('./env');

function createGoogleOAuthClient() {
  return new OAuth2Client(env.sso.clientId, env.sso.clientSecret, env.sso.callbackUrl);
}

const googleOAuthClient = createGoogleOAuthClient();

module.exports = { googleOAuthClient, createGoogleOAuthClient };
