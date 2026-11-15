const archiver = require('archiver');
const documentsService = require('./documents.service');
const { ProjectNotReadyError, DocumentNotFoundError, MissingDocumentsError } = require('./documents.errors');

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

async function generateArchitectureDocumentController(req, res) {
  try {
    const document = await documentsService.generateArchitectureDocument(req.params.projectId, req.user.id);
    return res.status(201).json(document);
  } catch (err) {
    if (err instanceof ProjectNotReadyError) {
      return res.status(409).json({ error: err.message, blockers: err.blockers });
    }
    throw err;
  }
}

/**
 * T-036.3 - Descarga conjunta: zip con la ultima version de cada documento.
 *
 * Los documentos se cargan ANTES de escribir cabeceras, para poder responder
 * un 409 en JSON si falta alguno; una vez que empieza el stream del zip ya no
 * hay forma de cambiar el status.
 */
async function downloadBundleController(req, res) {
  let documents;
  try {
    documents = await documentsService.getBundleDocuments(req.params.projectId);
  } catch (err) {
    if (err instanceof MissingDocumentsError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ideator-documentos.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => res.destroy());
  archive.pipe(res);
  documents.forEach((document) => archive.append(document.content, { name: document.filename }));

  return archive.finalize();
}

module.exports = {
  listDocumentsController,
  getDocumentController,
  generateSpecDocumentController,
  generateArchitectureDocumentController,
  downloadBundleController,
};
