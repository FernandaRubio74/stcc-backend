const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { getConsistencyCheckController, postFinalGenerationController } = require('./consistency.controller');

const router = Router();

router.use(requireAuth);

router.get('/:projectId/consistency-check', requireProjectMembership, getConsistencyCheckController);
router.post('/:projectId/consistency-check/final-generation', requireProjectMembership, postFinalGenerationController);

module.exports = router;
