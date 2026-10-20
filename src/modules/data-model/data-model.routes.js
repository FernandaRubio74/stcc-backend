const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateEntitiesSchema } = require('../../common/dto/data-model.dto');
const {
  getDataModelController,
  generateDataModelController,
  updateEntitiesController,
  approveVersionController,
} = require('./data-model.controller');

const router = Router();

router.use(requireAuth);

// Cualquier miembro puede ver el estado y disparar la generacion (igual que
// el wizard); solo owner/editor pueden editar a mano, y solo owner aprueba.
router.get('/:projectId/data-model', requireProjectMembership, getDataModelController);

router.post('/:projectId/data-model/generate', requireProjectMembership, generateDataModelController);

router.patch(
  '/:projectId/data-model/entities',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(updateEntitiesSchema),
  updateEntitiesController
);

router.post(
  '/:projectId/data-model/approve',
  requireProjectMembership,
  requireRole('owner'),
  approveVersionController
);

module.exports = router;
