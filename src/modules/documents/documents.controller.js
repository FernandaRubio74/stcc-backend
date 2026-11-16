const documentsService = require('./documents.service');
const { ProjectNotReadyError, DocumentNotFoundError } = require('./documents.errors');

async function listDocumentsController(req, res) {
  const documents = await documentsService.listDocuments(req.params.projectId);
  return res.status(200).json(documents);
}

async function getDocumentController(req, res) {
  try {
    const document = await documentsService.getDocument(req.params.projectId, req.params.documentId);
    return res.status(200).json(document);
  } catch (err) {
    if (err instanceof DocumentNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    throw err;
  }
}

/**
 * T-035.2/T-035.3 - El 409 viaja con el detalle de lo que falta (etapas
 * incompletas, preguntas bloqueantes e inconsistencias) para que la pantalla
 * de revision pueda llevar al usuario directo al bloqueo.
 */
async function generateSpecDocumentController(req, res) {
  try {
    const document = await documentsService.generateSpecDocument(req.params.projectId, req.user.id);
    return res.status(201).json(document);
  } catch (err) {
    if (err instanceof ProjectNotReadyError) {
      return res.status(409).json({ error: err.message, blockers: err.blockers });
    }
    throw err;
  }
}

module.exports = { listDocumentsController, getDocumentController, generateSpecDocumentController };
