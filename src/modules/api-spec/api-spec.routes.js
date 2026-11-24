const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateEndpointsSchema } = require('../../common/dto/api-spec.dto');
const { refineInstructionSchema } = require('../../common/dto/refine.dto');
const {
  getApiSpecController,
  generateApiSpecController,
  refineApiSpecController,
  updateEndpointsController,
  approveVersionController,
} = require('./api-spec.controller');

const router = Router();

router.use(requireAuth);

// Mismo esquema de permisos que data-model: cualquier miembro ve/genera, solo
// owner/editor edita a mano, y solo owner aprueba.
router.get('/:projectId/api-spec', requireProjectMembership, getApiSpecController);

// Generar sobrescribe el borrador vigente: exige el mismo rol que editar a
// mano (hallazgo H-01 de la revision transversal).
router.post(
  '/:projectId/api-spec/generate',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateApiSpecController
);

router.post(
  '/:projectId/api-spec/refine',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(refineInstructionSchema),
  refineApiSpecController
);

router.patch(
  '/:projectId/api-spec/endpoints',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(updateEndpointsSchema),
  updateEndpointsController
);

router.post(
  '/:projectId/api-spec/approve',
  requireProjectMembership,
  requireRole('owner'),
  approveVersionController
);

module.exports = router;
