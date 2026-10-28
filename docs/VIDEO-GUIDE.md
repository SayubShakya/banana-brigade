# Video guide: facts and pointers

**This is not a script.** The brief does not allow AI for the video. The narration must be in Sayub's own
voice and in his own words. This page only lists facts, file:line pointers and things to put on screen, so
each theme can be shown (SHOW), found in the code (LOCATE), explained (EXPLAIN) and judged (EVALUATE).
Line numbers are for the commit this file was added in; check them again before recording.

Suggested timing from the Student Guide: demo 0:00–1:00, architecture and interoperability 1:00–2:00, version
control 2:00–3:45, events 3:45–5:30, identity 5:30–7:15, evaluation 7:15–9:15, conclusion 9:15–10:00.

## Before recording
- `./run.sh` (or `npm run demo` without MongoDB). Two browser windows with two accounts for online play.
- Preview links skip the deploy puzzle: `#campaign`, `#difficulty`, `#battle-quick`, `#puzzle-crate`, `#online`,
  `#daily`, `#profile`.
- Open in an editor: `server/services/bananaApi.js`, `server/app.js`, `server/routes/auth.js`,
  `client/src/eventBus.js`, `client/src/game/world.js`, `server/realtime/match.js`.
- A terminal with `mongosh banana_brigade` ready, and one with the git log.

## Demo (facts to show)
- Log in → menu with rank card → Campaign map (stars, locks) → Difficulty cards → deploy puzzle → battle.
- In battle: get killed, press B for a respawn puzzle; press E at a banana crate for a power weapon.
- Results screen with puzzles solved and stars. An achievement toast.
- Online: create a room, join by code in the second window, ready, start.

## Interoperability
**Facts**
- Third-party service: Banana API by Marc Conrad, `https://marcconrad.com/uob/banana/api.php`, HTTPS GET, JSON.
- Request: `?out=json&base64=yes` → `{ "question": "<base64 PNG>", "solution": 7 }` (`bananaApi.js:69`).
- Timeout 5 s with `AbortSignal.timeout` (`bananaApi.js:74`); 1 retry (`bananaApi.js:72`); custom
  `BananaApiError` (`bananaApi.js:10-15`).
- Validation of the reply: JSON, base64 pattern, digit 0–9 (`bananaApi.js:23-57`). CSV is also supported.
- Pool: 3 ready, reserve of 25, status (`pool.js:11-69`); fallback to the reserve on failure (`pool.js:55-63`).
- Our own API for the browser: `GET /api/puzzle` (`app.js:78-89`) returns `{ puzzleId, image, purpose, source }`
  without the solution; `POST /api/puzzle/answer` (`app.js:91-109`); solutions kept in `puzzles.js:19-32`.
- Second protocol: Socket.io for online matches (`realtime/rooms.js:9-18` lists every message).
- Shared code across machines: the server runs `client/src/game/world.js` (`realtime/match.js:12`).

**On-screen ideas**
- DevTools → Network → `puzzle?purpose=deploy` → Response: show there is no `solution` field. Then the
  `answer` response, which reveals the solution only after answering.
- `curl -s 'https://marcconrad.com/uob/banana/api.php?out=json&base64=no'` in a terminal to show the raw API.
- Restart with `BANANA_API_URL=https://marcconrad.com/uob/banana/does-not-exist.php ./run.sh`: the game still
  serves reserve puzzles (after some were fetched), and `GET /api/status` shows `online: false` and `lastError`.
- DevTools → Network → WS → the socket frames: `input` going up, `match:snapshot` coming down.

**Evaluate (points to cover in own words):** proxy vs browser fetch; JSON+base64 vs CSV vs image URL;
timeout and retry vs none; reserve vs error page; Socket.io vs polling vs raw WebSocket. See
`docs/evaluation.md` section 3.

## Version control
**Facts**
- Repository: `https://github.com/SayubShakya/banana-brigade`, branch `main`.
- 14 feature/fix branches, each merged with `--no-ff`: project-skeleton, banana-brigade, login, gameplay,
  profile-screens, mongodb, react-screens, multiplayer, lag-and-clear-ui, achievements-daily,
  fair-bots-and-ui-polish, difficulty-levels, campaign, docs/incomplete-tasks (and this docs branch).
- Small commits, for example the login feature: `fadda7c` storage, `cd6b152` register/login, `4e196d7` scores,
  `edbc076` tests, `5b8dcfc` login screen.
- A real design change kept in history: SQLite `fadda7c` → MongoDB `75afbbd`. Compare with
  `git show 75afbbd --stat` (only `db.js`, `models.js` and the package files changed).
- Modules: server routes, services, realtime; client game, net, screens (see the README project layout).
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm test` and the Vite build on push and pull request.
- `CHANGELOG.md` groups the history by milestone; `CONTRIBUTING.md` has branch names, commit style, merge
  command, review checklist and annotated release tags; `.github/pull_request_template.md`.

**On-screen ideas**
- `git log --oneline --graph` (the feature bubbles).
- `git log --oneline --graph --first-parent main` (one line per merged feature).
- `git show 75afbbd --stat` for the database swap.
- GitHub → Actions tab with a green run; GitHub → branches; tags if created.

**Evaluate:** feature branches + `--no-ff` vs trunk-based vs PR workflow; local merges (no PR discussion) as a
limit; tags for milestones. See `docs/evaluation.md` section 1.

## Event-driven programming
**Facts**
- The bus: `on`, `off`, `emit`, with try/catch per listener (`client/src/eventBus.js:9-28`).
- Generated: DOM key press → `input:banana` (`input.js:67`); the world emits `soldier:killed`
  (`world.js:195`) and `match:ended` (`world.js:245`).
- Handled: kill feed (`hud.js:50`), sound (`sound.js:96`), respawn puzzle (`GameSession.js:94`), results
  (`GameSession.js:128` → `game:over` at `:134` → `App.jsx:80`).
- React bridge: `useBus` (`hooks.js:11-15`); `game:state` handler switches screens (`App.jsx:75-79`).
- Same engine on the server with a different `emit` (`world.js:68`, `match.js:52-67`): engine events become
  snapshot events.
- Server `EventEmitter` and achievement rules (`server/achievements.js:36-94`; emit at `:81-92`); fired from
  `app.js:104`, `routes/scores.js:40`, `routes/campaign.js:52`, `routes/daily.js:85`, `:95`.
- Socket.io handlers (`rooms.js:137-250`); 30 Hz `setInterval` tick (`match.js:129-131`).
- Timeouts and retries: Banana API timeout (`bananaApi.js:74`), socket request timeout 8 s (`net/socket.js:28`).
- Full catalogue: `docs/events.md`.

**On-screen ideas**
- Put a breakpoint or `console.log` in `hud.js:50` and get a kill: the handler runs without `world.js`
  knowing about the HUD.
- Unlock an achievement and point at the toast (`Toasts.jsx:12`) and the `unlocked` field in the Network reply.

**Evaluate:** observer bus vs direct calls; React for screens vs canvas loop; synchronous bus limits; listeners
not yet used. See `docs/evaluation.md` section 2.

## Virtual identity
**Facts**
- Register: validation (`routes/auth.js:44-49`), `bcrypt.hash` cost 10 (`auth.js:51`), unique index race
  (`auth.js:53-59`).
- Login: lockout check (`auth.js:73-78`), dummy-hash compare (`auth.js:79-82`), failed attempt recorded
  (`auth.js:84`), session regenerated (`auth.js:25-36`).
- Logout destroys the session and clears the cookie (`auth.js:97-104`).
- Cookie: `brigade.sid`, HttpOnly, SameSite=Lax, Secure in production, 2 hours (`app.js:47-59`).
- Sessions stored in MongoDB (`index.js:45-47`); failed logins expire by TTL index (`models.js:53-56`).
- Authorisation: `requireLogin`, `requireAdmin` (`middleware/auth.js:7-16`); admin routes (`routes/admin.js:11`).
- WebSocket uses the same session (`realtime/socket.js:20-27`).
- Identity from the session, not the body: puzzle counts (`routes/scores.js:33-37`), online scores written by
  the server (`rooms.js:93-106`).
- Tests: `tests/auth.test.js:10` (cookie flags), `:27` (bcrypt in the database), `:65` (session fixation),
  `:77` (lockout), `:135` (admin 403); `tests/realtime.test.js:27` (socket without login refused).

**On-screen ideas**
- DevTools → Application → Cookies: `brigade.sid` with HttpOnly ticked; `document.cookie` in the console is
  empty for it.
- `mongosh banana_brigade` → `db.users.findOne({}, {username:1, passwordHash:1})` shows a `$2b$10$…` hash;
  `db.sessions.find().limit(1)` shows a session document with `userId` and `role`.
- Six wrong passwords → the lockout message; `db.loginattempts.find()`.
- Log in as a player and open `/api/admin/users` → 403; as an admin → the list.

**Evaluate:** sessions vs JWT (localStorage or cookie) vs OAuth; bcrypt vs fast hashes; limits such as
per-username lockout and browser-reported offline kills. See `docs/evaluation.md` section 4.

## Comparison facts (from the research notes)
- Several other students' games call the API from the browser or send the solution to it (Bunona, Anoj Aryal,
  banana-runner). Brigade keeps the solution on the server.
- Banana Brain Quest stores a JWT in `localStorage` and trusts the browser's multiplayer score. Brigade uses an
  HttpOnly session cookie and runs online matches on the server.
- None of the projects researched had a login lockout or CI.

## Evidence to submit
- The video (own voice), the code zip (`npm run package`), and the signed Week 8 Progress Form.

## TODO: pointers to add after the other branches merge
Other branches are being worked on at the same time. When they are merged into `main`, add their file:line
pointers here and re-check every line number above:
- [ ] Identity extras: "remember me", log out of all devices, change password, delete account, admin screen.
  Add the routes and the session-store query that ends every session of one player.
- [ ] Banana API hardening: retry with backoff, circuit breaker, latency/success statistics in `/api/status`,
  room difficulty for online matches. Update the Interoperability facts (retry count, timeout).
- [ ] Polish: music, volume settings, accessibility options, mobile prompts. Add any new bus events to
  `docs/events.md`.
- [ ] Demo and packaging scripts (`npm run demo`, `npm run package`): add their file paths.
- [ ] Release tags (`v1.0.0` and milestones): add `git tag -n` to the version-control on-screen list.
- [ ] Re-run `npm test` and update the test count in the README.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
