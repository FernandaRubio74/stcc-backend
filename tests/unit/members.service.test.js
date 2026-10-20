/**
 * Tests del servicio de miembros de proyecto.
 *
 * El foco esta en la invariante "todo proyecto necesita al menos un owner":
 * sin ella, remover o degradar al ultimo owner dejaria el proyecto sin nadie
 * con permisos para gestionarlo (ni siquiera para agregar otro owner).
 *
 * Corre contra Postgres real, siguiendo el patron de tests/unit/schema.test.js.
 */

const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const membersService = require('../../src/modules/projects/members.service');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

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

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyectoConOwner(email = 'owner@ideator.com') {
  const owner = await crearUsuario(email);
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  return { owner, project };
}

describe('listMembers', () => {
  test('devuelve los miembros del proyecto con los datos del usuario', async () => {
    const { owner, project } = await crearProyectoConOwner();

    const members = await membersService.listMembers(project.id);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      role: 'owner',
      user: { id: owner.id, email: owner.email, fullName: owner.fullName },
    });
  });
});

describe('inviteMember', () => {
  test('agrega al usuario como miembro con el rol indicado', async () => {
    const { project } = await crearProyectoConOwner();
    const invitado = await crearUsuario('invitado@ideator.com');

    const member = await membersService.inviteMember({
      projectId: project.id,
      email: invitado.email,
      role: 'editor',
      invitedById: undefined,
    });

    expect(member).toMatchObject({ role: 'editor', user: { id: invitado.id } });

    const members = await membersService.listMembers(project.id);
    expect(members).toHaveLength(2);
  });

  test('tira UserNotFoundError si no existe un usuario con ese email', async () => {
    const { project } = await crearProyectoConOwner();

    await expect(
      membersService.inviteMember({
        projectId: project.id,
        email: 'no-existe@ideator.com',
        role: 'viewer',
      })
    ).rejects.toBeInstanceOf(membersService.UserNotFoundError);
  });

  test('tira MemberAlreadyExistsError si el usuario ya es miembro', async () => {
    const { owner, project } = await crearProyectoConOwner();

    await expect(
      membersService.inviteMember({
        projectId: project.id,
        email: owner.email,
        role: 'viewer',
      })
    ).rejects.toBeInstanceOf(membersService.MemberAlreadyExistsError);
  });
});

describe('updateMemberRole', () => {
  test('actualiza el rol del miembro', async () => {
    const { project } = await crearProyectoConOwner();
    const invitado = await crearUsuario('cambia-rol@ideator.com');
    const member = await membersService.inviteMember({
      projectId: project.id,
      email: invitado.email,
      role: 'viewer',
    });

    const actualizado = await membersService.updateMemberRole(project.id, member.id, 'editor');

    expect(actualizado.role).toBe('editor');
  });

  test('tira MemberNotFoundError si el miembro no existe', async () => {
    const { project } = await crearProyectoConOwner();

    await expect(
      membersService.updateMemberRole(project.id, UUID_INEXISTENTE, 'editor')
    ).rejects.toBeInstanceOf(membersService.MemberNotFoundError);
  });

  test('tira MemberNotFoundError si el miembro pertenece a otro proyecto', async () => {
    const { project: proyectoA } = await crearProyectoConOwner('owner-a@ideator.com');
    const { project: proyectoB } = await crearProyectoConOwner('owner-b@ideator.com');
    const invitado = await crearUsuario('cruzado@ideator.com');
    const member = await membersService.inviteMember({
      projectId: proyectoA.id,
      email: invitado.email,
      role: 'viewer',
    });

    await expect(
      membersService.updateMemberRole(proyectoB.id, member.id, 'editor')
    ).rejects.toBeInstanceOf(membersService.MemberNotFoundError);
  });

  test('tira LastOwnerError si degrada al unico owner', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: owner.id, projectId: project.id } },
    });

    await expect(
      membersService.updateMemberRole(project.id, membership.id, 'editor')
    ).rejects.toBeInstanceOf(membersService.LastOwnerError);
  });

  test('permite degradar a un owner si hay otro owner', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const segundoOwner = await crearUsuario('segundo-owner@ideator.com');
    await membersService.inviteMember({
      projectId: project.id,
      email: segundoOwner.email,
      role: 'owner',
    });

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: owner.id, projectId: project.id } },
    });
    const actualizado = await membersService.updateMemberRole(project.id, membership.id, 'editor');

    expect(actualizado.role).toBe('editor');
  });
});

describe('removeMember', () => {
  test('elimina al miembro', async () => {
    const { project } = await crearProyectoConOwner();
    const invitado = await crearUsuario('a-eliminar@ideator.com');
    const member = await membersService.inviteMember({
      projectId: project.id,
      email: invitado.email,
      role: 'viewer',
    });

    await membersService.removeMember(project.id, member.id);

    const members = await membersService.listMembers(project.id);
    expect(members.map((m) => m.id)).not.toContain(member.id);
  });

  test('tira LastOwnerError si elimina al unico owner', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: owner.id, projectId: project.id } },
    });

    await expect(membersService.removeMember(project.id, membership.id)).rejects.toBeInstanceOf(
      membersService.LastOwnerError
    );
  });

  test('tira MemberNotFoundError si el miembro no existe', async () => {
    const { project } = await crearProyectoConOwner();

    await expect(
      membersService.removeMember(project.id, UUID_INEXISTENTE)
    ).rejects.toBeInstanceOf(membersService.MemberNotFoundError);
  });
});
