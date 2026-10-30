// The API description: the OpenAPI 3 file (routes/openapi.js) as JSON at
// /api/v1/openapi.json, and a page that shows it with Swagger UI at /api/docs.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { spec } = require('../routes/openapi');

// Swagger UI (pinned version from a CDN) reading our OpenAPI file.
const DOCS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Banana Brigade API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
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
