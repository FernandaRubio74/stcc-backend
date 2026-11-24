/**
 * Cifrado de datos en reposo (envelope encryption, misma primitiva que
 * auth/jwe.service.js: AES-256-GCM simetrico + RSA-OAEP asimetrico - ver
 * crypto/hybridCipher.js), aplicado de forma transparente via un Prisma
 * Client Extension: los servicios siguen leyendo/escribiendo objetos JS
 * normales, ninguno maneja cifrado a mano.
 *
 * Por que un Client Extension y no tocar cada servicio: serian decenas de
 * puntos de escritura/lectura en todos los modulos (data-model, api-spec,
 * screens, pruebas, definicion, documentos...), cada uno un lugar donde
 * olvidarse de cifrar o descifrar dejaria una fuga real. Centralizado aca,
 * agregar un campo nuevo a cifrar es una linea en FIELD_CONFIG, no un
 * cambio en cada service.
 *
 * Que se cifra (FIELD_CONFIG): todo lo que es contenido real del proyecto
 * (la idea, el modelo de datos, la API, las pantallas, el plan de pruebas,
 * los documentos finales) - nunca ids, enums, timestamps ni campos de
 * control de version/estado, que el codigo necesita poder filtrar/ordenar
 * en la base (ver auditoria de `where` antes de escribir esto: ningun
 * query de la app filtra por el CONTENIDO de estos campos, asi que cifrarlos
 * como un blob opaco no rompe ninguna consulta existente).
 *
 * Los campos `Json` de Prisma guardan el "sobre" (objeto con el ciphertext
 * en base64) directo como su valor JSON - el tipo de columna no cambia.
 * Los campos `String` guardan el sobre serializado con JSON.stringify - en
 * ambos casos, mirar la fila cruda en la base (psql, pgAdmin) muestra el
 * sobre cifrado, nunca el dato real.
 */
const env = require('../config/env');
const hybridCipher = require('../modules/crypto/hybridCipher');

const ENVELOPE_VERSION = 1;

// { Modelo: { json: [...campos Json], string: [...campos String] } }
const FIELD_CONFIG = {
  Project: { json: [], string: ['name', 'description'] },
  ProjectDefinition: { json: ['targetUsers', 'mvpScope', 'userJourney'], string: ['problemSummary'] },
  DefinitionMessage: { json: [], string: ['content'] },
  BlockingQuestion: { json: [], string: ['question'] },
  DataModelVersion: { json: ['entities'], string: ['diagram'] },
  ApiSpecVersion: { json: ['endpoints'], string: [] },
  ScreenMapVersion: { json: ['screens', 'navigation'], string: ['diagram'] },
  ProjectArchitecture: { json: [], string: ['justification'] },
  TestPlanVersion: { json: ['content'], string: [] },
  GeneratedDocument: { json: [], string: ['content'] },
};

function toEnvelope(value) {
  const { encryptedKey, iv, ciphertext, tag } = hybridCipher.encrypt(value, env.jwt.rsaPublicKey);
  return {
    __enc: ENVELOPE_VERSION,
    k: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    ct: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function isEnvelope(value) {
  return Boolean(value) && typeof value === 'object' && value.__enc === ENVELOPE_VERSION;
}

function fromEnvelope(envelope) {
  return hybridCipher.decrypt(
    {
      encryptedKey: Buffer.from(envelope.k, 'base64'),
      iv: Buffer.from(envelope.iv, 'base64'),
      ciphertext: Buffer.from(envelope.ct, 'base64'),
      tag: Buffer.from(envelope.tag, 'base64'),
    },
    env.jwt.rsaPrivateKey
  );
}

function encryptJsonField(value) {
  if (value === null || value === undefined) return value;
  return toEnvelope(value);
}

function decryptJsonField(value) {
  // No cifrado (dato preexistente, o un valor que no es un sobre) - se
  // devuelve tal cual en vez de tirar, para no romper si alguna vez hay
  // datos sin migrar.
  return isEnvelope(value) ? fromEnvelope(value) : value;
}

function encryptStringField(value) {
  if (value === null || value === undefined) return value;
  return JSON.stringify(toEnvelope(value));
}

function decryptStringField(value) {
  if (typeof value !== 'string') return value;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return value; // no es un sobre cifrado (dato preexistente en texto plano).
  }
  return isEnvelope(parsed) ? fromEnvelope(parsed) : value;
}

function encryptData(model, data) {
  const config = FIELD_CONFIG[model];
  if (!config || !data || typeof data !== 'object') return data;

  const result = { ...data };
  config.json.forEach((field) => {
    if (field in result) result[field] = encryptJsonField(result[field]);
  });
  config.string.forEach((field) => {
    if (field in result) result[field] = encryptStringField(result[field]);
  });
  return result;
}

function decryptRecord(model, record) {
  const config = FIELD_CONFIG[model];
  if (!config || !record || typeof record !== 'object') return record;

  config.json.forEach((field) => {
    if (field in record) record[field] = decryptJsonField(record[field]);
  });
  config.string.forEach((field) => {
    if (field in record) record[field] = decryptStringField(record[field]);
  });
  return record;
}

function decryptResult(model, result) {
  if (Array.isArray(result)) {
    result.forEach((item) => decryptRecord(model, item));
    return result;
  }
  return decryptRecord(model, result);
}

const SINGLE_DATA_WRITE_OPS = new Set(['create', 'update']);

/**
 * Envuelve un PrismaClient (recien construido, o ya extendido con otra
 * cosa) para que las lecturas/escrituras de los campos de FIELD_CONFIG
 * queden cifradas en la base, de forma transparente para quien llama.
 */
function withFieldEncryption(prismaClient) {
  return prismaClient.$extends({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (FIELD_CONFIG[model]) {
            if (SINGLE_DATA_WRITE_OPS.has(operation) && args.data) {
              args.data = encryptData(model, args.data);
            }
            if (operation === 'upsert') {
              if (args.create) args.create = encryptData(model, args.create);
              if (args.update) args.update = encryptData(model, args.update);
            }
          }

          const result = await query(args);

          if (FIELD_CONFIG[model] && result) {
            decryptResult(model, result);
          }

          return result;
        },
      },
    },
  });
}

module.exports = { withFieldEncryption, FIELD_CONFIG };
