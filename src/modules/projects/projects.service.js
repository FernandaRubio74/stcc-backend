/**
 * Servicio de proyectos.
 *
 * Es la unica puerta de entrada para crear proyectos. Ningun controller debe
 * llamar a `prisma.project.create` directo: la membresia `owner` se crea en la
 * misma operacion que el proyecto y esa garantia se pierde si se lo saltea.
 */
const prisma = require('../../database/client');

class ProjectNotFoundError extends Error {}

/**
 * Crea un proyecto junto con la membresia `owner` de su creador.
 *
 * El `members.create` anidado no es una comodidad de sintaxis: Prisma lo
 * ejecuta como una sola transaccion, asi que no existe un estado intermedio en
 * el que el proyecto ya este creado pero su owner todavia no.
 *
 * Por que importa: el guard de pertenencia (T-007.1) resuelve el acceso
 * unicamente via `ProjectMember` y no mira `Project.created_by` — que es un
 * campo de auditoria, no de autorizacion. Si esta fila no se creara, el
 * creador quedaria afuera de su propio proyecto con un 404.
 */
async function createProject({ name, description, userId }) {
  return prisma.project.create({
    data: {
      name,
      description,
      createdById: userId,
      members: {
        create: { userId, role: 'owner', createdById: userId },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      isPrivate: true,
      createdAt: true,
      createdById: true,
    },
  });
}

/**
 * Devuelve un proyecto por id. No chequea permisos: el acceso ya lo resolvio
 * `requireProjectMembership` antes de llegar aca.
 */
async function getProjectById(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      isPrivate: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
    },
  });

  if (!project) {
    throw new ProjectNotFoundError('Proyecto no encontrado');
  }

  return project;
}

module.exports = { createProject, getProjectById, ProjectNotFoundError };
