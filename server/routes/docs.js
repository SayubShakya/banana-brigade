// Routes layer: API documentation URLs (/api/openapi.json and /api/docs). Public.

const express = require('express');

/** Builds the docs router. */
function createDocsRouter({ docsController: docs }) {
  const router = express.Router();

  router.get('/openapi.json', docs.spec);
  router.get('/docs', docs.page);

  return router;
}

module.exports = { createDocsRouter };
