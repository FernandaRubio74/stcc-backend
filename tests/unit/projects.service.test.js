/**
 * Tests del servicio de proyectos.
 *
 * El foco esta en la invariante que sostiene todo el modelo de autorizacion:
 * **no puede existir un proyecto sin su membresia `owner`**. Si esa fila
 * faltara, el guard de pertenencia (que resuelve el acceso unicamente via
 * ProjectMember) dejaria al creador afuera de su propio proyecto con un 404.
 *
 * Corre contra Postgres real, siguiendo el patron de tests/unit/schema.test.js.
 */

const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

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

function crearUsuario(email = 'creador@ideator.com') {
  return prisma.user.create({ data: { email, fullName: 'Creador' } });
}

describe('createProject', () => {
  test('crea el proyecto con los datos recibidos', async () => {
    const user = await crearUsuario();

    const project = await projectsService.createProject({
      name: 'Ideator MVP',
      description: 'Primer proyecto',
      userId: user.id,
    });

    expect(project).toMatchObject({
      name: 'Ideator MVP',
      description: 'Primer proyecto',
      createdById: user.id,
      isPrivate: true, // privado por defecto
    });
    expect(project.id).toEqual(expect.any(String));
  });

  test('crea la membresia owner del creador en la misma operacion', async () => {
    const user = await crearUsuario();

    const project = await projectsService.createProject({
      name: 'Con owner',
      userId: user.id,
    });

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
    });

    expect(membership).not.toBeNull();
    expect(membership.role).toBe('owner');
    expect(membership.createdById).toBe(user.id);
  });

  test('crea exactamente una membresia, no mas', async () => {
    const user = await crearUsuario();
    const project = await projectsService.createProject({
      name: 'Una sola',
      userId: user.id,
    });

    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id },
    });

    expect(members).toHaveLength(1);
  });

  test('es atomico: si falla la creacion no queda proyecto huerfano', async () => {
    // userId inexistente -> la FK de project_members.user_id revienta. Como el
    // nested write corre en una sola transaccion, el proyecto tampoco debe
    // quedar creado.
    const antes = await prisma.project.count();

    await expect(
      projectsService.createProject({
        name: 'Deberia hacer rollback',
        userId: '00000000-0000-4000-8000-000000000000',
      })
    ).rejects.toThrow();

    expect(await prisma.project.count()).toBe(antes);
  });
});

describe('invariante de integridad', () => {
  test('ningun proyecto queda sin membresia owner', async () => {
    // Red de seguridad: si alguien abre un camino alternativo para crear
    // proyectos que se saltea projects.service, este test lo caza en CI.
    const user = await crearUsuario();
    await projectsService.createProject({ name: 'A', userId: user.id });
    await projectsService.createProject({ name: 'B', userId: user.id });

    const huerfanos = await prisma.$queryRaw`
      SELECT p.id
      FROM projects p
      WHERE NOT EXISTS (
        SELECT 1 FROM project_members m
        WHERE m.project_id = p.id AND m.role = 'owner'
      )`;

    expect(huerfanos).toHaveLength(0);
  });
});

describe('getProjectById', () => {
  test('devuelve el proyecto sin exponer la lista de miembros', async () => {
    const user = await crearUsuario();
    const creado = await projectsService.createProject({
      name: 'Buscable',
      userId: user.id,
    });

    const project = await projectsService.getProjectById(creado.id);

    expect(project).toMatchObject({ id: creado.id, name: 'Buscable' });
    expect(project.members).toBeUndefined();
  });

  test('tira ProjectNotFoundError si no existe', async () => {
    await expect(
      projectsService.getProjectById('00000000-0000-4000-8000-000000000000')
    ).rejects.toBeInstanceOf(projectsService.ProjectNotFoundError);
  });
});
