// API versioning: /api/v1/... is the current API. The old paths without /v1 keep
// working (they are the same handlers), so an older browser tab does not break.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function apiVersion(req, res, next) {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) req.url = `/api${req.url.slice(7)}`;
  next();
}

module.exports = { apiVersion };
