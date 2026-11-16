class InconsistentProjectError extends Error {
  constructor(issues, message = 'El proyecto tiene inconsistencias sin resolver entre etapas') {
    super(message);
    this.name = 'InconsistentProjectError';
    this.issues = issues;
  }
}

module.exports = { InconsistentProjectError };
