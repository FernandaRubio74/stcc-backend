/**
 * T-008.3 - Validacion de integridad post-migracion del modelo de roles.
 *
 * US-008 no requiere una migracion nueva: el enum `ProjectRole` y el default
 * `viewer` existen desde T-004, ya aplicados sobre la base. Lo que si hace
 * falta es **verificar contra Postgres real** que lo que la matriz de permisos
 * asume es lo que la base efectivamente tiene — si el enum de la BD y la matriz
 * del codigo se desincronizan, la autorizacion decide sobre roles que no
 * existen (o deja afuera roles que si).
 *
 * Estos tests consultan el catalogo de Postgres, no el schema.prisma: prueban
 * el estado real de la base migrada, no la intencion declarada.
 */

const { PrismaClient } = require('@prisma/client');
const { ROLE_PERMISSIONS } = require('../../src/common/utils/permissions');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('enum ProjectRole en la base migrada', () => {
  test('tiene exactamente los tres roles esperados', async () => {
    const filas = await prisma.$queryRaw`
      SELECT e.enumlabel AS role
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ProjectRole'
      ORDER BY e.enumsortorder`;

    expect(filas.map((f) => f.role)).toEqual(['owner', 'editor', 'viewer']);
  });

  test('los roles de la base y los de la matriz de permisos coinciden', async () => {
    const filas = await prisma.$queryRaw`
      SELECT e.enumlabel AS role
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ProjectRole'`;

    const enBase = filas.map((f) => f.role).sort();
    const enMatriz = Object.keys(ROLE_PERMISSIONS).sort();

    expect(enMatriz).toEqual(enBase);
  });

  test('el default de project_members.role es el rol mas restrictivo', async () => {
    // Que el default sea `viewer` y no `editor` es una decision de seguridad:
    // una membresia creada sin rol explicito debe caer en el minimo privilegio.
    const filas = await prisma.$queryRaw`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'project_members' AND column_name = 'role'`;

    expect(filas[0].column_default).toContain('viewer');
  });

  test('role es NOT NULL: ninguna membresia puede quedar sin rol', async () => {
    const filas = await prisma.$queryRaw`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'project_members' AND column_name = 'role'`;

    expect(filas[0].is_nullable).toBe('NO');
  });
});

describe('integridad de los datos existentes', () => {
  test('ninguna membresia tiene un rol fuera de la matriz de permisos', async () => {
    // Post-migracion: si quedaran filas de Sprint 1 con un rol que la matriz no
    // conoce, `can()` las denegaria todo silenciosamente. Mejor que falle aca.
    const filas = await prisma.$queryRaw`
      SELECT DISTINCT role::text AS role FROM project_members`;

    const rolesConocidos = Object.keys(ROLE_PERMISSIONS);
    for (const fila of filas) {
      expect(rolesConocidos).toContain(fila.role);
    }
  });
});
