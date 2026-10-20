const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateEndpointsSchema } = require('../../common/dto/api-spec.dto');
const {
  getApiSpecController,
  generateApiSpecController,
  updateEndpointsController,
  approveVersionController,
} = require('./api-spec.controller');

const router = Router();

router.use(requireAuth);

// Mismo esquema de permisos que data-model: cualquier miembro ve/genera, solo
// owner/editor edita a mano, y solo owner aprueba.
router.get('/:projectId/api-spec', requireProjectMembership, getApiSpecController);

router.post('/:projectId/api-spec/generate', requireProjectMembership, generateApiSpecController);

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
