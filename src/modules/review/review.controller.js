const reviewService = require('./review.service');

async function getReviewSummaryController(req, res) {
  const summary = await reviewService.getReviewSummary(req.params.projectId);
  return res.status(200).json(summary);
}

module.exports = { getReviewSummaryController };
