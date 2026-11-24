#!/usr/bin/env node
/**
 * Diagnostico de las claves RSA de sesion (JWT_RSA_PUBLIC_KEY /
 * JWT_RSA_PRIVATE_KEY).
 *
 * Por que existe: `src/config/env.js` solo comprueba que la variable no
 * este vacia (`required()`), no que su contenido sea un PEM valido. Un valor
 * con comillas alrededor, pegado en una sola linea sin los `\n` escapados, o
 * con espacios en lugar de saltos, pasa esa validacion sin problema y el
 * backend arranca normal. Recien falla al primer uso real de la clave
 * (`crypto.publicEncrypt` dentro de `modules/crypto/hybridCipher.js`), que es
 * cuando se emite un token de sesion. En el callback de SSO eso se ve como un
 * 500 "Error interno del servidor", porque `sso.controller.js` solo convierte
 * a redireccion `MissingAuthorizationCodeError` y `GoogleAuthenticationError`:
 * cualquier otro error sube al manejador global.
 *
 * Este script reproduce la misma normalizacion que env.js y revienta en el
 * mismo punto, pero diciendo exactamente que esta mal.
 *
 * No imprime nunca el contenido de las claves: solo longitudes, posiciones y
 * veredictos. Es seguro pegar su salida en un chat o en un ticket.
 *
 * Como correrlo
 * -------------
 * Local (lee el .env del proyecto, igual que el backend):
 *
 *   node scripts/check-keys.js
 *
 * Contra los valores de produccion, sin escribirlos en ningun archivo
 * (PowerShell):
 *
 *   $env:JWT_RSA_PUBLIC_KEY="...";  $env:JWT_RSA_PRIVATE_KEY="..."; node scripts/check-keys.js
 *
 * En el servidor desplegado (Render -> pestania Shell), donde las variables
 * ya estan en el entorno del servicio:
 *
 *   node scripts/check-keys.js
 *
 * Codigo de salida: 0 si todos los pasos dan PASS, 1 si alguno da FAIL.
 */
require('dotenv').config();

const crypto = require('crypto');
// A proposito NO se requiere src/config/env.js: ese modulo exige
// DATABASE_URL y tiraria antes de poder diagnosticar las claves, que es justo
// lo que se quiere revisar. La normalizacion se replica aca abajo, identica.
const hybridCipher = require('../src/modules/crypto/hybridCipher');

const KEYS = [
  { name: 'JWT_RSA_PUBLIC_KEY', kind: 'public', label: 'PUBLIC KEY' },
  { name: 'JWT_RSA_PRIVATE_KEY', kind: 'private', label: 'PRIVATE KEY' },
];

let failures = 0;

function pass(step, detail) {
  console.log(`  PASS  ${step}${detail ? ` - ${detail}` : ''}`);
}

function fail(step, detail) {
  failures += 1;
  console.log(`  FAIL  ${step}${detail ? ` - ${detail}` : ''}`);
}

function info(text) {
  console.log(`        ${text}`);
}

/** Misma normalizacion que src/config/env.js, linea por linea. */
function normalize(raw) {
  return raw.replace(/\\n/g, '\n');
}

/**
 * Revisa la forma del PEM sin mirar su contenido secreto.
 * @returns {string|null} el PEM normalizado, o null si esta inservible.
 */
function inspect({ name, label }) {
  console.log(`\n${name}`);

  const raw = process.env[name];
  if (!raw) {
    fail('variable presente', 'no esta definida o esta vacia');
    return null;
  }
  pass('variable presente', `${raw.length} caracteres antes de normalizar`);

  // 1. Comillas sobrantes. Pasa cuando se copia el valor con las comillas
  // incluidas: en un .env las comillas son parte del valor, y en los paneles
  // de Render/Vercel tambien.
  const quotes = ['"', "'", '`'];
  const startsQuoted = quotes.includes(raw[0]);
  const endsQuoted = quotes.includes(raw[raw.length - 1]);
  if (startsQuoted || endsQuoted) {
    const donde = startsQuoted && endsQuoted ? 'al principio y al final' : startsQuoted ? 'al principio' : 'al final';
    fail('sin comillas sobrantes', `el valor tiene comillas ${donde}; quitalas del panel de variables`);
  } else {
    pass('sin comillas sobrantes');
  }

  const pem = normalize(raw).trim();
  const escapedCount = (raw.match(/\\n/g) || []).length;
  info(`secuencias "\\n" literales encontradas: ${escapedCount}`);

  // 2. Encabezado y pie.
  const header = `-----BEGIN ${label}-----`;
  const footer = `-----END ${label}-----`;
  const hasHeader = pem.includes(header);
  const hasFooter = pem.includes(footer);

  if (hasHeader && hasFooter) {
    pass('encabezado y pie PEM', `${header} / ${footer}`);
  } else {
    const faltan = [!hasHeader && header, !hasFooter && footer].filter(Boolean).join(' y ');
    fail('encabezado y pie PEM', `falta ${faltan}`);
    // Pista util: a veces la clave esta bien pero es del otro tipo.
    const otro = label === 'PUBLIC KEY' ? 'PRIVATE KEY' : 'PUBLIC KEY';
    if (pem.includes(`-----BEGIN ${otro}-----`)) {
      info(`ojo: el valor contiene "-----BEGIN ${otro}-----": las dos variables estan intercambiadas`);
    }
    if (pem.includes('-----BEGIN RSA ')) {
      info('el PEM esta en formato PKCS#1 ("BEGIN RSA ..."); el proyecto genera PKCS#8/SPKI');
    }
  }

  // 3. Saltos de linea despues de normalizar. Un PEM de 2048 bits ocupa
  // varias lineas; si quedo en una sola, los "\n" nunca llegaron.
  const lines = pem.split('\n');
  if (lines.length >= 3) {
    pass('tiene saltos de linea', `${lines.length} lineas tras normalizar`);
  } else {
    fail('tiene saltos de linea', `quedo en ${lines.length} linea(s); los "\\n" escapados se perdieron al copiar`);
  }

  // 4. Espacios donde deberian ir saltos. Sintoma clasico de haber pegado el
  // PEM en un campo que convirtio los saltos en espacios: el cuerpo base64
  // no puede contener espacios.
  // Se quita cualquier armor "-----...-----", no solo el esperado: si la
  // clave viene en otro formato (ej. PKCS#1), el armor real no coincide con
  // `header`/`footer` y quedaria dentro del cuerpo, con sus espacios,
  // disparando un FAIL que no corresponde.
  const body = pem.replace(/-----[^-]*-----/g, '').trim();
  if (/[ \t]/.test(body)) {
    const primero = body.search(/[ \t]/);
    fail('cuerpo base64 sin espacios', `hay un espacio en la posicion ${primero} del cuerpo, donde deberia haber un salto de linea`);
  } else {
    pass('cuerpo base64 sin espacios');
  }

  return pem;
}

/**
 * Carga el PEM con crypto e imprime tipo y tamanio.
 * @returns {import('crypto').KeyObject|null}
 */
function loadKey(pem, { name, kind }) {
  if (!pem) {
    fail(`${kind === 'public' ? 'createPublicKey' : 'createPrivateKey'}`, 'no hay PEM que cargar');
    return null;
  }

  const step = kind === 'public' ? 'crypto.createPublicKey' : 'crypto.createPrivateKey';
  try {
    const key = kind === 'public' ? crypto.createPublicKey(pem) : crypto.createPrivateKey(pem);
    const bits = key.asymmetricKeyDetails ? key.asymmetricKeyDetails.modulusLength : undefined;
    pass(step, `tipo ${key.asymmetricKeyType}${bits ? `, ${bits} bits` : ''}`);

    if (key.asymmetricKeyType !== 'rsa') {
      fail('tipo de clave', `es ${key.asymmetricKeyType}, el cifrado hibrido necesita RSA`);
    }
    if (bits && bits < 2048) {
      fail('tamanio de clave', `${bits} bits es demasiado chico; el proyecto genera 2048`);
    }
    return key;
  } catch (error) {
    // El mensaje de OpenSSL no contiene material de la clave.
    fail(step, error.message);
    info(`revisa el valor de ${name} en el panel de variables de entorno`);
    return null;
  }
}

function roundTrip(publicPem, privatePem) {
  console.log('\nPrueba de ida y vuelta (modules/crypto/hybridCipher.js)');

  if (!publicPem || !privatePem) {
    fail('encrypt/decrypt', 'falta al menos una de las dos claves');
    return;
  }

  const muestra = { sub: 'usuario-de-prueba', email: 'prueba@ejemplo.test', iat: 1700000000 };

  let sobre;
  try {
    sobre = hybridCipher.encrypt(muestra, publicPem);
    pass('encrypt con la clave publica', `${sobre.ciphertext.length} bytes de ciphertext`);
  } catch (error) {
    fail('encrypt con la clave publica', error.message);
    info('esto es exactamente lo que rompe la emision del token de sesion (500 en el callback de SSO)');
    return;
  }

  try {
    const recuperado = hybridCipher.decrypt(sobre, privatePem);
    const iguales = JSON.stringify(recuperado) === JSON.stringify(muestra);
    if (iguales) {
      pass('decrypt con la clave privada', 'el objeto recuperado es identico al original');
    } else {
      fail('decrypt con la clave privada', 'descifro pero el contenido no coincide');
    }
  } catch (error) {
    fail('decrypt con la clave privada', error.message);
    info('la clave privada no corresponde a la publica: son de dos pares distintos');
  }
}

function main() {
  console.log('Diagnostico de las claves RSA de sesion');
  console.log('(no se imprime el contenido de ninguna clave)');

  const [publicSpec, privateSpec] = KEYS;
  const publicPem = inspect(publicSpec);
  const privatePem = inspect(privateSpec);

  console.log('\nCarga con crypto');
  loadKey(publicPem, publicSpec);
  loadKey(privatePem, privateSpec);

  roundTrip(publicPem, privatePem);

  console.log('');
  if (failures === 0) {
    console.log('Resultado: todo PASS. Las claves son validas y forman un par.');
    console.log('Si el callback de SSO sigue devolviendo 500, la causa esta en otra parte');
    console.log('(base de datos o configuracion de Google); mira los logs del backend.');
    process.exit(0);
  }

  console.log(`Resultado: ${failures} comprobacion(es) en FAIL. Corregí lo marcado arriba.`);
  console.log('Para regenerar un par limpio, usá el comando documentado en .env.example');
  console.log('(tambien esta en docs/DESPLIEGUE.md, paso 2).');
  process.exit(1);
}

main();
