const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateSessionToken } = require('./token.service');

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

module.exports = {
  register,
  login,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  prisma,
};


