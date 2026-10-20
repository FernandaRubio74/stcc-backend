const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const {
  requireProjectMembership,
} = require('../../common/middlewares/project-member.middleware');
const { requireRole } = require('../../common/middlewares/require-role.middleware');
const { inviteMemberSchema, updateMemberRoleSchema } = require('../../common/dto/members.dto');
const {
  listMembersController,
  inviteMemberController,
  updateMemberRoleController,
  removeMemberController,
} = require('./members.controller');

const router = Router();

router.use(requireAuth);

// Cualquier miembro puede ver el listado; solo el owner invita, cambia
// roles o elimina miembros (requireRole corre despues del guard de
// membresia, que es quien deja req.projectMembership.role disponible).
router.get('/:projectId/members', requireProjectMembership, listMembersController);

router.post(
  '/:projectId/members',
  requireProjectMembership,
  requireRole('owner'),
  validate(inviteMemberSchema),
  inviteMemberController
);

router.patch(
  '/:projectId/members/:memberId',
  requireProjectMembership,
  requireRole('owner'),
  validate(updateMemberRoleSchema),
  updateMemberRoleController
);

router.delete(
  '/:projectId/members/:memberId',
  requireProjectMembership,
  requireRole('owner'),
  removeMemberController
);

module.exports = router;
