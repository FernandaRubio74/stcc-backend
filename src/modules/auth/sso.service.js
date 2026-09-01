const prisma = require('../../database/client');
const env = require('../../config/env');
const { googleOAuthClient } = require('../../config/googleOAuth');
const { generateSessionToken } = require('./token.service');
const { MissingAuthorizationCodeError, GoogleAuthenticationError } = require('./auth.errors');

const GOOGLE_PROVIDER = 'google';

async function verifyGoogleAuthorizationCode(code, oAuthClient = googleOAuthClient) {
  try {
    const { tokens } = await oAuthClient.getToken(code);
    oAuthClient.setCredentials(tokens);

    const ticket = await oAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.sso.clientId,
    });
    const payload = ticket.getPayload();

    return {
      email: payload.email,
      fullName: payload.name || payload.email,
      googleId: payload.sub,
    };
  } catch (error) {
    throw new GoogleAuthenticationError(undefined, { cause: error });
  }
}

// Busca por identidad de Google; si no existe, vincula por email (usuario ya
// registrado localmente) y si tampoco existe, lo crea (provisioning).
async function findOrCreateUserFromGoogleProfile(profile, prismaClient = prisma) {
  const { email, fullName, googleId } = profile;

  const existingByProvider = await prismaClient.user.findUnique({
    where: {
      authProvider_providerId: { authProvider: GOOGLE_PROVIDER, providerId: googleId },
    },
  });
  if (existingByProvider) {
    return existingByProvider;
  }

  const existingByEmail = await prismaClient.user.findUnique({ where: { email } });
  if (existingByEmail) {
    return prismaClient.user.update({
      where: { id: existingByEmail.id },
      data: { authProvider: GOOGLE_PROVIDER, providerId: googleId },
    });
  }

  return prismaClient.user.create({
    data: { email, fullName, authProvider: GOOGLE_PROVIDER, providerId: googleId },
  });
}

async function handleGoogleSsoCallback(code, deps = {}) {
  if (!code) {
    throw new MissingAuthorizationCodeError();
  }

  const oAuthClient = deps.oAuthClient || googleOAuthClient;
  const prismaClient = deps.prismaClient || prisma;

  const profile = await verifyGoogleAuthorizationCode(code, oAuthClient);
  const user = await findOrCreateUserFromGoogleProfile(profile, prismaClient);
  const token = generateSessionToken(user);

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

module.exports = {
  GOOGLE_PROVIDER,
  verifyGoogleAuthorizationCode,
  findOrCreateUserFromGoogleProfile,
  handleGoogleSsoCallback,
};
