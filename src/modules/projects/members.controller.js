const membersService = require('./members.service');

async function listMembersController(req, res) {
  const members = await membersService.listMembers(req.params.projectId);
  return res.status(200).json(members);
}

async function inviteMemberController(req, res) {
  try {
    const member = await membersService.inviteMember({
      projectId: req.params.projectId,
      email: req.body.email,
      role: req.body.role,
      invitedById: req.user.id,
    });
    return res.status(201).json(member);
  } catch (err) {
    if (err instanceof membersService.UserNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof membersService.MemberAlreadyExistsError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

async function updateMemberRoleController(req, res) {
  try {
    const member = await membersService.updateMemberRole(
      req.params.projectId,
      req.params.memberId,
      req.body.role
    );
    return res.status(200).json(member);
  } catch (err) {
    if (err instanceof membersService.MemberNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof membersService.LastOwnerError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

async function removeMemberController(req, res) {
  try {
    await membersService.removeMember(req.params.projectId, req.params.memberId);
    return res.status(204).send();
  } catch (err) {
    if (err instanceof membersService.MemberNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof membersService.LastOwnerError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = {
  listMembersController,
  inviteMemberController,
  updateMemberRoleController,
  removeMemberController,
};
