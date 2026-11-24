/**
 * Cifrado hibrido (envelope encryption) del token de sesion - ver
 * crypto/hybridCipher.js para la primitiva RSA+AES compartida.
 *
 * Antes, el token de sesion era un JWT FIRMADO (jsonwebtoken, HS256): eso
 * garantiza integridad (nadie lo puede alterar sin invalidar la firma) pero
 * NO confidencialidad - el payload es JSON en texto plano, solo codificado
 * en base64url. Visto en clase: pegando el token en un decodificador JWT
 * cualquiera (ej. jwt.io) se ve el email y el resto del payload tal cual,
 * sin necesitar ninguna clave. Ese es el problema que esto resuelve.
 *
 * El formato es JWE Compact Serialization (RFC 7516): 5 segmentos
 * separados por ".", "header.encryptedKey.iv.ciphertext.tag". El resultado
 * es ciphertext real: decodificar cualquiera de los 5 segmentos en base64
 * da bytes sin sentido, nunca el JSON del payload.
 */
const env = require('../../config/env');
const hybridCipher = require('../crypto/hybridCipher');

const HEADER = Buffer.from(JSON.stringify({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })).toString('base64url');
const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 };

// Acepta un signo "-" (ej. "-1s") para poder fabricar en tests un token ya
// vencido al emitirlo, igual que ya permitia jsonwebtoken.
function parseDurationSeconds(value) {
  const match = /^(-?\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return DURATION_UNITS.d; // 1 dia por defecto, igual que antes.
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

function encryptPayload(payload, { expiresIn = env.jwt.expiresIn } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + parseDurationSeconds(expiresIn) };

  const { encryptedKey, iv, ciphertext, tag } = hybridCipher.encrypt(fullPayload, env.jwt.rsaPublicKey);

  return [
    HEADER,
    encryptedKey.toString('base64url'),
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

function decryptPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 5) {
    throw new Error('Token con formato invalido');
  }
  const [, encodedKey, encodedIv, encodedCiphertext, encodedTag] = parts;

  const payload = hybridCipher.decrypt(
    {
      encryptedKey: Buffer.from(encodedKey, 'base64url'),
      iv: Buffer.from(encodedIv, 'base64url'),
      ciphertext: Buffer.from(encodedCiphertext, 'base64url'),
      tag: Buffer.from(encodedTag, 'base64url'),
    },
    env.jwt.rsaPrivateKey
  );

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('Token expirado');
  }

  return payload;
}

module.exports = { encryptPayload, decryptPayload };
