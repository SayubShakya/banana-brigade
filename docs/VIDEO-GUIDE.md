# Video guide: facts and pointers

**This is not a script.** The brief does not allow AI for the video. The narration must be in Sayub's own
voice and in his own words. This page only lists facts, file:line pointers and things to put on screen, so
each theme can be shown (SHOW), found in the code (LOCATE), explained (EXPLAIN) and judged (EVALUATE).
Line numbers match `main` after the `fix/review-findings` merge (90b97cd). Check them again if the code changes
before recording.

Suggested timing from the Student Guide: demo 0:00–1:00, architecture and interoperability 1:00–2:00, version
control 2:00–3:45, events 3:45–5:30, identity 5:30–7:15, evaluation 7:15–9:15, conclusion 9:15–10:00.

## Before recording
- `./run.sh`, or `npm run demo` without MongoDB (`scripts/demo.js`: in-memory MongoDB, nothing is kept).
- Two browser windows with two accounts for online play. Create an admin with
  `npm run create-admin -- <user> <password>`.
- Preview links skip the deploy puzzle: `#campaign`, `#difficulty`, `#battle-quick`, `#puzzle-crate`, `#online`,
  `#daily`, `#profile`, `#settings`, `#admin`.
- Open in an editor: `server/services/bananaApi.js`, `server/services/pool.js`, `server/app.js`, `server/routes/auth.js`,
  `server/services/sessions.js`, `client/src/lib/eventBus.js`, `client/src/game/world.js`, `server/realtime/match.js`.
- A terminal with `mongosh banana_brigade` ready, and one with the git log.

## Demo (facts to show)
- Log in (tick "remember me") → menu with rank card → Campaign map (stars, locks) → Difficulty cards → deploy
  puzzle (timer ring turns orange, then red) → battle (battle music fades in).
- In battle: get killed, press B for a respawn puzzle; press E at a banana crate for a power weapon.
- Results screen with puzzles solved and stars. An achievement toast.
- Online: create a room with a bot difficulty, join by code in the second window, ready, start.
- Settings tabs: Game (API health in plain words, fullscreen), Sound (volume sliders), Accessibility (high
  contrast, large text, reduced motion), Account (change password, log out everywhere, delete account, admin).

## Interoperability
**Facts**
- Third-party service: Banana API by Marc Conrad, `https://marcconrad.com/uob/banana/api.php`, HTTPS GET, JSON.
- Request: `?out=json&base64=yes` → `{ "question": "<base64 PNG>", "solution": 7 }` (`bananaApi.js:114`), with
  `Accept: application/json` and `Cache-Control: no-store` (`bananaApi.js:122`).
- Timeout 5 s per attempt with an `AbortController`, covering the body too (`bananaApi.js:113-130`).
- **Up to 2 retries** (`retries = 2`, `bananaApi.js:96`) with exponential backoff and jitter: 300 ms, then
  900 ms, plus up to 30% (`bananaApi.js:144-151`). Only network errors, timeouts, HTTP 5xx and 429 are retried
  (`bananaApi.js:82-87`, `:123-129`); bad data stops at once (`bananaApi.js:159`).
- `BananaApiError` with `retryable` and a public `kind` (`bananaApi.js:19-29`).
- Validation and normalising of the reply: JSON, base64 pattern, digit 0–9, a digit sent as a string
  (`bananaApi.js:43-58`). CSV is also supported.
- Call statistics for `/api/status` (`bananaApi.js:167-177`).
- Pool (`pool.js`): 3 ready, reserve of 25, 2.5 s deadline on `take()` (`pool.js:136-170`), at most 3 calls in
  flight, circuit breaker after 3 failures in a row, 30 s pause, one probe (`pool.js:65-73`), status numbers
  (`pool.js:173-186`). Choices and alternatives: `docs/resilience.md`.
- Worst case for one failing call: three 5 s timeouts plus backoff, about 16 s. The deadline means the player
  waits at most 2.5 s when there is a reserve.
- Our own API for the browser: `GET /api/puzzle` (`app.js:106-117`) returns `{ puzzleId, image, purpose, source }`
  without the solution; `POST /api/puzzle/answer` (`app.js:119-137`); solutions kept in `puzzles.js:19-24`.
- Second protocol: Socket.io for online matches (`realtime/rooms.js:9-18` lists every message).
- Shared code across machines: the server runs `client/src/game/world.js` (`realtime/match.js:12`).

**On-screen ideas**
- DevTools → Network → `puzzle?purpose=deploy` → Response: show there is no `solution` field. Then the
  `answer` response, which reveals the solution only after answering.
- `curl -s 'https://marcconrad.com/uob/banana/api.php?out=json&base64=no'` in a terminal to show the raw API.
- Restart with `BANANA_API_URL=https://marcconrad.com/uob/banana/does-not-exist.php ./run.sh`: puzzles still come
  from the reserve once some were fetched; `/api/status` and Settings → Game show the failures and, after 3 in a
  row, the circuit as open with a countdown.
- `GET /api/status` in the browser: latency (last, p50, average), success rate, retries used, circuit state.
- DevTools → Network → WS → the socket frames: `input` going up, `match:snapshot` coming down.

**Evaluate (points to cover in own words):** proxy vs browser fetch; JSON+base64 vs CSV vs image URL;
timeout, backoff and jitter vs no retry or fixed retries; circuit breaker and reserve vs an error page;
Socket.io vs polling vs raw WebSocket. See `docs/evaluation.md` section 3 and `docs/resilience.md`.

## Version control
**Facts**
- Repository: `https://github.com/SayubShakya/banana-brigade`, branch `main`.
- Feature and fix branches, each merged with `--no-ff`: project-skeleton, banana-brigade, login, gameplay,
  profile-screens, mongodb, react-screens, multiplayer, lag-and-clear-ui, achievements-daily,
  fair-bots-and-ui-polish, difficulty-levels, campaign, docs/incomplete-tasks, daily-and-demo, identity-plus,
  polish, api-hardening, docs/readme-ci, review-findings, docs/final-pass.
- Small commits, for example the login feature: `fadda7c` storage, `cd6b152` register/login, `4e196d7` scores,
  `edbc076` tests, `5b8dcfc` login screen.
- Annotated release tags: `v0.1-login` (3b4994b), `v0.2-gameplay` (f4e4b23), `v0.3-mongo-react` (7cfa490),
  `v0.4-multiplayer` (b8b4252), `v0.5-campaign` (b97fb75), and `v1.0.0`.
- A real design change kept in history: SQLite `fadda7c` → MongoDB `75afbbd`. `git show 75afbbd --stat` shows
  only `db.js`, `models.js` (now `server/models/db.js` and `server/models/index.js`) and the package files changed.
- A bug found in review and fixed on its own branch: `fix/review-findings` (`5926ca4`, the pool's queue).
- Modules: server routes, services, realtime, sessions; client game, net, screens (README project layout).
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm test` (51 tests) and the Vite build on push and pull
  request, with the MongoDB binary cached.
- `CHANGELOG.md` groups the history by milestone and tag; `CONTRIBUTING.md` has branch names, commit style, the
  merge command, the review checklist and annotated tags; `.github/pull_request_template.md`.

**On-screen ideas**
- `git log --oneline --graph` (the feature bubbles).
- `git log --oneline --graph --first-parent main` (one line per merged feature).
- `git tag -n` and `git show v0.4-multiplayer`.
- `git show 75afbbd --stat` for the database swap.
- GitHub → Actions tab with a green run; GitHub → branches and tags.

**Evaluate:** feature branches + `--no-ff` vs trunk-based vs a PR workflow; reviews done locally (no GitHub PR
discussion) as a limit; tags for milestones. See `docs/evaluation.md` section 1.

## Event-driven programming
**Facts**
- The bus: `on`, `off`, `emit`, with try/catch per listener (`client/src/lib/eventBus.js:9-13`).
- Generated: DOM key press → `input:banana` (`input.js:72`); the world emits `soldier:killed`
  (`world.js:215`) and `match:ended` (`world.js:286`).
- Handled: kill feed (`hud.js:52`), sound (`sound.js:380`), respawn puzzle (`GameSession.js:106`), results
  (`GameSession.js:149` → `game:over` at `:135` → `App.jsx:141`).
- One event, two independent listeners: `game:state` switches the screen (`App.jsx:136-140`) and crossfades the
  music (`music.js:131-136`).
- `banana:answered` (`PuzzleModal.jsx:109`) is heard by battle stats (`GameSession.js:73`), the lifetime record
  (`storage.js:16`) and the chime or buzzer (`sound.js:299`).
- React bridge: `useBus` (`useBus.js:11-15`).
- Same engine on the server with a different `emit` (`world.js:72`, `match.js:57-83`): engine events become
  snapshot events.
- Server `EventEmitter` and achievement rules (`server/services/achievements.js:41-104`; emit at `:81-92`); fired from
  `app.js:132`, `routes/scores.js:41`, `routes/campaign.js:53`, `routes/daily.js:92`, `:101`, `rooms.js:104`,
  `:245`.
- Socket.io handlers (`rooms.js:143-180`); 30 Hz `setInterval` tick (`match.js:150-152`).
- Timeouts and retries (Week 4): Banana API timeout (`bananaApi.js:113-130`), backoff (`bananaApi.js:144-151`),
  `take()` deadline (`pool.js:147-148`), socket request timeout 8 s (`net/socket.js:31`).
- Full catalogue: `docs/events.md`.

**On-screen ideas**
- Put a breakpoint or `console.log` in `hud.js:52` and get a kill: the handler runs without `world.js`
  knowing about the HUD.
- Start a battle and listen: the music changes because `music.js` listens to `game:state`, not because the
  battle code calls it.
- Unlock an achievement and point at the toast (`components/Toasts.jsx:19`) and the `unlocked` field in the Network reply.

**Evaluate:** observer bus vs direct calls; React for screens vs canvas loop; synchronous bus limits; listeners
not yet used. See `docs/evaluation.md` section 2.

## Virtual identity
**Facts**
- Register: validation (`routes/auth.js:113-115`), `bcrypt.hash` cost 10 (`routes/auth.js:123`), unique index race
  (`routes/auth.js:124-131`). The sign-up form checks names live (`/available`, `routes/auth.js:384-395`, 20 checks a minute).
- Login: per-IP limits counted before the password check (`routes/auth.js:149-153`, `services/rateLimiter.js:31-50`),
  dummy-hash compare (`routes/auth.js:158-159`), wrong password (`routes/auth.js:161`), session regenerated
  (`routes/auth.js:69-86`), "remember me" sets 30 days (`routes/auth.js:24`, `:82`).
- Logout destroys the session and clears the cookie (`routes/auth.js:178-181`).
- Log out everywhere (`routes/auth.js:185-195`), change password, needing the current one (`routes/auth.js:199-220`), delete
  account and all data (`routes/auth.js:226-243`), active sessions (`routes/auth.js:398-408`).
- Ending sessions: one MongoDB query on the session store, then the player's sockets are closed
  (`server/services/sessions.js:13-75`). Sockets join `user:<id>` and `sid:<id>` rooms for this (`realtime/socket.js:30-33`).
- Cookie: `brigade.sid`, HttpOnly, SameSite=Lax, Secure in production, 2 hours (`app.js:68-80`).
- Sessions stored in MongoDB (`index.js:37-39`); login counters expire by TTL index (`models/index.js:64-70`).
- Authorisation: `loadUser` reads the user and role from the database on every request, so a deleted or demoted
  account loses access at once (`middleware/auth.js:13-17`); `requireLogin`, `requireAdmin` (`:29-46`).
- Admin routes (`routes/admin.js:25`); promote or demote, but not yourself (`routes/admin.js:65-85`); Admin screen
  (`client/src/screens/Admin/Admin.jsx`), offered only to admins in Settings (`Settings.jsx:138`).
- WebSocket uses the same session (`realtime/socket.js:20-35`).
- Identity from the session, not the body: puzzle counts (`routes/scores.js:34-38`), online scores written by
  the server (`rooms.js:96-107`).
- Tests: `tests/integration/auth.test.js:10` (cookie flags), `:27` (bcrypt in the database), `:65` (session fixation),
  `:77` (lockout), `:135` (admin 403); `tests/integration/identity.test.js:33` (remember me), `:44` (log out everywhere,
  sockets too), `:69` (password change), `:87` (delete account), `:139` (demoted admin loses access at once);
  `tests/integration/realtime.test.js:27` (socket without login refused).

**On-screen ideas**
- DevTools → Application → Cookies: `brigade.sid` with HttpOnly ticked, and the expiry 30 days out with
  "remember me"; `document.cookie` in the console does not show it.
- `mongosh banana_brigade` → `db.users.findOne({}, {username:1, passwordHash:1})` shows a `$2b$10$…` hash;
  `db.sessions.find({'session.userId': '<id>'})` shows one document per device.
- Log in in two windows, press "Log out everywhere" in one: the other is logged out on its next click, and the
  session documents are gone in `mongosh`.
- Six wrong passwords → the lockout message; `db.loginattempts.find()`.
- Log in as a player and open `/api/admin/users` → 403; as an admin → the Admin screen. Demote an admin in one
  window and refresh the other: access is gone at once.

**Evaluate:** sessions vs JWT (localStorage or cookie) vs OAuth; bcrypt vs fast hashes; reading the role from
the database vs trusting the session; limits such as the per-username lockout (and its check-then-record race),
browser-reported offline kills and "remember me" on shared computers. See `docs/evaluation.md` section 4.

## Comparison facts (from the research notes)
- Several other students' games call the API from the browser or send the solution to it (Bunona, Anoj Aryal,
  banana-runner). Brigade keeps the solution on the server.
- Banana Brain Quest stores a JWT in `localStorage` and trusts the browser's multiplayer score. Brigade uses an
  HttpOnly session cookie and runs online matches on the server.
- None of the projects researched had a login lockout, a circuit breaker or CI.

## Evidence to submit
- The video (own voice), the code zip (`npm run package`, which writes `../banana-brigade-source.zip` from
  `HEAD`), and the signed Week 8 Progress Form.

## Before recording: last checks
- [ ] `v1.0.0` tag created on the final `main` (the other tags exist).
- [ ] `npm test` still shows 51 passing tests.
- [ ] Spot-check five pointers above against the code you show on screen.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
