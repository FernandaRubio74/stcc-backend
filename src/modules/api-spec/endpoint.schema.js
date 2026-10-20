/**
 * Forma de un endpoint de la especificacion de API (T-023.1/T-024.1). La
 * misma definicion valida tanto la salida de la IA (generate) como el body
 * de una edicion manual (PATCH endpoints), igual que entity.schema.js para
 * el modelo de datos.
 */
const { z } = require('zod');

const parameterSchema = z.object({
  name: z.string().min(1),
  in: z.enum(['path', 'query', 'body']),
  type: z.string().min(1),
  required: z.boolean().optional().default(true),
  description: z.string().optional().default(''),
});

const responseSchema = z.object({
  status: z.number().int().min(200).max(500),
  description: z.string().min(1),
});

const endpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  description: z.string().min(1),
  // Nombre exacto de una entidad del modelo de datos aprobado sobre la que
  // opera este endpoint — es lo que permite validar coherencia (ver coherence.js).
  resourceEntity: z.string().min(1),
  parameters: z.array(parameterSchema).optional().default([]),
  responses: z.array(responseSchema).min(1),
});

const endpointsSchema = z.array(endpointSchema).min(1);

const aiApiSpecResponseSchema = z.object({ endpoints: endpointsSchema });

module.exports = { endpointSchema, endpointsSchema, aiApiSpecResponseSchema };
