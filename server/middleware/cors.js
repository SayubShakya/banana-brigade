// Middleware layer: CORS headers for the small public, read-only API.

/**
 * Allows any website (origin "*") to read the public endpoints, but only with
 * GET. Cookies are not allowed cross-site, so this never exposes a logged-in
 * session. Browser "preflight" OPTIONS requests are answered with 204.
 */
function publicCors(req, res, next) {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = { publicCors };
