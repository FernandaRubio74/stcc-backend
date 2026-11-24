const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { requireProjectMembership } = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
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
// (data-model, api-spec, screens): cualquier miembro puede VER y descargar
// lo generado, pero generar persiste un documento nuevo en el proyecto, asi
// que exige owner/editor (hallazgo H-01 de la revision transversal).
router.post(
  '/:projectId/documents/spec',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateSpecDocumentController
);
router.post(
  '/:projectId/documents/architecture',
  requireProjectMembership,
  requireRole(['owner', 'editor']),
  generateArchitectureDocumentController
);

router.get('/:projectId/documents', requireProjectMembership, listDocumentsController);

// `bundle` va antes de `:documentId`: si no, la ruta parametrica lo capturaria
// como si fuera el id de un documento.
router.get('/:projectId/documents/bundle', requireProjectMembership, downloadBundleController);
router.get('/:projectId/documents/:documentId', requireProjectMembership, getDocumentController);

module.exports = router;
