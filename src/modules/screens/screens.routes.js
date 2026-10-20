const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { getScreenMapController, generateScreenMapController } = require('./screens.controller');

const router = Router();

router.use(requireAuth);

// Igual que data-model/api-spec: cualquier miembro ve el estado y dispara la generacion.
router.get('/:projectId/screens', requireProjectMembership, getScreenMapController);
router.post('/:projectId/screens/generate', requireProjectMembership, generateScreenMapController);

module.exports = router;
