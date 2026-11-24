const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { postDefinitionMessageSchema } = require('../../common/dto/definition.dto');
const {
  getDefinitionController,
  postMessageController,
  listBlockingQuestionsController,
  advanceStageController,
} = require('./definition.controller');

const router = Router();

router.use(requireAuth);

// Cualquier miembro puede LEER la conversacion y los bloqueos. Participar
// del wizard si modifica el proyecto (persiste mensajes y reescribe los
// datos estructurados de la definicion, que alimentan todas las etapas
// siguientes), asi que exige owner/editor igual que el resto de las
// acciones de edicion - un viewer no puede cambiar la definicion
// (hallazgo H-01 de la revision transversal).
router.get('/:projectId/definition', requireProjectMembership, getDefinitionController);

router.post(
  '/:projectId/definition/messages',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  validate(postDefinitionMessageSchema),
  postMessageController
);

router.get(
  '/:projectId/definition/blocking-questions',
  requireProjectMembership,
  listBlockingQuestionsController
);

router.post(
  '/:projectId/definition/advance',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  advanceStageController
);

module.exports = router;
