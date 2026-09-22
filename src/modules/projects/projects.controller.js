const projectsService = require('./projects.service');

async function createProjectController(req, res) {
  const project = await projectsService.createProject({
    name: req.body.name,
    description: req.body.description,
    userId: req.user.id,
  });

  return res.status(201).json(project);
}

async function getProjectController(req, res) {
  // `requireProjectMembership` ya confirmo el acceso y dejo el rol del usuario
  // en req.projectMembership; se devuelve para que el frontend sepa que puede
  // ofrecer sin tener que preguntarlo aparte.
  const project = await projectsService.getProjectById(req.params.projectId);

  return res.status(200).json({
    ...project,
    role: req.projectMembership.role,
  });
}

module.exports = { createProjectController, getProjectController };
