// Middleware layer: lets clients call versioned URLs (/api/v1/...).
// It rewrites them to the plain /api/... routes before the routers see them.

/**
 * Rewrites /api/v1/... to /api/... so both URL styles hit the same routes.
 * Runs before routing, then calls next() to continue the request.
 */
function apiVersion(req, res, next) {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) req.url = `/api${req.url.slice(7)}`;
  next();
}

module.exports = { apiVersion };
