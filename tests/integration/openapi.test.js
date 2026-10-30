// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spec } = require('../../server/routes/openapi');
const { startServer, client } = require('./helpers');

function routesInCode() {
  const dir = path.join(__dirname, '..', '..', 'server');
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  const routes = new Set();
  for (const [, method, p] of app.matchAll(/app\.(get|post|patch|delete|put)\('\/api(\/[^']*)'/g)) {
    if (p !== '/openapi.json' && p !== '/docs') routes.add(`${method} ${p}`);
  }
  for (const [, prefix, factory] of app.matchAll(/app\.use\('\/api(\/[a-z]+)', (create\w+Router)/g)) {
    const file = fs.readdirSync(path.join(dir, 'routes')).find((f) => fs.readFileSync(path.join(dir, 'routes', f), 'utf8').includes(`function ${factory}`));
    const src = fs.readFileSync(path.join(dir, 'routes', file), 'utf8');
    for (const [, method, p] of src.matchAll(/router\.(get|post|patch|delete|put)\('([^']*)'/g)) {
      const full = (prefix + (p === '/' ? '' : p)).replace(/:(\w+)/g, '{$1}');
      routes.add(`${method} ${full}`);
    }
  }
  return routes;
}

test('the OpenAPI file lists every route in the code, and nothing that is not there', () => {
  const inSpec = new Set(Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));
  const inCode = routesInCode();
  assert.ok(inCode.size > 25, `found only ${inCode.size} routes`);
  assert.deepEqual([...inCode].filter((r) => !inSpec.has(r)), [], 'routes missing from server/routes/openapi.js');
  assert.deepEqual([...inSpec].filter((r) => !inCode.has(r)), [], 'routes in server/routes/openapi.js that do not exist');
  assert.equal(spec.openapi, '3.0.3');
});

test('/api/v1 and the old /api paths both work; the spec and docs page are served', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    assert.equal((await c.post('/api/v1/auth/register', { username: 'versioned', password: 'bananas123' })).status, 201);
    assert.equal((await c.get('/api/v1/auth/me')).body.user.username, 'versioned');
    assert.equal((await c.get('/api/auth/me')).body.user.username, 'versioned');
    assert.equal((await c.get('/api/v1/nope')).status, 404);
    const doc = await c.get('/api/v1/openapi.json');
    assert.equal(doc.body.info.title, 'Banana Brigade API');
    const page = await fetch(`${s.base}/api/docs`);
    assert.match(await page.text(), /swagger-ui-dist@5\.17\.14/);
  } finally { await s.close(); }
});

test('the public leaderboard needs no login, allows any origin and sets no cookie', async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const { user } = (await c.post('/api/auth/register', { username: 'champ', password: 'bananas123' })).body;
    await s.db.addScore({ userId: user.id, mode: 'quick', kills: 18, deaths: 2, durationS: 200 });

    const res = await fetch(`${s.base}/api/v1/public/leaderboard?mode=quick&limit=5`, { headers: { Origin: 'https://example.org' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.match(res.headers.get('cache-control'), /max-age=30/);
    const data = await res.json();
    assert.equal(data.mode, 'quick');
    assert.deepEqual(Object.keys(data.rows[0]).sort(), ['at', 'deaths', 'kills', 'puzzlesSolved', 'rank', 'username', 'wave']);
    assert.equal(data.rows[0].username, 'champ');

    const pre = await fetch(`${s.base}/api/v1/public/leaderboard`, { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-methods'), /GET/);
    assert.equal((await fetch(`${s.base}/api/v1/auth/me`, { headers: { Origin: 'https://example.org' } })).headers.get('access-control-allow-origin'), null);
  } finally { await s.close(); }
});

test('docs/openapi.yaml is up to date with server/routes/openapi.js (run npm run openapi if not)', () => {
  const { yaml, OUT } = require('../../scripts/openapi-yaml');
  assert.equal(fs.readFileSync(OUT, 'utf8'), yaml);
});
