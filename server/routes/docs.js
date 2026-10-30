// /api/openapi.json and /api/docs: the API description and its Swagger UI page.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');

function createDocsRouter({ docsController: docs }) {
  const router = express.Router();

  router.get('/openapi.json', docs.spec);
  router.get('/docs', docs.page);

  return router;
}

module.exports = { createDocsRouter };
