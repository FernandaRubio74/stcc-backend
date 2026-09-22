const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const {
  createProjectSchema,
  updateProjectSchema,
} = require('../../common/dto/projects.dto');
const {
  createProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
  deleteProjectController,
} = require('./projects.controller');

const router = Router();

// Toda ruta de proyectos exige un usuario autenticado.
router.use(requireAuth);

router.post('/', validate(createProjectSchema), createProjectController);
router.get('/', listProjectsController);

// El guard va antes del controller: si el usuario no es miembro, la request
// muere aca y el handler nunca ve el proyecto.
router.get('/:projectId', requireProjectMembership, getProjectController);

// PATCH/DELETE ademas exigen rol owner: requireRole corre despues del guard
// de membresia, ya que necesita req.projectMembership.role.
router.patch(
  '/:projectId',
  requireProjectMembership,
  requireRole('owner'),
  validate(updateProjectSchema),
  updateProjectController
);
router.delete(
  '/:projectId',
  requireProjectMembership,
  requireRole('owner'),
  deleteProjectController
);

module.exports = router;
