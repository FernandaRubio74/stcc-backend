class DraftNotFoundError extends Error {}
class EndpointEntityMismatchError extends Error {}
class NoCurrentContentError extends Error {}

module.exports = { DraftNotFoundError, EndpointEntityMismatchError, NoCurrentContentError };
