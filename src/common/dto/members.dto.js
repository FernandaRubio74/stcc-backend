const { z } = require('zod');

const PROJECT_ROLES = ['owner', 'editor', 'viewer'];

const inviteMemberSchema = z.object({
  email: z.string().email('Email invalido'),
  role: z.enum(PROJECT_ROLES).default('viewer'),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(PROJECT_ROLES),
});

module.exports = { inviteMemberSchema, updateMemberRoleSchema, PROJECT_ROLES };
