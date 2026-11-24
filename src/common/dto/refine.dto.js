const { z } = require('zod');

/** Body comun de "ajustar con IA" en cualquier etapa (ver ai/refinePrompt.js). */
const refineInstructionSchema = z.object({
  instruction: z.string().trim().min(3).max(2000),
});

module.exports = { refineInstructionSchema };
