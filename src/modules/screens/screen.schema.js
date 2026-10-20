/**
 * Forma de una pantalla y de una conexion de navegacion (T-027.1). Igual
 * que entity.schema.js y endpoint.schema.js, valida la salida de la IA.
 */
const { z } = require('zod');

const screenSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  mainElements: z.array(z.string().min(1)).min(1),
  // Roles que pueden ver esta pantalla (vocabulario de ProjectRole: owner/editor/viewer).
  visibleToRoles: z.array(z.enum(['owner', 'editor', 'viewer'])).min(1),
});

const navigationEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional().default(''),
});

const screensSchema = z.array(screenSchema).min(1);
const navigationSchema = z.array(navigationEdgeSchema);

const aiScreenMapResponseSchema = z.object({
  screens: screensSchema,
  navigation: navigationSchema,
});

module.exports = { screenSchema, screensSchema, navigationEdgeSchema, navigationSchema, aiScreenMapResponseSchema };
