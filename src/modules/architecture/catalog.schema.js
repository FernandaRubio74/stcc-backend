/**
 * T-028.1/T-029.4 - Forma de una entrada del catalogo de arquitecturas.
 * Valida el catalogo (dato fijo en codigo, no generado por IA) para que
 * agregar un escenario nuevo (ver US-029) no pueda dejarlo incompleto.
 */
const { z } = require('zod');

const architectureScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  persistence: z.string().min(1),
  backend: z.string().min(1),
  frontend: z.string().min(1),
  infrastructure: z.string().min(1),
  operation: z.string().min(1),
  // Opcionales en US-028; US-029 los exige para todo el catalogo (incluye
  // el 5to escenario) y backfillea estos 4.
  communication: z.string().optional().default(''),
  observability: z.string().optional().default(''),
  authSsoAuthorization: z.string().optional().default(''),
});

const architectureCatalogSchema = z.array(architectureScenarioSchema).min(1);

module.exports = { architectureScenarioSchema, architectureCatalogSchema };
