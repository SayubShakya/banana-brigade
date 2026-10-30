// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { AppError } = require('../lib/errors');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return res.status(err.status).json(err.body);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { errorHandler };
