// The last middleware: turns errors into JSON. A service's AppError keeps its status
// and message; broken JSON is a 400; anything else is logged and becomes a 500.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { AppError } = require('../lib/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return res.status(err.status).json(err.body);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { errorHandler };
