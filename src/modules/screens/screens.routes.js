const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateScreensSchema } = require('../../common/dto/screens.dto');
const { refineInstructionSchema } = require('../../common/dto/refine.dto');
const {
  getScreenMapController,
  generateScreenMapController,
  refineScreensController,
  updateScreensController,
  approveVersionController,
} = require('./screens.controller');

const router = Router();

router.use(requireAuth);

// Mismo esquema de permisos que data-model/api-spec: cualquier miembro ve
// y genera, solo owner/editor edita a mano, solo owner aprueba.
router.get('/:projectId/screens', requireProjectMembership, getScreenMapController);

// Generar sobrescribe el borrador vigente: exige el mismo rol que editar a
// mano (hallazgo H-01 de la revision transversal).
router.post(
  '/:projectId/screens/generate',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateScreenMapController
);

router.post(
  '/:projectId/screens/refine',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(refineInstructionSchema),
  refineScreensController
);

router.patch(
  '/:projectId/screens',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(updateScreensSchema),
  updateScreensController
);

router.post('/:projectId/screens/approve', requireProjectMembership, requireRole('owner'), approveVersionController);

module.exports = router;
