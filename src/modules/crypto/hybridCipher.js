/**
 * Primitiva central de cifrado hibrido (envelope encryption): RSA-OAEP-256
 * (asimetrico) cifra una clave AES-256 generada al azar, y esa clave cifra
 * el valor real con AES-256-GCM (simetrico, AEAD - cifra y autentica a la
 * vez). La usan tanto el token de sesion (auth/jwe.service.js, formato JWE
 * compacto) como el cifrado de datos en reposo
 * (database/fieldEncryption.js, formato "sobre" JSON) - mismo cifrado, dos
 * formas de serializar el resultado, para no repetir la logica criptografica
 * en dos lugares.
 */
const crypto = require('crypto');

const ENC_ALG = 'aes-256-gcm';
const RSA_OPTS = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };

/** @returns {{ encryptedKey: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer }} */
function encrypt(value, publicKeyPem) {
  const cek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALG, cek, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt({ key: publicKeyPem, ...RSA_OPTS }, cek);

  return { encryptedKey, iv, ciphertext, tag };
}

/** Tira si el ciphertext/tag fueron alterados (GCM es AEAD) o si la clave privada no corresponde. */
function decrypt({ encryptedKey, iv, ciphertext, tag }, privateKeyPem) {
  const cek = crypto.privateDecrypt({ key: privateKeyPem, ...RSA_OPTS }, encryptedKey);
  const decipher = crypto.createDecipheriv(ENC_ALG, cek, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encrypt, decrypt };
