class ProjectNotReadyError extends Error {
  constructor(blockers, message = 'El proyecto todavia no esta listo para generar la documentacion final') {
    super(message);
    this.name = 'ProjectNotReadyError';
    // Mismo criterio que InconsistentProjectError (US-031): el error viaja con
    // el detalle accionable para que el frontend pueda mostrar que falta.
    this.blockers = blockers;
  }
}

class DocumentNotFoundError extends Error {}

/** T-036.3 - Falta generar alguno de los dos documentos de la descarga conjunta. */
class MissingDocumentsError extends Error {}

module.exports = { ProjectNotReadyError, DocumentNotFoundError, MissingDocumentsError };
