// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');

function apiNotFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function createPageNotFound(indexHtml) {
  return function pageNotFound(req, res) {
    res.status(404);
    if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts('html') && fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    res.type('text').send('Not found');
  };
}

module.exports = { apiNotFound, createPageNotFound };
