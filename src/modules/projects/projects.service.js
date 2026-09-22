/**
 * Servicio de proyectos.
 *
 * Es la unica puerta de entrada para crear proyectos. Ningun controller debe
 * llamar a `prisma.project.create` directo: la membresia `owner` se crea en la
 * misma operacion que el proyecto y esa garantia se pierde si se lo saltea.
 */
const prisma = require('../../database/client');

class ProjectNotFoundError extends Error {}

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  isPrivate: true,
  createdAt: true,
  createdById: true,
};

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
    select: PROJECT_SELECT,
  });
}

async function getProjectById(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ...PROJECT_SELECT, updatedAt: true },
  });

  if (!project) {
    throw new ProjectNotFoundError('Proyecto no encontrado');
  }

  return project;
}

/**
 * Lista solo los proyectos donde el usuario tiene una membresia, sin importar
 * el rol. La privacidad no se filtra aca porque ya esta implicita: si no es
 * miembro, no aparece.
 */
async function listProjectsForUser(userId) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    select: PROJECT_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Actualiza un proyecto. No valida rol: eso lo resuelve `requireRole('owner')`
 * antes de llegar al controller.
 */
async function updateProject(projectId, data) {
  return prisma.project.update({
    where: { id: projectId },
    data,
    select: { ...PROJECT_SELECT, updatedAt: true },
  });
}

async function deleteProject(projectId) {
  await prisma.project.delete({ where: { id: projectId } });
}

module.exports = {
  createProject,
  getProjectById,
  listProjectsForUser,
  updateProject,
  deleteProject,
  ProjectNotFoundError,
};
