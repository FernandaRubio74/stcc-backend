const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const {
  requirePermission,
} = require('../../common/middlewares/require-permission.middleware');
const { PERMISSIONS } = require('../../common/utils/permissions');
const { createProjectSchema } = require('../../common/dto/projects.dto');
const {
  createProjectController,
  getProjectController,
} = require('./projects.controller');

const router = Router();

// Toda ruta de proyectos exige un usuario autenticado.
router.use(requireAuth);

router.post('/', validate(createProjectSchema), createProjectController);

// Los guards van antes del controller: si el usuario no es miembro, o su rol no
// alcanza, la request muere aca y el handler nunca ve el proyecto.
//   requireProjectMembership -> entras al proyecto  (404 / 403)
//   requirePermission        -> podes hacer ESTO    (403)
router.get(
  '/:projectId',
  requireProjectMembership,
  requirePermission(PERMISSIONS.PROJECT_READ),
  getProjectController
);

module.exports = router;
