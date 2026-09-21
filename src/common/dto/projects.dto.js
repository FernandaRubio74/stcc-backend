const { z } = require('zod');

const createProjectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(150, 'El nombre es demasiado largo'),
  description: z.string().optional(),
});

const updateProjectSchema = z
  .object({
    name: z
      .string()
      .min(1, 'El nombre es requerido')
      .max(150, 'El nombre es demasiado largo')
      .optional(),
    description: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe incluir al menos un campo para actualizar',
  });

module.exports = { createProjectSchema, updateProjectSchema };
