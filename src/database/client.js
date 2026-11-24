/**
 * Cliente Prisma compartido por la aplicacion.
 *
 * Se centraliza aca para que los middlewares y servicios no instancien un
 * PrismaClient por modulo (cada instancia abre su propio pool de conexiones).
 *
 * Extendido con cifrado de datos en reposo (ver fieldEncryption.js): el
 * contenido real del proyecto (idea, modelo de datos, API, pantallas, plan
 * de pruebas, documentos finales) se cifra antes de escribirse y se
 * descifra al leerse, de forma transparente para todos los servicios.
 */
const { PrismaClient } = require('@prisma/client');
const { withFieldEncryption } = require('./fieldEncryption');

const prisma = withFieldEncryption(new PrismaClient());

module.exports = prisma;
