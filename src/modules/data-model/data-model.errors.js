class InsufficientDefinitionError extends Error {}
class DraftNotFoundError extends Error {}
class NoApprovedVersionError extends Error {}

module.exports = { InsufficientDefinitionError, DraftNotFoundError, NoApprovedVersionError };
