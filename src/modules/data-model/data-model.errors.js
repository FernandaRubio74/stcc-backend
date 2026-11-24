class InsufficientDefinitionError extends Error {}
class DraftNotFoundError extends Error {}
class NoApprovedVersionError extends Error {}
class NoCurrentContentError extends Error {}

module.exports = { InsufficientDefinitionError, DraftNotFoundError, NoApprovedVersionError, NoCurrentContentError };
