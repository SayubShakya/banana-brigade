// Controller layer: serves the OpenAPI spec and a Swagger UI page that documents
// the REST API (interoperability theme).

const { spec } = require('../routes/openapi');

// The HTML page that loads Swagger UI and points it at our OpenAPI JSON.
const DOCS_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Banana Brigade API</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"><!-- Swagger UI by SmartBear (Apache 2.0), loaded from a CDN --></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#ui' });</script></body></html>`;

/**
 * Creates the docs controller.
 * spec: GET /api/v1/openapi.json; page: GET /api/v1/docs (interactive API docs).
 */
function createDocsController() {
  return {
    spec: (req, res) => res.json(spec),
    page: (req, res) => res.type('html').send(DOCS_PAGE),
  };
}

module.exports = { createDocsController };
