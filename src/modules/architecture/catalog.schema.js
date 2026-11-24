/**
 * T-028.1/T-029.4 - Forma de una entrada del catalogo de arquitecturas.
 * Valida el catalogo (dato fijo en codigo, no generado por IA) para que
 * agregar un escenario nuevo no pueda dejarlo incompleto. US-029 exige
 * comunicacion/observabilidad/autenticacion-SSO-autorizacion para todo el
 * catalogo (antes eran opcionales en US-028, con el 5to escenario se
 * vuelven requeridos y se backfillean los 4 iniciales).
 */
const { z } = require('zod');

const architectureScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  persistence: z.string().min(1),
  backend: z.string().min(1),
  frontend: z.string().min(1),
  communication: z.string().min(1),
  infrastructure: z.string().min(1),
  operation: z.string().min(1),
  observability: z.string().min(1),
  authSsoAuthorization: z.string().min(1),
});

const architectureCatalogSchema = z.array(architectureScenarioSchema).min(1);

module.exports = { architectureScenarioSchema, architectureCatalogSchema };
