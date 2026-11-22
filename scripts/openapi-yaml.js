// Writes docs/openapi.yaml from the OpenAPI spec in server/routes/openapi.js (run with `npm run openapi`).
// It uses a small hand-written YAML converter, so no extra YAML package is needed.
const fs = require('node:fs');
const path = require('node:path');
const { spec } = require('../server/routes/openapi');

const OUT = path.join(__dirname, '..', 'docs', 'openapi.yaml');

// Small helpers: keys that are plain words are written as-is, anything else is quoted;
// strings are quoted with JSON rules (valid YAML too); empty arrays/objects become [] or {}.
const plain = /^[A-Za-z_][A-Za-z0-9_.\/-]*$/;
const key = (k) => (plain.test(k) ? k : JSON.stringify(k));
const scalar = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' && Object.keys(v).length === 0);

// Turns a JavaScript value into YAML text, calling itself for nested objects/arrays
// and adding two spaces of indentation for each level.
function toYaml(value, indent = '') {
  // Arrays become "- item" lines.
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && !isEmpty(item)) {
        const inner = toYaml(item, `${indent}  `).replace(/^\s+/, '');
        return `${indent}- ${inner}`;
      }
      return `${indent}- ${isEmpty(item) ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`;
    }).join('\n');
  }
  // Objects become "key: value" lines; nested objects go on the next lines, indented.
  return Object.entries(value).map(([k, v]) => {
    if (v && typeof v === 'object' && !isEmpty(v)) return `${indent}${key(k)}:\n${toYaml(v, `${indent}  `)}`;
    return `${indent}${key(k)}: ${isEmpty(v) ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
  }).join('\n');
}

// JSON round-trip removes undefined values and functions before converting.
const header = '# Banana Brigade API (OpenAPI 3). Generated from server/routes/openapi.js by `npm run openapi`; do not edit by hand.\n';
const yaml = `${header}${toYaml(JSON.parse(JSON.stringify(spec)))}\n`;

// Only write the file when run as a script; tests can require this file and compare `yaml` with the saved file.
if (require.main === module) {
  fs.writeFileSync(OUT, yaml);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
}
module.exports = { yaml, OUT };
