const { z } = require('zod');

const selectArchitectureSchema = z.object({
  architectureId: z.string().min(1),
});

module.exports = { selectArchitectureSchema };
