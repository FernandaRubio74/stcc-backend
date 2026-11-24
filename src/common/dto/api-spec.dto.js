const { z } = require('zod');
const { endpointsSchema } = require('../../modules/api-spec/endpoint.schema');

const updateEndpointsSchema = z.object({
  endpoints: endpointsSchema,
});

module.exports = { updateEndpointsSchema };
