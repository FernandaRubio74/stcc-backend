const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateTestPlanContentSchema } = require('../../common/dto/testing.dto');
const { refineInstructionSchema } = require('../../common/dto/refine.dto');
const {
  getTestPlanController,
  generateTestPlanController,
  refineTestPlanController,
  updateContentController,
  approveVersionController,
} = require('./testing.controller');

const router = Router();

router.use(requireAuth);

// Mismo esquema de permisos que data-model/api-spec: cualquier miembro ve y
// genera, solo owner/editor edita a mano, solo owner aprueba.
router.get('/:projectId/testing', requireProjectMembership, getTestPlanController);

// Generar sobrescribe el borrador vigente: exige el mismo rol que editar a
// mano (hallazgo H-01 de la revision transversal).
router.post(
  '/:projectId/testing/generate',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateTestPlanController
);

router.post(
  '/:projectId/testing/refine',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(refineInstructionSchema),
  refineTestPlanController
);

router.patch(
  '/:projectId/testing/content',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(updateTestPlanContentSchema),
  updateContentController
);

router.post('/:projectId/testing/approve', requireProjectMembership, requireRole('owner'), approveVersionController);

module.exports = router;
