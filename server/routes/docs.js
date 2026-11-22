const express = require('express');

function createDocsRouter({ docsController: docs }) {
  const router = express.Router();

  router.get('/openapi.json', docs.spec);
  router.get('/docs', docs.page);

  return router;
}

module.exports = { createDocsRouter };
