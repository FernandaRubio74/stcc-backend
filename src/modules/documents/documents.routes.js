const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const {
  listDocumentsController,
  getDocumentController,
  generateSpecDocumentController,
  generateArchitectureDocumentController,
  downloadBundleController,
} = require('./documents.controller');

const router = Router();

router.use(requireAuth);

// Mismo criterio de permisos que el resto de las etapas generadas
// (data-model, api-spec, screens): cualquier miembro puede ver el estado y
// disparar la generacion; generar no destruye nada, crea una version nueva.
router.post('/:projectId/documents/spec', requireProjectMembership, generateSpecDocumentController);
router.post('/:projectId/documents/architecture', requireProjectMembership, generateArchitectureDocumentController);

router.get('/:projectId/documents', requireProjectMembership, listDocumentsController);

// `bundle` va antes de `:documentId`: si no, la ruta parametrica lo capturaria
// como si fuera el id de un documento.
router.get('/:projectId/documents/bundle', requireProjectMembership, downloadBundleController);
router.get('/:projectId/documents/:documentId', requireProjectMembership, getDocumentController);

module.exports = router;
