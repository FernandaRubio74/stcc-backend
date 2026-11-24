class InsufficientContextError extends Error {}
class DraftNotFoundError extends Error {}
class NoCurrentContentError extends Error {}

class CoverageGapError extends Error {
  constructor(message, gaps) {
    super(message);
    this.name = 'CoverageGapError';
    this.gaps = gaps;
  }
}

module.exports = { InsufficientContextError, DraftNotFoundError, CoverageGapError, NoCurrentContentError };
