// The Banana Brigade web server: accounts, Banana API puzzles, scores and the game files.
//
//   POST /api/auth/register | login | logout,  GET /api/auth/me
//   GET  /api/puzzle?purpose=deploy|respawn|crate   -> { puzzleId, image, purpose, source }   (login)
//   POST /api/puzzle/answer  { puzzleId, answer }   -> { correct, solution, purpose }           (login)
//   GET  /api/status                                -> Banana API state
//   POST /api/scores, GET /api/scores/leaderboard?mode=, GET /api/scores/me
//   GET  /api/admin/users, DELETE /api/admin/users/:id/scores                                  (admin)
//
// The browser never calls the Banana API itself: the server fetches the puzzle,
// keeps the solution and only sends the picture, so the answer cannot be read in
// the browser's developer tools.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { createPuzzleStore } = require('./puzzles');
const { createPuzzlePool } = require('./pool');
const { createAuthRouter } = require('./routes/auth');
const { createScoresRouter } = require('./routes/scores');
const { createAdminRouter } = require('./routes/admin');
const { requireLogin } = require('./middleware/auth');

const PURPOSES = ['deploy', 'respawn', 'crate'];
const SESSION_COOKIE = 'brigade.sid';

function createApp({
  db,
  bananaApi,
  sessionSecret,
  production = false,
  puzzleStore = createPuzzleStore(),
  pool = createPuzzlePool({ fetchPuzzle: bananaApi.fetchPuzzle }),
}) {
  const app = express();
  app.set('sessionCookieName', SESSION_COOKIE);
  if (production) app.set('trust proxy', 1);
  app.use(express.json({ limit: '4kb' }));

  app.use(session({
    name: SESSION_COOKIE,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,     // no cookie until someone logs in
    cookie: {
      httpOnly: true,             // page JavaScript cannot read it (protects against XSS stealing it)
      sameSite: 'lax',            // not sent with cross-site POSTs (CSRF protection)
      secure: production,         // HTTPS only in production
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    },
  }));

  app.use('/api/auth', createAuthRouter({ db }));
  app.use('/api/scores', createScoresRouter({ db }));
  app.use('/api/admin', createAdminRouter({ db }));

  app.get('/api/puzzle', requireLogin, async (req, res) => {
    const purpose = PURPOSES.includes(req.query.purpose) ? req.query.purpose : 'deploy';
    try {
      const { image, solution, source } = await pool.take();
      const puzzleId = puzzleStore.add(solution, purpose);
      res.set('Cache-Control', 'no-store');
      res.json({ puzzleId, image, purpose, source });
    } catch (err) {
      console.error('Banana API error:', err.message);
      res.status(502).json({ error: 'The Banana API is not responding. Try again in a moment.' });
    }
  });

  app.post('/api/puzzle/answer', requireLogin, (req, res) => {
    const { puzzleId, answer } = req.body ?? {};
    if (typeof puzzleId !== 'string' || !Number.isInteger(answer)) {
      return res.status(400).json({ error: 'Send { puzzleId, answer } with a whole-number answer' });
    }
    const result = puzzleStore.answer(puzzleId, answer);
    if (!result) return res.status(404).json({ error: 'That puzzle has expired or was already answered' });
    // The server keeps the player's puzzle record, so it cannot be faked from the browser.
    const p = req.session.puzzles ?? { solved: 0, attempted: 0 };
    p.attempted += 1;
    if (result.correct) p.solved += 1;
    req.session.puzzles = p;
    res.json(result);
  });

  app.get('/api/status', (req, res) => res.json(pool.status()));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp, SESSION_COOKIE };
