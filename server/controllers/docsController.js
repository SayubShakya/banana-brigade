// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { spec } = require('../routes/openapi');

const DOCS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Banana Brigade API</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#ui' });</script></body></html>`;

function createDocsController() {
  return {
    spec: (req, res) => res.json(spec),
    page: (req, res) => res.type('html').send(DOCS_PAGE),
  };
}

module.exports = { createDocsController };
