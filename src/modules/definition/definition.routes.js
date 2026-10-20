const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { postDefinitionMessageSchema } = require('../../common/dto/definition.dto');
const {
  getDefinitionController,
  postMessageController,
  listBlockingQuestionsController,
  advanceStageController,
} = require('./definition.controller');

const router = Router();

router.use(requireAuth);

// Cualquier miembro del proyecto participa del wizard (no es una accion
// exclusiva de owner, a diferencia de gestionar miembros o borrar el
// proyecto).
router.get('/:projectId/definition', requireProjectMembership, getDefinitionController);

router.post(
  '/:projectId/definition/messages',
  requireProjectMembership,
  validate(postDefinitionMessageSchema),
  postMessageController
);

router.get(
  '/:projectId/definition/blocking-questions',
  requireProjectMembership,
  listBlockingQuestionsController
);

router.post('/:projectId/definition/advance', requireProjectMembership, advanceStageController);

module.exports = router;
