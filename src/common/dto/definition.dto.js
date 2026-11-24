const { z } = require('zod');

const postDefinitionMessageSchema = z.object({
  content: z.string().min(1, 'El mensaje no puede estar vacio').max(4000, 'El mensaje es demasiado largo'),
});

module.exports = { postDefinitionMessageSchema };
