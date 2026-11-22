// Middleware layer: the last middleware in the chain; turns any thrown error
// into a JSON response with the right HTTP status code.

const { AppError } = require('../lib/errors');

/**
 * Express error handler (it has 4 parameters, which is how Express knows).
 * AppError -> its own status and body; bad JSON -> 400; body over the size
 * limit -> 413; other client errors -> their message. Anything else is logged
 * and hidden behind a generic 500 so internal details never leak to users.
 */
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return res.status(err.status).json(err.body);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (err.expose && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
  // Unknown error: log it on the server only.
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { errorHandler };
