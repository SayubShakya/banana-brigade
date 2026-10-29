// Writes docs/openapi.yaml from the OpenAPI description in server/routes/openapi.js,
// so the API can be read (or imported into tools like Postman) without running the
// server. There is one source: edit server/routes/openapi.js, then run
//   npm run openapi
// tests/integration/openapi.test.js fails if docs/openapi.yaml is out of date.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const path = require('node:path');
const { spec } = require('../server/routes/openapi');

const OUT = path.join(__dirname, '..', 'docs', 'openapi.yaml');

// A small YAML writer for plain data (objects, arrays, strings, numbers, booleans).
// Strings are written in JSON quotes, which YAML accepts, so nothing needs escaping rules.
const plain = /^[A-Za-z_][A-Za-z0-9_.\/-]*$/;
const key = (k) => (plain.test(k) ? k : JSON.stringify(k));
const scalar = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' && Object.keys(v).length === 0);

function toYaml(value, indent = '') {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && !isEmpty(item)) {
        const inner = toYaml(item, `${indent}  `).replace(/^\s+/, '');
        return `${indent}- ${inner}`;
      }
      return `${indent}- ${isEmpty(item) ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`;
    }).join('\n');
  }
  return Object.entries(value).map(([k, v]) => {
    if (v && typeof v === 'object' && !isEmpty(v)) return `${indent}${key(k)}:\n${toYaml(v, `${indent}  `)}`;
    return `${indent}${key(k)}: ${isEmpty(v) ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
  }).join('\n');
}

const header = '# Banana Brigade API (OpenAPI 3). Generated from server/routes/openapi.js by `npm run openapi`; do not edit by hand.\n';
const yaml = `${header}${toYaml(JSON.parse(JSON.stringify(spec)))}\n`;

if (require.main === module) {
  fs.writeFileSync(OUT, yaml);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
}
module.exports = { yaml, OUT };
