# API reference

Two interfaces connect the browser and the server:

- a **REST-style HTTP/JSON API** under `/api` (called by `client/src/api.js` with `fetch`);
- a **Socket.io (WebSocket) protocol** for online play (called by `client/src/net/socket.js` and `NetGame.js`).

The server also calls one external API: the **Banana API** (last section).

Identity on both comes from the `brigade.sid` session cookie. The browser sends it automatically; it never
sends a user id. "Login" below means the route returns `401 {"error":"Please log in first"}` without a session,
or when the session's account no longer exists (the user is loaded from the database on every request).
Errors always have the shape `{ "error": "message" }`.

## Versioning, OpenAPI and the public endpoint

- **Version 1** lives at `/api/v1/...`; the browser uses it (`client/src/api.js`). The old paths without `/v1`
  are the same handlers and keep working (`server/app.js` rewrites `/api/v1/x` to `/api/x`).
- **OpenAPI 3** description: `/api/v1/openapi.json` (source `server/openapi.js`), shown with Swagger UI at
  **`/api/docs`**. `tests/openapi.test.js` fails if a route is added to the code but not to the spec, or the other way round.
- **Public leaderboard** for other sites: `GET /api/v1/public/leaderboard?mode=quick&limit=10`. No login and no
  cookie; `Access-Control-Allow-Origin: *` (CORS) and `OPTIONS` preflight; `Cache-Control: public, max-age=30`.
  It returns only `rank, username, kills, deaths, wave, puzzlesSolved, at`. Try it from any page's console:
  `fetch('http://localhost:3100/api/v1/public/leaderboard').then(r => r.json()).then(console.log)`.

## REST endpoints

The table lists paths without `/v1`; both forms work.

### Accounts (`server/routes/auth.js`)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` | `201 { user: { id, username, role } }` + cookie | 400 bad name/password, 409 name taken |
| POST | `/api/auth/login` | `{ username, password, remember }` | `200 { user }` + new cookie | 400 missing, 401 wrong (tries left), 429 locked |
| POST | `/api/auth/logout` | none | `{ ok: true }`, cookie cleared | |
| POST | `/api/auth/logout-all` (login) | none | `{ ok: true, ended }`, cookie cleared | |
| POST | `/api/auth/password` (login) | `{ current, next }` | `{ ok: true, ended }` | 400 new password too short/long, 403 current password wrong |
| DELETE | `/api/auth/account` (login) | `{ password }` | `{ ok: true }`, cookie cleared | 403 password wrong |
| POST | `/api/auth/guest` | none | `201 { user: { id, username: 'guest_…', role, guest: true } }` + 7-day cookie | 429 more than 10 guests per IP an hour |
| POST | `/api/auth/upgrade` (guest) | `{ username, password }` | `{ user }` (same id, `guest: false`) + new cookie | 400 not a guest / bad name / breached password, 409 name taken |
| POST | `/api/auth/forgot` | `{ username }` | `{ ok: true, message }` (same for unknown names); the link goes to the server log | 400 bad name, 429 more than 5 requests per IP in 15 min |
| POST | `/api/auth/reset/check` | `{ token }` | `{ ok: true, username }` (does not use the link) | 400 link unknown, used or expired |
| POST | `/api/auth/reset` | `{ token, password }` | `{ ok: true, username, ended }` | 400 password too short/long, 400 link unknown, used or expired |
| GET | `/api/auth/available?u=name` | none | `{ available, valid }` | 429 more than 20 checks a minute |
| GET | `/api/auth/sessions` (login) | none | `{ count, list: [{ handle, device, createdAt, lastSeen, expires, current }], current, memberSince, lastLogin }` | |
| GET | `/api/admin/audit?limit=` (admin) | none | `{ rows: [{ id, at, actor, action, target, reason, detail }] }` newest first | 403 |
| POST | `/api/admin/users/:id/suspend` (admin) | `{ reason }` | `{ ok, ended }` | 400 no reason / yourself / an admin, 409 already |
| POST | `/api/admin/users/:id/restore` (admin) | `{ reason }` | `{ ok }` | 400 no reason, 409 not suspended |
| GET | `/api/admin/health` (admin) | none | `{ now: <status>, history: [{ at, online, ready, reserve, p50LatencyMs, successRate, circuit }] }` | 403 |
| DELETE | `/api/auth/sessions/:handle` (login) | none | `{ ok: true }` | 400 this session (use logout), 404 not yours or ended |
| GET | `/api/auth/export` (login) | none | JSON file: `{ exportedAt, profile, scores, dailyResults, sessions }` (no password hash) | |
| GET | `/api/auth/me` | none | `{ user, puzzles: { solved, attempted } }` or `{ user: null }` | |

Rules: username `^[A-Za-z0-9_]{3,16}$` (case-insensitive unique); password 8–72 characters; login tries are counted
per IP: 5 for one name from one IP, or 20 from one IP across all names, in 10 minutes, then 429 until the window
ends (a correct password does not count). A reset link (`/#reset=<token>`) works once, for 30 minutes, and ends
every session of the account. `remember: true` keeps the cookie (and the stored session) for
30 days instead of 2 hours. `logout-all` ends every session of the player and closes their WebSockets;
`password` does the same for every other device (`ended` is how many sessions were ended). `account` deletes
the user, their scores, daily results, failed-login records and sessions.

```http
POST /api/auth/login
Content-Type: application/json

{"username":"sayub","password":"bananas123"}
```
```http
HTTP/1.1 200 OK
Set-Cookie: brigade.sid=s%3A...; Path=/; Expires=...; HttpOnly; SameSite=Lax

{"user":{"id":"6720f1...","username":"sayub","role":"player"}}
```

### Banana puzzles (`server/app.js`)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/puzzle?purpose=deploy\|respawn\|crate` | none | `{ puzzleId, image, purpose, source }` | 401, 502 API down and no reserve |
| POST | `/api/puzzle/answer` | `{ puzzleId, answer }` | `{ correct, solution, purpose, unlocked }` | 400 bad body, 404 expired or already answered |
| GET | `/api/status` | none | see below | |

Login is needed for the first two. `image` is a `data:image/png;base64,...` URL. `source` is `live` or `reserve`.
The response has **no solution** and is sent with `Cache-Control: no-store`. An unknown purpose falls back to
`deploy`.

```json
{ "puzzleId": "3f1c9b2e-...", "image": "data:image/png;base64,iVBORw0KGgo...", "purpose": "deploy", "source": "live" }
```
```http
POST /api/puzzle/answer
{"puzzleId":"3f1c9b2e-...","answer":7}
```
```json
{ "correct": true, "solution": 7, "purpose": "deploy", "unlocked": [] }
```

`/api/status` (no login needed) describes the Banana API connection:

```json
{ "online": true, "ready": 3, "reserve": 12, "lastError": null, "lastSuccess": "2026-10-28T19:02:11.000Z",
  "calls": 15, "lastLatencyMs": 412, "p50LatencyMs": 380, "avgLatencyMs": 401, "successRate": 100, "retriesUsed": 1,
  "circuit": { "state": "closed", "failuresInRow": 0, "retryInMs": 0 } }
```

The numbers cover the last 20 calls; `successRate` is a percentage. `lastError` is only a category
(`timeout`, `network`, `http-5xx`, `http-4xx`, `bad-data`, `circuit-open`), never the full message. The circuit
`state` is `closed`, `open` or `half-open`.

`unlocked` lists achievements this answer unlocked (`{ id, name, text }`). Every reply that has it is announced
on the browser's event bus by `api.js`.

### Scores (`server/routes/scores.js`)

| Method | Path | Body / query | Response |
|---|---|---|---|
| POST | `/api/scores` (login) | `{ mode, difficulty, kills, deaths, wave, won, durationS }` | `201 { id, puzzlesSolved, puzzlesAttempted, unlocked }` |
| GET | `/api/scores/leaderboard` | `?mode=quick\|survival\|training\|team\|online&period=all\|today&limit=1..50` | `{ mode, period, rows }` |
| GET | `/api/scores/me` (login) | none | `{ totals, recent }` |

`mode` may be `quick`, `survival`, `training` or `team` (online and campaign scores are written by the server).
Numbers must be whole and within limits (kills and deaths up to 500, wave up to 200, durationS up to 3600).
Puzzle counts are **taken from the session**, not from the body.

### Campaign (`server/routes/campaign.js`, login)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/campaign` | none | `{ chapters, missions, progress, stars }` | |
| POST | `/api/campaign/result` | `{ mission, won, kills, deaths, continues, timeS }` | `{ stars, best, progress, totalStars, unlockedNext, unlocked }` | 400 bad body, 403 mission locked |

A win only counts if `kills` reaches the mission target. Stars use the session's puzzle counts.

### Daily Banana Challenge (`server/routes/daily.js`, login)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/daily` | none | `{ date, total, seconds, played, running, result, streak, best }` | |
| POST | `/api/daily/start` | none | `{ index, total, seconds, image }` | 409 already played, 502 API down |
| GET | `/api/daily/current` | none | `{ index, total, seconds, image, score, solved, bonus }` (seconds left) | 404 no challenge running |
| POST | `/api/daily/answer` | `{ answer }` | `{ correct, solution, score, solved, bonus, unlocked, next: { index, image } }` or `{ ..., finished: true, streak }` | 400 not started / bad answer, 409 that puzzle was already answered |
| GET | `/api/daily/leaderboard` | none | `{ date, rows: [{ username, score, solved }] }` | |

An answer later than 20 s (plus 2 s grace) counts as wrong. The date is UTC. The run's position is kept in the
`DailyResult` document and moved on atomically, so two answers sent at once cannot both score the same puzzle.
Today's puzzles are fetched before the attempt is used up, so an API outage (502) does not cost the day's go.
`/current` lets the page carry on after a reload.

### Achievements and admin

| Method | Path | Access | Response |
|---|---|---|---|
| GET | `/api/achievements` | login | `{ all: [{ id, name, text }], mine: [{ id, at }] }` |
| GET | `/api/admin/users` | admin | `{ users: [{ id, username, role, created_at, games, kills, puzzles_solved }] }` |
| DELETE | `/api/admin/users/:id/scores` | admin | `{ deleted }` (404 unknown user) |
| PATCH | `/api/admin/users/:id/role` | admin | body `{ role: 'player'\|'admin' }` → `{ user: { id, username, role } }` (400 bad role or demoting yourself, 404 unknown user) |

Admin routes return `403 {"error":"Admins only"}` to players. The role is read from the database on every
request, so a promotion or demotion applies at once.

Any other `/api/...` path returns `404 { error: "Not found" }`. A body that is not valid JSON returns 400.
Bodies over 4 KB are refused.

## Socket.io protocol (`server/realtime/rooms.js`)

The browser connects to the same origin (`io()` in `client/src/net/socket.js`), WebSocket first with polling
as a fallback. The handshake carries the session cookie; without a logged-in session the connection is refused
with `connect_error: "Log in to play online"`. Messages over 16 KB are dropped. Each socket joins the rooms
`user:<id>` and `sid:<session id>`, so logging out everywhere, changing the password or deleting the account can
close a player's open sockets.

"ack" means the browser passes a callback and the server replies through it. `request()` in `net/socket.js`
waits up to 8 seconds and turns `{ error }` into an exception.

### Browser → server

| Event | Payload | Ack reply | Notes |
|---|---|---|---|
| `rooms:list` | none | `{ rooms: [{ code, host, players, teamMode, difficulty, state }] }` | public rooms that are not full |
| `room:create` | `{ teamMode, isPublic, difficulty, parts }` | `{ room }` or `{ error: 'Unknown difficulty' }` | creator is host and ready; `difficulty` is `easy`, `medium` (default) or `hard` and sets the bots |
| `room:join` | `{ code, parts }` | `{ room }` or `{ error }` | no room, full, or already started |
| `room:leave` | none | none | a bot takes over your soldier if a match is running |
| `room:ready` | `{ ready }` | none | lobby only |
| `room:start` | none | `{ ok: true }` or `{ error }` | host only, everyone ready |
| `input` | `{ left, right, jet, fire, aimX, aimY, reload, swap, grenade, melee, pickup }` | none | sent on change and at least every 50 ms |
| `puzzle:get` | `{ purpose: 'respawn'\|'crate' }` | `{ puzzleId, image, purpose, source }` or `{ error }` | only when the server allows it (`canAsk`) |
| `puzzle:answer` | `{ puzzleId, answer }` | `{ correct, solution, purpose }` or `{ error }` | only the player the puzzle was given to |
| `puzzle:cancel` | `{ purpose: 'crate' }` | none | leave the crate |

### Server → browser

| Event | Payload | When |
|---|---|---|
| `room:update` | `{ code, host, teamMode, isPublic, difficulty, state, players: [{ userId, username, ready, team, connected }] }` | any change in your room |
| `rooms:changed` | none | a room was made, changed or closed (the lobby asks `rooms:list` again) |
| `match:start` | `{ matchId, me, teamMode, roster: [{ id, name, team, human, avatar }] }` | the host started, or you reconnected |
| `match:snapshot` | `{ t, time, timeLeft, teamKills, soldiers, bullets, rockets, flames, grenades, pickups, near, events }` | 30 times a second |
| `match:end` | `{ matchId, reason, teamMode, teamKills, durationS, ranking }` | kill limit, time, or host ended it |
| `puzzle:offer` | `{ purpose: 'crate' }` | you pressed E at a banana crate (your soldier is frozen and shielded) |
| `achievement:unlocked` | `{ id, name, text }` | an achievement unlocked during online play |

`events` inside a snapshot is a list of `[type, data]` pairs from that tick: `killed`, `damaged`, `respawned`,
`pickup`, `fired`, `reloading`, `reloaded`, `empty`, `explosion`, `left`. `NetGame.js` turns them back into the
usual bus events. In a snapshot, a gun's `spare: -1` means unlimited (JSON has no `Infinity`).

## The external Banana API (`server/services/bananaApi.js`)

| | |
|---|---|
| URL | `https://marcconrad.com/uob/banana/api.php?out=json&base64=yes` (change with `BANANA_API_URL`) |
| Method | `GET` over HTTPS |
| Response | `{ "question": "<base64 PNG>", "solution": 7 }` |
| Also supported | `out=csv` (`<image>,7`) and `base64=no` (an image URL); tested in `tests/server.test.js` |
| Checks | valid JSON; `question` is base64 (or an http(s) URL); `solution` is a whole number 0–9 |
| Headers | `Accept: application/json`, `Cache-Control: no-store` |
| Timeout | 5 s per attempt, body included (`AbortController`, change with `BANANA_API_TIMEOUT_MS`) |
| Retries | Up to 2, only for network errors, timeouts, HTTP 5xx and 429; waits 300 ms then 900 ms, plus up to 30% jitter |
| Normalised | spaces inside the base64, a `data:image/png;base64,` prefix, the digit sent as a string |
| Failure | `BananaApiError` with a `kind`; the pool serves its reserve; with no reserve the route returns 502 |
| Pool | 3 ready, reserve of 25, 2.5 s deadline per `take()`, at most 3 calls in flight, circuit breaker (3 failures → 30 s pause → one probe) |

More on these choices: [resilience.md](resilience.md).

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
