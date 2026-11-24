const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { updateEntitiesSchema } = require('../../common/dto/data-model.dto');
const { refineInstructionSchema } = require('../../common/dto/refine.dto');
const {
  getDataModelController,
  generateDataModelController,
  refineDataModelController,
  updateEntitiesController,
  approveVersionController,
} = require('./data-model.controller');

const router = Router();

router.use(requireAuth);

// Cualquier miembro puede VER el estado; solo owner/editor pueden generar o
// editar, y solo owner aprueba. Generar no es una lectura: sobrescribe el
// borrador vigente de la etapa, asi que exige el mismo rol que editar a
// mano (hallazgo H-01 de la revision transversal: antes alcanzaba con ser
// miembro, y un viewer podia pisar el borrador con una generacion nueva).
router.get('/:projectId/data-model', requireProjectMembership, getDataModelController);

router.post(
  '/:projectId/data-model/generate',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateDataModelController
);

router.post(
  '/:projectId/data-model/refine',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(refineInstructionSchema),
  refineDataModelController
);

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
