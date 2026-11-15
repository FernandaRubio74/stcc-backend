const consistencyService = require('./consistency.service');
const { InconsistentProjectError } = require('./consistency.errors');

async function getConsistencyCheckController(req, res) {
  const result = await consistencyService.checkConsistency(req.params.projectId);
  return res.status(200).json(result);
}

/**
 * T-031.3 - Chequeo previo a la generacion final: su unico rol es exponer el
 * bloqueo 409 cuando hay inconsistencias entre etapas.
 *
 * La generacion de los documentos en si vive en el modulo documents
 * (US-035/US-036), que valida la precondicion completa (etapas + bloqueos +
 * consistencia) via la revision consolidada de US-032. Este endpoint se
 * mantiene como gate de consistencia aislado, que es lo que ejercitan
 * US-033 y la suite E2E de US-034.
 */
async function postFinalGenerationController(req, res) {
  try {
    await consistencyService.assertConsistentOrThrow(req.params.projectId);
    return res.status(200).json({ status: 'ready', message: 'No hay inconsistencias: se puede proceder a la generacion final.' });
  } catch (err) {
    if (err instanceof InconsistentProjectError) {
      return res.status(409).json({ error: err.message, issues: err.issues });
    }
    throw err;
  }
}

module.exports = { getConsistencyCheckController, postFinalGenerationController };
