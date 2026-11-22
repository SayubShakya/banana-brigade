// Helper library: error classes used by the services layer.
// Services throw these; the error handler middleware turns them into HTTP replies.

/**
 * An error that carries an HTTP status code and optional extra JSON fields.
 * @param {number} status HTTP status, e.g. 400 or 404
 * @param {string} message text shown to the user
 * @param {object} extra extra fields added to the JSON body
 */
class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.extra = extra;
  }

  /** The JSON body sent to the client, e.g. { error: 'Not found' }. */
  get body() {
    return { error: this.message, ...this.extra };
  }
}

// Short helpers so services can write `throw notFound('...')`.
const badRequest = (message, extra) => new AppError(400, message, extra);
const unauthorized = (message, extra) => new AppError(401, message, extra);
const forbidden = (message, extra) => new AppError(403, message, extra);
const notFound = (message, extra) => new AppError(404, message, extra);
const conflict = (message, extra) => new AppError(409, message, extra);
const tooMany = (message, extra) => new AppError(429, message, extra);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany };
