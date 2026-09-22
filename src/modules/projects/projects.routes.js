const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { createProjectSchema } = require('../../common/dto/projects.dto');
const {
  createProjectController,
  getProjectController,
} = require('./projects.controller');

const router = Router();

// Toda ruta de proyectos exige un usuario autenticado.
router.use(requireAuth);

router.post('/', validate(createProjectSchema), createProjectController);

// El guard va antes del controller: si el usuario no es miembro, la request
// muere aca y el handler nunca ve el proyecto.
router.get('/:projectId', requireProjectMembership, getProjectController);

module.exports = router;
