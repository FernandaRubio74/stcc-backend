const { z } = require('zod');
const { screensSchema, navigationSchema } = require('../../modules/screens/screen.schema');

const updateScreensSchema = z.object({
  screens: screensSchema,
  navigation: navigationSchema,
});

module.exports = { updateScreensSchema };
