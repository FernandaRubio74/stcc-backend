const consistencyService = require('./consistency.service');
const { InconsistentProjectError } = require('./consistency.errors');

async function getConsistencyCheckController(req, res) {
  const result = await consistencyService.checkConsistency(req.params.projectId);
  return res.status(200).json(result);
}

/**
 * T-031.3 - Punto de entrada que representaria el disparador de la
 * generacion final de documentacion (la generacion en si es una etapa
 * futura, no implementada todavia): su unico rol hoy es exponer el
 * bloqueo 409 cuando hay inconsistencias, para que US-033/US-034 lo
 * puedan ejercitar de punta a punta.
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
