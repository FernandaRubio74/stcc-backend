class NoApprovedApiSpecError extends Error {}
class MvpCoverageError extends Error {}
class ScreenReferenceError extends Error {}
class RoleCoverageError extends Error {}
class InvalidNavigationError extends Error {}
class DraftNotFoundError extends Error {}
class NoCurrentContentError extends Error {}

module.exports = {
  NoApprovedApiSpecError,
  MvpCoverageError,
  ScreenReferenceError,
  RoleCoverageError,
  InvalidNavigationError,
  DraftNotFoundError,
  NoCurrentContentError,
};
