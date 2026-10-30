// An error a service throws to refuse a request (bad input, not allowed, not found,
// conflict, too many tries). It carries the HTTP status and the JSON body, so the
// services do not need to know about Express; middleware/errorHandler.js sends it.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.extra = extra;
  }

  get body() {
    return { error: this.message, ...this.extra };
  }
}

const badRequest = (message, extra) => new AppError(400, message, extra);
const unauthorized = (message, extra) => new AppError(401, message, extra);
const forbidden = (message, extra) => new AppError(403, message, extra);
const notFound = (message, extra) => new AppError(404, message, extra);
const conflict = (message, extra) => new AppError(409, message, extra);
const tooMany = (message, extra) => new AppError(429, message, extra);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany };
