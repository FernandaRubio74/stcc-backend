const { z } = require('zod');

const createProjectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(150, 'El nombre es demasiado largo'),
  description: z.string().optional(),
});

module.exports = { createProjectSchema };
