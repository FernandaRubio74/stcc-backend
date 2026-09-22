/**
 * Cliente Prisma compartido por la aplicacion.
 *
 * Se centraliza aca para que los middlewares y servicios no instancien un
 * PrismaClient por modulo (cada instancia abre su propio pool de conexiones).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
