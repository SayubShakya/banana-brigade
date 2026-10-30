# Video guide: facts and pointers

**This is not a script.** The brief does not allow AI for the video. The narration must be in Sayub's own
voice and in his own words. This page only lists facts, file:line pointers and things to put on screen, so
each theme can be shown (SHOW), found in the code (LOCATE), explained (EXPLAIN) and judged (EVALUATE).
Line numbers match `main` on 30 Oct 2026 (after the MVC restructure, the comment clean-up and the Banana Meter,
Boot Camp, match length and minimap features). Check them again if the code changes before recording.

Suggested timing: demo 0:00–1:00, architecture and interoperability 1:00–2:00, version
control 2:00–3:45, events 3:45–5:30, identity 5:30–7:15, evaluation 7:15–9:15, conclusion 9:15–10:00.

## Before recording
- `./run.sh`, or `npm run demo` without MongoDB (`scripts/demo.js`: in-memory MongoDB, nothing is kept).
- Two browser windows with two accounts for online play. Create an admin with
  `npm run create-admin -- <user> <password>`.
- Preview links skip the deploy puzzle: `#campaign`, `#difficulty`, `#battle-quick`, `#puzzle-crate`, `#online`,
  `#daily`, `#profile`, `#settings`, `#admin`.
- Open in an editor: `server/services/bananaApi.js`, `server/services/pool.js`, `server/app.js`, `server/routes/auth.js`,
  `server/services/sessions.js`, `client/src/services/eventBus.js`, `client/src/game/world.js`, `server/realtime/match.js`.
- A terminal with `mongosh banana_brigade` ready, and one with the git log.

## Demo (facts to show)

For a short live demo, pick **30 s** on the Difficulty screen (first to 4): the whole match fits in half a minute,
with the live score board and minimap visible.

A 1-minute path: Menu → **Boot Camp** (move, jetpack, shoot, crate, puzzle, power) → Quick Play deploy puzzle
(show the GOLD/SILVER badge and seconds: timed by the server in `server/services/puzzles.js`) → the Banana Meter
filling → X for a Supply Drop → Results **Banana report** (live vs reserve puzzles).
- Log in (tick "remember me") → menu with rank card → Campaign map (stars, locks) → Difficulty cards → deploy
  puzzle (timer ring turns orange, then red) → battle (battle music fades in).
- In battle: get killed, press B for a respawn puzzle; press E at a banana crate and choose a Banana Power.
- Results screen with puzzles solved and stars. An achievement toast.
- Online: create a room with a bot difficulty, join by code in the second window, ready, start.
- Settings tabs: Game (API health in plain words, fullscreen), Sound (volume sliders), Accessibility (high
  contrast, large text, reduced motion), Account (change password, log out everywhere, delete account, admin).

## Interoperability
**Facts**
- Third-party service: Banana API by Marc Conrad, `https://marcconrad.com/uob/banana/api.php`, HTTPS GET, JSON.
- Request: `?out=json&base64=yes` → `{ "question": "<base64 PNG>", "solution": 7 }` (`server/services/bananaApi.js:83`), with
  `Accept: application/json` and `Cache-Control: no-store` (`server/services/bananaApi.js:88`).
- Each puzzle is a picture of a sum in which every banana hides the same digit; the answer is that digit (0–9).
- Timeout 5 s per attempt with an `AbortController`, covering the body too (`server/services/bananaApi.js:82-102`,
  timer at `:86`).
- **Up to 2 retries** (`retries = 2`, `server/services/bananaApi.js:67`) with exponential backoff and jitter: 300 ms, then
  900 ms, plus up to 30% (`server/services/bananaApi.js:109-112`). Only network errors, timeouts, HTTP 5xx and 429 are retried
  (`server/services/bananaApi.js:56-60`, `:90`); bad data stops at once (`server/services/bananaApi.js:121`).
- `BananaApiError` with `retryable` and a public `kind` (`server/services/bananaApi.js:6-14`).
- Validation and normalising of the reply: JSON, base64 pattern, digit 0–9, a digit sent as a string
  (`server/services/bananaApi.js:18-54`). CSV is also supported.
- Call statistics for `/api/status` (`server/services/bananaApi.js:128-138`).
- Pool (`pool.js`): 3 ready, reserve of 25, 2.5 s deadline on `take()` (`server/services/pool.js:116-146`), at most 3 calls in
  flight, circuit breaker after 3 failures in a row, 30 s pause, one probe (`server/services/pool.js:51-58`, opened at `:79`),
  status numbers (`server/services/pool.js:148-161`). Choices and alternatives: `docs/resilience.md`.
- The reserve is saved in MongoDB and loaded at start-up (`server/services/pool.js:33-44`, `server/index.js:35-40`), so a
  restart with the API down still has puzzles.
- Worst case for one failing call: three 5 s timeouts plus backoff, about 16 s. The deadline means the player
  waits at most 2.5 s when there is a reserve.
- Our own API for the browser: `GET /api/puzzle` (`server/services/puzzleService.js:8-18`) returns `{ puzzleId, image, purpose, source }`
  without the solution; `POST /api/puzzle/answer` (`server/services/puzzleService.js:20-27`); solutions kept in
  `server/services/puzzles.js:21-36`, which also times the answer and gives the GOLD/SILVER/BRONZE grade (`:5-10`).
- Second protocol: Socket.io for online matches (`docs/api.md` (Socket.io protocol), `server/realtime/rooms.js` lists every message).
- Shared code across machines: the server runs `client/src/game/world.js` (`server/realtime/match.js:4`).

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
- 355 commits on `main`: 280 normal commits and 75 merge commits, one per feature, fix, docs or refactor branch,
  each merged with `--no-ff` (`git log --merges --oneline | wc -l`). Examples: `feature/login`, `feature/mongodb`,
  `feature/multiplayer`, `feature/campaign`, `feature/api-hardening`, `fix/review-findings`,
  `feature/password-reset-ip-limit`, `feature/openapi-v1`, `fix/online-crate-fairness`, `refactor/server-mvc`,
  `refactor/client-mvc`, `feature/banana-meter`, `feature/boot-camp`, `feature/match-length`, `feature/minimap-scope`.
- Small commits, for example the login feature: `fadda7c` storage, `cd6b152` register/login, `4e196d7` scores,
  `edbc076` tests, `5b8dcfc` login screen.
- Annotated release tags: `v0.1-login` (3b4994b), `v0.2-gameplay` (f4e4b23), `v0.3-mongo-react` (7cfa490),
  `v0.4-multiplayer` (b8b4252), `v0.5-campaign` (b97fb75), `v1.0.0`, `v1.1.0`, `v1.2.0`, `v1.3.0`, `v1.3.1` and `v1.3.2`.
- A real design change kept in history: SQLite `fadda7c` → MongoDB `75afbbd`. `git show 75afbbd --stat` shows
  only the database file and the schema file (today split into `server/repositories/` and `server/models/`) and the package files changed.
- A bug found in review and fixed on its own branch: `fix/review-findings` (`5926ca4`, the pool's queue).
- A larger restructure on its own branches: `refactor/server-mvc` (routes → controllers → services → repositories →
  models) and `refactor/client-mvc` (views, controllers, services); the tests passed before and after.
- Modules: server routes, controllers, services, repositories, models, realtime; client views, controllers,
  services, game, net (README project layout).
- CI: `.github/workflows/ci.yml` runs `npm ci`, `npm test` (193 tests), the Playwright browser tests and the Vite build on push and pull
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
- The bus: `on`, `off`, `emit` (`client/src/services/eventBus.js:3-23`), with try/catch per listener (`:17-21`).
- Generated: DOM key press → `input:banana` (`client/src/game/input.js:126`); the world emits `soldier:killed`
  (`client/src/game/world.js:206`) and `match:ended` (`client/src/game/world.js:305`).
- Handled: kill feed (`client/src/game/hud.js:76`), sound (`client/src/game/sound.js:343`), respawn puzzle
  (`client/src/game/GameSession.js:119` → `bananaRespawn` at `:104-118`), results (`client/src/game/GameSession.js:172`
  → `game:over` at `:178` → `client/src/controllers/useBattle.js:50`).
- One event, two independent listeners: `game:state` switches the screen (`client/src/controllers/useBattle.js:45-49`) and crossfades the
  music (`client/src/game/music.js:124-127`).
- `banana:answered` (`client/src/components/PuzzleModal.jsx:116`) is heard by battle stats and the Banana Meter
  (`client/src/game/GameSession.js:64-81`), the lifetime record (`client/src/services/storage.js:12`), the chime or buzzer
  (`client/src/game/sound.js:264`) and Boot Camp (`client/src/game/tutorial.js:26`).
- Banana Meter chain: answer → `bananaAnswered` emits `banana:meter` (`client/src/game/world.js:224-230`) → HUD toast
  (`client/src/game/hud.js:102`); X key → `input:supply` (`client/src/game/GameSession.js:90-93`) → `callSupplyDrop`
  (`:85-89`, `client/src/game/world.js:239-250`) → `banana:drop` → HUD (`client/src/game/hud.js:107`). The HUD DROP
  button emits the same `input:supply` (`client/src/game/hud.js:45`).
- Boot Camp is a listener too: it subscribes to the events in `BOOT_CAMP_EVENTS` while it runs and moves to the next
  step when the right one arrives (`client/src/game/tutorial.js:26`, `:83-100`).
- React bridge: `useBus` (`client/src/hooks/useBus.js:6-10`).
- Same engine on the server with a different `emit` (`client/src/game/world.js:69`, `server/realtime/match.js:51-76`): engine events become
  snapshot events.
- Server `EventEmitter` and achievement rules (`server/services/achievements.js:32-100`; emit at `:81-92`); fired from
  `server/services/puzzleService.js:25`, `server/services/scoreService.js:33`, `server/services/campaignService.js:35`,
  `server/services/dailyService.js:51`, `:71`, `server/realtime/rooms.js:83`, `:229`. The admin live feed listens to the same
  emitter (`server/services/eventLog.js:27-36`).
- Socket.io handlers (`server/realtime/rooms.js:124-247`); 30 Hz `setInterval` tick (`server/realtime/match.js:166-168`).
- Timeouts and retries (Week 4): Banana API timeout (`server/services/bananaApi.js:84-86`), backoff (`server/services/bananaApi.js:109-112`),
  `take()` deadline (`server/services/pool.js:126-127`), socket request timeout 8 s (`client/src/net/socket.js:25-26`).
- Full catalogue: `docs/events.md`.

**On-screen ideas**
- Put a breakpoint or `console.log` in `client/src/game/hud.js:76` and get a kill: the handler runs without `world.js`
  knowing about the HUD.
- Start a battle and listen: the music changes because `music.js` listens to `game:state`, not because the
  battle code calls it.
- Unlock an achievement and point at the toast (`client/src/components/Toasts.jsx:14`) and the `unlocked` field in the Network reply.

**Evaluate:** observer bus vs direct calls; React for screens vs canvas loop; synchronous bus limits; listeners
not yet used. See `docs/evaluation.md` section 2.

## Virtual identity
**Facts**
- Register: validation (`server/services/authService.js:34-38`), `bcrypt.hash` cost 10 (`server/services/authService.js:57`), unique index race
  (`server/services/authService.js:59-64`). The sign-up form checks names live (`/available`, `server/services/authService.js:205-213`, 20 checks a minute).
- Login: limits per name+IP and per IP, counted before the password check (`server/services/authService.js:75-79`,
  `server/services/rateLimiter.js:16-34`, atomic `$inc` in `server/repositories/rateLimitRepository.js:5-19`),
  dummy-hash compare (`server/services/authService.js:81-82`), wrong password (`server/services/authService.js:83-86`),
  a correct password gives its tries back (`:87`), session regenerated (`server/lib/httpSession.js:7-23`),
  "remember me" sets 30 days (`server/lib/httpSession.js:5`, `:18`).
- Logout destroys the session and clears the cookie (`server/services/authService.js:98-101`, `server/lib/httpSession.js:25-34`).
- Log out everywhere (`server/services/authService.js:103-107`), change password, needing the current one (`server/services/authService.js:109-117`), delete
  account and all data (`server/services/authService.js:119-126`), active sessions (`server/services/accountService.js:6-11`).
- Ending sessions: one MongoDB query on the session store, then the player's sockets are closed
  (`server/services/sessions.js:5-70`). Sockets join `user:<id>` and `sid:<id>` rooms for this (`server/realtime/socket.js:22-23`).
- Cookie: `brigade.sid`, HttpOnly, SameSite=Lax, Secure in production, 2 hours (`server/middleware/session.js:7-21`).
- Sessions stored in MongoDB (`server/index.js:31-33`); login counters expire by TTL index (`server/models/rateLimit.js:5-11`).
- Authorisation: `loadUser` reads the user and role from the database on every request, so a deleted, demoted or
  suspended account loses access at once (`server/middleware/auth.js:3-23`); `requireLogin`, `requireAdmin` (`:25-42`).
- Admin routes (`server/routes/admin.js:8`); promote or demote, but not yourself (`server/services/adminService.js:43-53`); Admin screen
  (`client/src/views/Admin/Admin.jsx`), offered only to admins in Settings (`client/src/views/Settings.jsx:126`).
- WebSocket uses the same session (`server/realtime/socket.js:14-25`).
- Identity from the session, not the body: puzzle counts (`server/services/scoreService.js:29-31`, `puzzleTally` in
  `server/lib/httpSession.js:44-60`), online scores written by the server (`server/realtime/rooms.js:75-88`).
- Tests: `tests/integration/auth.test.js:8` (cookie flags), `:25` (bcrypt in the database), `:63` (session fixation),
  `:75` (five wrong passwords from one IP), `:133` (admin 403); `tests/integration/password-reset.test.js:91` (a stranger
  cannot lock the owner out), `:102` (20 per IP across names), `:114` (12 parallel guesses, only 5 checked);
  `tests/integration/identity.test.js:29` (remember me), `:40` (log out everywhere, sockets too), `:64` (password change),
  `:82` (delete account), `:132` (demoted admin loses access at once); `tests/integration/realtime.test.js:23` (socket
  without login refused).

**On-screen ideas**
- DevTools → Application → Cookies: `brigade.sid` with HttpOnly ticked, and the expiry 30 days out with
  "remember me"; `document.cookie` in the console does not show it.
- `mongosh banana_brigade` → `db.users.findOne({}, {username:1, passwordHash:1})` shows a `$2b$10$…` hash;
  `db.sessions.find({'session.userId': '<id>'})` shows one document per device.
- Log in in two windows, press "Log out everywhere" in one: the other is logged out on its next click, and the
  session documents are gone in `mongosh`.
- Six wrong passwords → the lockout message; `db.ratelimits.find()` shows the per-name+IP and per-IP counters.
- Log in as a player and open `/api/admin/users` → 403; as an admin → the Admin screen. Demote an admin in one
  window and refresh the other: access is gone at once.

**Evaluate:** sessions vs JWT (localStorage or cookie) vs OAuth; bcrypt vs fast hashes; reading the role from
the database vs trusting the session; limits such as login limits that depend on IP addresses (a botnet gets 5 tries per IP; a shared university IP shares the 20-try cap),
browser-reported offline kills and "remember me" on shared computers. See `docs/evaluation.md` section 4.

## Comparison facts (other Banana API games looked at)
- Several other students' games call the API from the browser or send the solution to it. Brigade keeps the
  solution on the server.
- One other game stores a JWT in `localStorage` and trusts the browser's multiplayer score. Brigade uses an
  HttpOnly session cookie and runs online matches on the server.
- None of the projects looked at had login limits, a circuit breaker or CI.

## Evidence to submit
- The video (own voice), the code zip (`npm run package`, which writes `../banana-brigade-source.zip` from
  `HEAD`), and evidence of the Week 8 tutor demo.

## Before recording: last checks
- [ ] Tags up to `v1.3.2` exist; tag the final version you submit.
- [ ] `npm test` still shows 193 passing tests.
- [ ] Spot-check five pointers above against the code you show on screen.

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
