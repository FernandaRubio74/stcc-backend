const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateSessionToken } = require('./token.service');
const revocationService = require('./revocation.service');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

class EmailAlreadyExistsError extends Error {}
class InvalidCredentialsError extends Error {}

async function register({ email, password, fullName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailAlreadyExistsError('El email ya esta registrado');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, authProvider: 'local' },
  });

  return { id: user.id, email: user.email, fullName: user.fullName };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    throw new InvalidCredentialsError('Credenciales invalidas');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new InvalidCredentialsError('Credenciales invalidas');
  }

  // T-006.3: emision de sesion unificada con SSO (ver token.service.js).
  const token = generateSessionToken(user);

  return { token, user: { id: user.id, email: user.email, fullName: user.fullName } };
}

/** T-042.3 - Invalida la sesion actual (y solo esa) insertandola en la denylist. */
async function logout({ jti, exp }) {
  if (!jti) return;
  await revocationService.revoke({ jti, expiresAt: new Date(exp * 1000) });
}

module.exports = {
  register,
  login,
  logout,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  prisma,
};


