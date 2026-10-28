# API reference

Two interfaces connect the browser and the server:

- a **REST-style HTTP/JSON API** under `/api` (called by `client/src/api.js` with `fetch`);
- a **Socket.io (WebSocket) protocol** for online play (called by `client/src/net/socket.js` and `NetGame.js`).

The server also calls one external API: the **Banana API** (last section).

Identity on both comes from the `brigade.sid` session cookie. The browser sends it automatically; it never
sends a user id. "Login" below means the route returns `401 {"error":"Please log in first"}` without a session.
Errors always have the shape `{ "error": "message" }`.

## REST endpoints

### Accounts (`server/routes/auth.js`)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` | `201 { user: { id, username, role } }` + cookie | 400 bad name/password, 409 name taken |
| POST | `/api/auth/login` | `{ username, password }` | `200 { user }` + new cookie | 400 missing, 401 wrong (tries left), 429 locked |
| POST | `/api/auth/logout` | none | `{ ok: true }`, cookie cleared | |
| GET | `/api/auth/me` | none | `{ user, puzzles: { solved, attempted } }` or `{ user: null }` | |

Rules: username `^[A-Za-z0-9_]{3,16}$` (case-insensitive unique); password 8–72 characters; 5 failed logins in
10 minutes lock that username for 10 minutes.

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
| GET | `/api/status` | none | `{ online, ready, reserve, lastError, lastSuccess }` | |

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
| POST | `/api/daily/answer` | `{ answer }` | `{ correct, solution, score, solved, bonus, unlocked, next: { index, image } }` or `{ ..., finished: true, streak }` | 400 not started / bad answer |
| GET | `/api/daily/leaderboard` | none | `{ date, rows: [{ username, score, solved }] }` | |

An answer later than 20 s (plus 2 s grace) counts as wrong. The date is UTC.

### Achievements and admin

| Method | Path | Access | Response |
|---|---|---|---|
| GET | `/api/achievements` | login | `{ all: [{ id, name, text }], mine: [{ id, at }] }` |
| GET | `/api/admin/users` | admin | `{ users: [{ id, username, role, created_at, games, kills, puzzles_solved }] }` |
| DELETE | `/api/admin/users/:id/scores` | admin | `{ deleted }` (404 unknown user) |

Admin routes return `403 {"error":"Admins only"}` to players. The role comes from the session.

Any other `/api/...` path returns `404 { error: "Not found" }`. A body that is not valid JSON returns 400.
Bodies over 4 KB are refused.

## Socket.io protocol (`server/realtime/rooms.js`)

The browser connects to the same origin (`io()` in `client/src/net/socket.js`), WebSocket first with polling
as a fallback. The handshake carries the session cookie; without a logged-in session the connection is refused
with `connect_error: "Log in to play online"`. Messages over 16 KB are dropped.

"ack" means the browser passes a callback and the server replies through it. `request()` in `net/socket.js`
waits up to 8 seconds and turns `{ error }` into an exception.

### Browser → server

| Event | Payload | Ack reply | Notes |
|---|---|---|---|
| `rooms:list` | none | `{ rooms: [{ code, host, players, teamMode, state }] }` | public rooms that are not full |
| `room:create` | `{ teamMode, isPublic, parts }` | `{ room }` | creator is host and ready |
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
| `room:update` | `{ code, host, teamMode, isPublic, state, players: [{ userId, username, ready, team, connected }] }` | any change in your room |
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
| Timeout | 5 s per attempt (`AbortSignal.timeout`, change with `BANANA_API_TIMEOUT_MS`) |
| Retries | 1 |
| Failure | `BananaApiError`; the pool falls back to its reserve; with no reserve the route returns 502 |

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
