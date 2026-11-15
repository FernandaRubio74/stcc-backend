/**
 * T-039.3 - Metricas minimas en memoria: cantidad de requests, tasa de error
 * y tiempo de respuesta.
 *
 * LIMITACION ASUMIDA: el acumulador vive en memoria del proceso, asi que se
 * reinicia con cada despliegue y no se agrega entre replicas. Alcanza para el
 * DoD ("metricas minimas accesibles para revision") y es lo coherente con el
 * escenario de arquitectura elegido; un Prometheus con scraping queda fuera
 * del alcance del proyecto.
 */
const EMPTY = () => ({ total: 0, errors: 0, totalDurationMs: 0, byStatus: {}, since: new Date() });

let state = EMPTY();

function record({ statusCode, durationMs }) {
  state.total += 1;
  state.totalDurationMs += durationMs;
  if (statusCode >= 500) state.errors += 1;
  const bucket = `${Math.floor(statusCode / 100)}xx`;
  state.byStatus[bucket] = (state.byStatus[bucket] ?? 0) + 1;
}

function snapshot() {
  const { total, errors, totalDurationMs, byStatus, since } = state;
  return {
    requests: total,
    errors,
    errorRate: total === 0 ? 0 : Number((errors / total).toFixed(4)),
    averageResponseTimeMs: total === 0 ? 0 : Math.round(totalDurationMs / total),
    byStatus,
    since: since.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

function reset() {
  state = EMPTY();
}

module.exports = { record, snapshot, reset };
