/**
 * Forma de una pantalla y de una conexion de navegacion (T-027.1). Igual
 * que entity.schema.js y endpoint.schema.js, valida la salida de la IA.
 *
 * `mainElements` es ESTRUCTURADO (no strings sueltos): cada elemento tiene
 * un tipo visual, una etiqueta, y opcionalmente a que dato o endpoint real
 * se conecta (`dataField` = "Entidad.atributo" del modelo aprobado,
 * `endpointRef` = "METODO /ruta" de la API aprobada). Esto es lo que
 * permite: 1) que el frontend dibuje un wireframe real sin adivinar nada,
 * y 2) validar por codigo (screens/coherence.js) que cada pantalla usa
 * datos/endpoints que de verdad existen, en vez de confiar en que la IA
 * no invente nada.
 */
const { z } = require('zod');
const { screenLayoutSchema } = require('./mockup/layout.schema');

const screenElementSchema = z.object({
  type: z.enum(['list', 'form', 'field', 'button', 'text', 'image', 'nav']),
  label: z.string().min(1),
  // "Entidad.atributo" exacto del modelo de datos aprobado, o null si el
  // elemento no muestra/edita un dato puntual (ej. un titulo o un boton de
  // navegacion sin dato propio).
  dataField: z.string().nullable().optional().default(null),
  // "METODO /ruta" exacto de la especificacion de API aprobada, o null si
  // el elemento no dispara ninguna llamada (ej. un texto informativo).
  endpointRef: z.string().nullable().optional().default(null),
});

const screenSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  mainElements: z.array(screenElementSchema).min(1),
  // Roles que pueden ver esta pantalla (vocabulario de ProjectRole: owner/editor/viewer).
  visibleToRoles: z.array(z.enum(['owner', 'editor', 'viewer'])).min(1),
  /**
   * Especificacion de maquetado de alta fidelidad (ver mockup/layout.schema.js).
   * Es OPCIONAL y aditiva: una pantalla sin `layout` sigue siendo valida y el
   * renderizador le deriva una especificacion minima desde `mainElements`,
   * asi las versiones ya guardadas no se rompen.
   */
  layout: screenLayoutSchema.nullable().optional().default(null),
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

module.exports = {
  screenElementSchema,
  screenSchema,
  screensSchema,
  navigationEdgeSchema,
  navigationSchema,
  aiScreenMapResponseSchema,
};
