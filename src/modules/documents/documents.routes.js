const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const {
  listDocumentsController,
  getDocumentController,
  generateSpecDocumentController,
} = require('./documents.controller');

const router = Router();

router.use(requireAuth);

// Mismo criterio de permisos que el resto de las etapas generadas
// (data-model, api-spec, screens): cualquier miembro puede ver el estado y
// disparar la generacion; generar no destruye nada, crea una version nueva.
router.post('/:projectId/documents/spec', requireProjectMembership, generateSpecDocumentController);

router.get('/:projectId/documents', requireProjectMembership, listDocumentsController);
router.get('/:projectId/documents/:documentId', requireProjectMembership, getDocumentController);

module.exports = router;
