// Middleware layer: 404 handlers that run when no route matched.

const fs = require('node:fs');

/** 404 for unknown /api URLs: always JSON, because API clients expect JSON. */
function apiNotFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Builds the 404 handler for page URLs.
 * Browsers asking for HTML get the game's index.html (with status 404);
 * everything else gets plain text "Not found".
 * @param {string} indexHtml path to the built client's index.html
 */
function createPageNotFound(indexHtml) {
  return function pageNotFound(req, res) {
    res.status(404);
    if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts('html') && fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    res.type('text').send('Not found');
  };
}

module.exports = { apiNotFound, createPageNotFound };
