/**
 * Servicio de miembros de proyecto.
 *
 * Los controllers nunca tocan Prisma directo: este servicio es la unica
 * puerta de entrada, para que la regla "todo proyecto necesita al menos un
 * owner" (ver `assertNotLastOwner`) no se pueda saltear desde otro camino.
 */
const prisma = require('../../database/client');

class MemberNotFoundError extends Error {}
class UserNotFoundError extends Error {}
class MemberAlreadyExistsError extends Error {}
class LastOwnerError extends Error {}

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, email: true, fullName: true } },
};

async function listMembers(projectId) {
  return prisma.projectMember.findMany({
    where: { projectId },
    select: MEMBER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function inviteMember({ projectId, email, role, invitedById }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UserNotFoundError('No existe un usuario registrado con ese email');
  }

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } },
  });
  if (existing) {
    throw new MemberAlreadyExistsError('El usuario ya es miembro del proyecto');
  }

  return prisma.projectMember.create({
    data: { projectId, userId: user.id, role, createdById: invitedById },
    select: MEMBER_SELECT,
  });
}

async function findMemberOrThrow(projectId, memberId) {
  const member = await prisma.projectMember.findUnique({ where: { id: memberId } });
  if (!member || member.projectId !== projectId) {
    throw new MemberNotFoundError('Miembro no encontrado');
  }
  return member;
}

// Si el miembro es owner y la operacion lo dejaria de serlo (cambio de rol o
// baja), hay que asegurarse de que quede al menos otro owner: sin esta
// validacion un proyecto podria quedar sin nadie con permisos para
// gestionarlo.
async function assertNotLastOwner(projectId, member) {
  if (member.role !== 'owner') return;

  const owners = await prisma.projectMember.count({ where: { projectId, role: 'owner' } });
  if (owners <= 1) {
    throw new LastOwnerError('El proyecto debe tener al menos un owner');
  }
}

async function updateMemberRole(projectId, memberId, role) {
  const member = await findMemberOrThrow(projectId, memberId);

  if (role !== 'owner') {
    await assertNotLastOwner(projectId, member);
  }

  return prisma.projectMember.update({
    where: { id: memberId },
    data: { role },
    select: MEMBER_SELECT,
  });
}

async function removeMember(projectId, memberId) {
  const member = await findMemberOrThrow(projectId, memberId);
  await assertNotLastOwner(projectId, member);
  await prisma.projectMember.delete({ where: { id: memberId } });
}

module.exports = {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  MemberNotFoundError,
  UserNotFoundError,
  MemberAlreadyExistsError,
  LastOwnerError,
};
