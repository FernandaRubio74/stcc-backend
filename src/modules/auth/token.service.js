const { randomUUID } = require('crypto');
const env = require('../../config/env');
const { encryptPayload } = require('./jwe.service');

// Función oficial de emisión de sesión/token: la usan tanto el login
// tradicional (US-005, ver auth.service.js) como cualquier proveedor SSO
// (T-006.3), para que ambos flujos emitan el mismo tipo de token.
//
// T-042.3: cada token lleva un `jti` unico. Sin eso no hay forma de
// invalidar UNA sesion especifica en logout: dos tokens del mismo usuario
// (ej. navegador + celular) serian indistinguibles entre si.
//
// El token es un JWE (cifrado hibrido RSA+AES, ver jwe.service.js), no un
// JWT firmado: el payload (incluido el email) no es legible para quien
// solo tiene el token, a diferencia de un JWT HS256 comun.
function generateSessionToken(user) {
  const payload = { sub: user.id, email: user.email, jti: randomUUID() };
  return encryptPayload(payload, { expiresIn: env.jwt.expiresIn });
}

module.exports = { generateSessionToken };
