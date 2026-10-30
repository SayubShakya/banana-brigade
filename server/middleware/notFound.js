// 404 answers. Unknown /api paths get JSON. Any other address gets the React page
// with status 404 when a browser asks (it shows the "page not found" screen), and
// plain text otherwise.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

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
