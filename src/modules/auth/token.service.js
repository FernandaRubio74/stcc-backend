const jwt = require('jsonwebtoken');
const env = require('../../config/env');

// Función oficial de emisión de sesión/token: la usan tanto el login
// tradicional (US-005, ver auth.service.js) como cualquier proveedor SSO
// (T-006.3), para que ambos flujos emitan el mismo tipo de token.
function generateSessionToken(user) {
  const payload = { sub: user.id, email: user.email };
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

module.exports = { generateSessionToken };
