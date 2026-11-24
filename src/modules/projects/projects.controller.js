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
  const project = await projectsService.getProjectById(req.params.projectId);

  return res.status(200).json({
    ...project,
    role: req.projectMembership.role,
  });
}

async function listProjectsController(req, res) {
  const projects = await projectsService.listProjectsForUser(req.user.id);
  return res.status(200).json(projects);
}

async function updateProjectController(req, res) {
  const project = await projectsService.updateProject(req.params.projectId, req.body);
  return res.status(200).json(project);
}

async function deleteProjectController(req, res) {
  await projectsService.deleteProject(req.params.projectId);
  return res.status(204).send();
}

module.exports = {
  createProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
  deleteProjectController,
};
