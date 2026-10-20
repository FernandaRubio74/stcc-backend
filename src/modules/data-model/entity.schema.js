/**
 * Forma de una entidad del modelo de datos (T-019.1/T-020.1). La misma
 * definicion se usa para validar tanto la salida de la IA (generate) como
 * el body de una edicion manual (PATCH entities), para que ambos caminos
 * nunca puedan dejar `entities` en un estado inconsistente.
 */
const { z } = require('zod');

const foreignKeySchema = z
  .object({
    entity: z.string().min(1),
    attribute: z.string().min(1),
  })
  .nullable()
  .default(null);

const attributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  primaryKey: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  nullable: z.boolean().optional().default(true),
  foreignKey: foreignKeySchema.optional(),
});

const indexSchema = z.object({
  name: z.string().min(1),
  attributes: z.array(z.string().min(1)).min(1),
  unique: z.boolean().optional().default(false),
});

const entitySchema = z.object({
  name: z.string().min(1),
  attributes: z.array(attributeSchema).min(1),
  indexes: z.array(indexSchema).optional().default([]),
});

const entitiesSchema = z.array(entitySchema).min(1);

const aiDataModelResponseSchema = z.object({ entities: entitiesSchema });

module.exports = { entitySchema, entitiesSchema, aiDataModelResponseSchema };
