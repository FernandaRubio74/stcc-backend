const { z } = require('zod');
const { entitiesSchema } = require('../../modules/data-model/entity.schema');

const updateEntitiesSchema = z.object({
  entities: entitiesSchema,
});

module.exports = { updateEntitiesSchema };
