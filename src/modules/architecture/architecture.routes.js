const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { selectArchitectureSchema } = require('../../common/dto/architecture.dto');
const {
  getCatalogController,
  getArchitectureController,
  recommendArchitectureController,
  selectArchitectureController,
} = require('./architecture.controller');

const router = Router();

router.use(requireAuth);

router.get('/:projectId/architecture/catalog', requireProjectMembership, getCatalogController);
router.get('/:projectId/architecture', requireProjectMembership, getArchitectureController);
router.post('/:projectId/architecture/recommend', requireProjectMembership, recommendArchitectureController);

// Confirmar/elegir arquitectura es una decision tecnica definitiva del
// proyecto: mismo criterio que aprobar el modelo de datos o la API (owner).
router.post(
  '/:projectId/architecture/select',
  requireProjectMembership,
  requireRole('owner'),
  validate(selectArchitectureSchema),
  selectArchitectureController
);

module.exports = router;
