const { Router } = require('express');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const healthService = require('./health.service');
const metrics = require('./metrics');

const router = Router();

/**
 * T-039.1 - Publico a proposito: lo consultan el healthcheck del contenedor y
 * el job de e2e en CI, que no tienen credenciales. Responde 503 si la base no
 * contesta, para que un orquestador pueda sacar la instancia de rotacion.
 */
router.get('/health', async (req, res) => {
  const health = await healthService.getHealth();
  return res.status(health.db === 'up' ? 200 : 503).json(health);
});

/**
 * T-039.3 - Las metricas si van detras de autenticacion: exponen volumen de
 * trafico y tasa de error, que no tienen por que ser publicos.
 */
router.get('/metrics', requireAuth, (req, res) => res.status(200).json(metrics.snapshot()));

module.exports = router;
