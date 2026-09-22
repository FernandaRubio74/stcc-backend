/**
 * T-007.1 - Tests del guard de pertenencia a proyecto.
 *
 * Corre contra Postgres real (no se mockea Prisma), siguiendo el patron de
 * tests/unit/schema.test.js. El middleware se invoca directo con req/res/next
 * falsos: no hace falta levantar Express porque el guard no depende de nada
 * del router mas alla de req.params.
 *
 * Preparacion: ver el encabezado de tests/unit/schema.test.js.
 */

const { PrismaClient } = require('@prisma/client');
const {
  createRequireProjectMembership,
} = require('../../src/common/middlewares/project-member.middleware');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

const guard = createRequireProjectMembership({ prisma });

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

// --- Dobles minimos de req/res/next -------------------------------------

function buildRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildNext() {
  const next = (err) => {
    next.called = true;
    next.error = err;
  };
  next.called = false;
  next.error = undefined;
  return next;
}

async function cleanDatabase() {
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

/** Crea un proyecto con su dueno y, opcionalmente, un miembro extra. */
async function seedProject({ memberRole } = {}) {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}@ideator.com`, fullName: 'Owner' },
  });
  const project = await prisma.project.create({
    data: { name: 'Proyecto guard', createdById: owner.id },
  });

  let member = null;
  if (memberRole) {
    member = await prisma.user.create({
      data: { email: `member-${Date.now()}@ideator.com`, fullName: 'Member' },
    });
    await prisma.projectMember.create({
      data: { userId: member.id, projectId: project.id, role: memberRole },
    });
  }

  return { owner, project, member };
}

// ------------------------------------------------------------------------

describe('requireProjectMembership - acceso permitido', () => {
  test.each(['owner', 'editor', 'viewer'])(
    'deja pasar a un miembro con rol %s',
    async (role) => {
      const { project, member } = await seedProject({ memberRole: role });

      const req = { user: { id: member.id }, params: { projectId: project.id } };
      const res = buildRes();
      const next = buildNext();

      await guard(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeUndefined();
      expect(res.statusCode).toBeNull();
    }
  );

  test('expone la membresia en req.projectMembership para la matriz de permisos (T-008)', async () => {
    const { project, member } = await seedProject({ memberRole: 'editor' });

    const req = { user: { id: member.id }, params: { projectId: project.id } };
    await guard(req, buildRes(), buildNext());

    expect(req.projectMembership).toMatchObject({
      projectId: project.id,
      userId: member.id,
      role: 'editor',
    });
    expect(req.projectMembership.id).toEqual(expect.any(String));
  });
});

describe('requireProjectMembership - acceso denegado', () => {
  test('responde 404 si el usuario no es miembro del proyecto', async () => {
    const { project } = await seedProject();
    const ajeno = await prisma.user.create({
      data: { email: 'ajeno@ideator.com', fullName: 'Ajeno' },
    });

    const req = { user: { id: ajeno.id }, params: { projectId: project.id } };
    const res = buildRes();
    const next = buildNext();

    await guard(req, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Proyecto no encontrado' });
  });

  test('el creador del proyecto SIN fila en ProjectMember tampoco pasa', async () => {
    // El acceso se resuelve siempre via ProjectMember: Project.created_by no
    // es fuente de verdad de autorizacion.
    const { owner, project } = await seedProject();

    const req = { user: { id: owner.id }, params: { projectId: project.id } };
    const res = buildRes();

    await guard(req, res, buildNext());

    expect(res.statusCode).toBe(404);
  });

  test('un proyecto inexistente responde igual que uno ajeno (no filtra existencia)', async () => {
    const { project } = await seedProject();
    const ajeno = await prisma.user.create({
      data: { email: 'ajeno2@ideator.com', fullName: 'Ajeno 2' },
    });

    const resAjeno = buildRes();
    await guard(
      { user: { id: ajeno.id }, params: { projectId: project.id } },
      resAjeno,
      buildNext()
    );

    const resInexistente = buildRes();
    await guard(
      { user: { id: ajeno.id }, params: { projectId: UUID_INEXISTENTE } },
      resInexistente,
      buildNext()
    );

    expect(resInexistente.statusCode).toBe(resAjeno.statusCode);
    expect(resInexistente.body).toEqual(resAjeno.body);
  });

  test('responde 404 si el projectId no es un UUID valido', async () => {
    const res = buildRes();
    const next = buildNext();

    await guard(
      { user: { id: UUID_INEXISTENTE }, params: { projectId: 'no-es-uuid' } },
      res,
      next
    );

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 si falta el parametro projectId', async () => {
    const res = buildRes();
    await guard({ user: { id: UUID_INEXISTENTE }, params: {} }, res, buildNext());
    expect(res.statusCode).toBe(404);
  });

  test('responde 401 si el guard corre sin requireAuth previo', async () => {
    const res = buildRes();
    const next = buildNext();

    await guard({ params: { projectId: UUID_INEXISTENTE } }, res, next);

    expect(next.called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'No autenticado' });
  });
});

describe('requireProjectMembership - configuracion', () => {
  test('permite renombrar el parametro de ruta', async () => {
    const { project, member } = await seedProject({ memberRole: 'viewer' });
    const guardById = createRequireProjectMembership({ prisma, param: 'id' });

    const req = { user: { id: member.id }, params: { id: project.id } };
    const next = buildNext();

    await guardById(req, buildRes(), next);

    expect(next.called).toBe(true);
    expect(req.projectMembership.role).toBe('viewer');
  });

  test('delega al manejador de errores si Prisma falla', async () => {
    const prismaRoto = {
      projectMember: {
        findUnique: () => Promise.reject(new Error('conexion caida')),
      },
    };
    const guardRoto = createRequireProjectMembership({ prisma: prismaRoto });

    const res = buildRes();
    const next = buildNext();

    await guardRoto(
      { user: { id: UUID_INEXISTENTE }, params: { projectId: UUID_INEXISTENTE } },
      res,
      next
    );

    expect(res.statusCode).toBeNull();
    expect(next.called).toBe(true);
    expect(next.error).toBeInstanceOf(Error);
  });
});
