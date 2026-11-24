const { z } = require('zod');
const { testPlanContentSchema } = require('../../modules/testing/schema');

const updateTestPlanContentSchema = z.object({
  content: testPlanContentSchema,
});

module.exports = { updateTestPlanContentSchema };
