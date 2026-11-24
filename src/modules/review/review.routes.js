const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { getReviewSummaryController } = require('./review.controller');

const router = Router();

router.use(requireAuth);

// Accesible unicamente por miembros del proyecto (requireProjectMembership, T-007).
router.get('/:projectId/review-summary', requireProjectMembership, getReviewSummaryController);

module.exports = router;
