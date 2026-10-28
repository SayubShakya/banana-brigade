# Evaluation: choices, alternatives and limits

For each theme: what was chosen, what else was possible, the trade-offs, and the honest limits. Comparisons with
other students' Banana API games come from the research notes in
`04 Assessment and Feedback/My plans/RESEARCH-other-banana-games.md` (outside this repository).

## 1. Version control

**Chosen:** Git with one feature branch per step (`feature/login`, `feature/gameplay`, `feature/mongodb`,
`feature/multiplayer`, `fix/lag-and-clear-ui` …), small commits with plain messages, and `git merge --no-ff`
into `main`, so every feature shows as its own bubble in `git log --graph`. GitHub Actions runs the tests and
the build on every push and pull request. A pull-request template and a review checklist are in the repository.
The release steps in `CONTRIBUTING.md` use annotated tags.

| Alternative | For | Against |
|---|---|---|
| Trunk-based (commit straight to `main`) | Simple; no merge work | No visible feature boundaries; a broken commit hits `main` at once |
| Feature branches + GitHub pull requests | Review comments, CI status before merge, a record of discussion | Overhead for one developer reviewing his own code |
| Fast-forward or squash merges | Short, linear history | Loses the feature grouping; squash loses the small steps |
| Git Flow (develop, release, hotfix branches) | Clear for teams with scheduled releases | Too heavy for a one-person project |

**Trade-offs and limits**
- Branches were merged **locally with `--no-ff`**, not through GitHub pull requests. So there is no recorded
  review discussion. The PR template and CI are added as the review workflow from now on.
- One developer: branches rarely conflict, so the history shows little real merge-conflict resolution.
- Most work happened on two days (14 and 28 October), so the dates show bursts rather than steady progress.
- The history keeps a real design change: SQLite (`fadda7c`) replaced by MongoDB (`75afbbd`). Because
  `server/db.js` hid the database behind functions, the swap touched only `db.js`, `models.js` and the session
  store; the routes did not change. That is evidence the modular structure worked.
- CI checks tests and the build, but there is no linter or test-coverage gate.

## 2. Event-driven programming

**Chosen:** a small publish/subscribe bus in the browser (`eventBus.js`); the engine announces facts
(`soldier:killed`, `match:ended`) and the HUD, sound, React screens and stats subscribe. React joins with a
`useBus` hook. The server uses a Node `EventEmitter` and a rules list for achievements, and Socket.io messages
for online play.

| Choice | Alternative | Why this one |
|---|---|---|
| Custom bus (28 lines) | DOM `CustomEvent` on `window`; a library such as mitt or RxJS | Works in Node too (the engine runs on the server); no dependency; errors in one listener are caught |
| Engine emits, others listen | Engine calls `hud.addKill()`, `sound.play()` directly | The engine has no screen code, so the same `world.js` runs on the server with a different `emit` |
| React for screens, canvas loop for the battle | Everything in React state; or everything in canvas | React re-rendering 60 times a second would be slow; menus in canvas would be hard to build and not accessible |
| Two events (`game:state`, `game:over`) as the engine↔React contract | React polls the engine | Local and online games emit the same events, so `App.jsx` has one code path |
| Achievement rules subscribed by event name | `if` checks inside each route | Routes do not know badges exist; adding a badge is one rule |
| Fixed 1/60 s steps in `requestAnimationFrame` | Variable time step | Same behaviour at 60 Hz and 120 Hz; no slow motion when a frame is late |
| Socket.io events with acks | Plain WebSocket messages | Acks give request/reply with a timeout (`request()` in `net/socket.js`) |

**Limits**
- A global bus makes it harder to see who listens to what. `docs/events.md` exists for that reason.
- Some events have no listeners yet (`match:started`, `weapon:switched`, `banana:requested`).
- On the server, the rules are held in an array and `achievements.emit` awaits them in order. The
  `EventEmitter` itself has no extra listeners yet. This keeps the "which badges did this unlock?" reply simple,
  but a slow rule delays the HTTP reply.
- Bus events are synchronous; a heavy listener would slow the frame.

## 3. Interoperability

**Chosen:** the **server** calls the Banana API over HTTPS with `out=json&base64=yes`, parses and checks the
reply, keeps the solution, and gives the browser only a picture and an id. The browser talks to our server with
JSON over HTTP (`fetch`) and, for online play, Socket.io.

| Decision | Alternative | Trade-off |
|---|---|---|
| Server proxy | Browser calls the Banana API directly (as several other students did) | Direct is simpler, but the solution would be visible in DevTools and anyone could cheat. The proxy adds a hop and makes our server a dependency |
| JSON + base64 | `out=csv`; JSON with an image URL | JSON is self-describing and easy to validate; CSV needs hand splitting and breaks if the format changes; a URL means a second download from another host. Base64 makes each reply about a third larger |
| Timeout (5 s) + 1 retry | No timeout; many retries; exponential backoff | Without a timeout a hung API hangs the player. More retries would load an API that is already struggling |
| Ready pool (3) + reserve (25) | Fetch on every request; a fixed fallback image | Instant puzzles and the game still works if the API "may be discontinued without notice". A reserve puzzle can repeat |
| All API code in one file (`bananaApi.js`) | Calls spread over routes | If the API changes, only one file changes; the tests replace it with a fake |
| REST/JSON for menus, Socket.io for matches | Polling HTTP for matches; raw `ws`; WebRTC | Polling at 30 Hz would be wasteful and laggy. Socket.io adds rooms, acks, reconnection and a polling fallback over raw `ws`, at the cost of a bigger library and its own protocol. WebRTC would be peer-to-peer, so no server authority |
| Server-authoritative online matches | Each browser reports its own kills (as Banana Brain Quest did) | The server must run the physics for every room (CPU cost), and players see others 60 ms in the past; in return nobody can fake kills |

**Limits**
- No caching headers or rate limits towards the Banana API beyond the pool; many players at once could still
  hit it often.
- The reserve lives in memory and is lost on restart.
- Our REST API has no version prefix and no OpenAPI file; `docs/api.md` documents it by hand.

## 4. Virtual identity

**Chosen:** username and password; bcrypt hashes (cost 10); a server-side session in MongoDB identified by an
HttpOnly, SameSite=Lax cookie; session regeneration at login; lockout after 5 failures in 10 minutes; a dummy
hash compare so timing does not reveal usernames; roles (`player`, `admin`) checked by middleware; the same
session authenticates the WebSocket.

| Alternative | For | Against |
|---|---|---|
| JWT in `localStorage` (Banana Brain Quest) | Stateless; no session store | JavaScript can read it, so an XSS bug can steal it; cannot be revoked before it expires without a deny-list |
| JWT in an HttpOnly cookie | Not readable by JavaScript; stateless | Still hard to revoke; "log out everywhere" needs a server-side list anyway |
| OAuth / OpenID Connect (Google, GitHub) | No passwords to store; MFA from the provider | Depends on a third party; extra setup (client ids, redirect URLs); players need such an account |
| Plain SHA-256 password hash | Fast | Fast is bad: easy to brute-force. bcrypt is slow on purpose and salted |
| Argon2 | Modern, memory-hard | Needs a native module; bcrypt is well proven and pure JavaScript here |
| PHP-style sessions in memory | Simple | Lost on restart; cannot list or end one player's sessions |

**Limits (honest)**
- **Lockout is per username.** Someone who knows your name can lock you out for 10 minutes by typing wrong
  passwords. A per-IP limit (or per username + IP) would avoid that, but IPs are shared behind NAT and change on
  mobile networks.
- **Single-player kills are reported by the browser.** Puzzle counts, stars and daily scores are checked by the
  server, and online matches are fully server-authoritative, but in offline modes a modified browser could post
  a high kill count (within the limits in `routes/scores.js`).
- No HTTPS in local development; the cookie becomes `Secure` only with `NODE_ENV=production`.
- No email, so no password reset or verification; no multi-factor authentication.
- SameSite=Lax is the CSRF defence; there is no separate CSRF token.
- bcrypt only uses the first 72 bytes, so passwords are capped at 72 characters.

## 5. Storage: MongoDB vs SQLite

The project started on SQLite (`fadda7c`) and moved to MongoDB (`75afbbd`).

| | SQLite | MongoDB |
|---|---|---|
| Setup | One file, nothing to install | A server (Homebrew or Atlas) |
| Shape | Tables and joins | A player document holds achievements, daily streak and campaign progress |
| Sessions | Needs a separate store | `connect-mongo` keeps sessions in the same database |
| Expiry | Manual clean-up | TTL index deletes failed logins by itself |
| Hosting | Hard to share between servers | Atlas works from anywhere |
| Risk | SQL injection if strings are concatenated (prepared statements were used) | NoSQL injection if objects come straight from input (queries are built from checked values) |

Trade-off: MongoDB needs a running server, which makes the tutor demo harder. The in-memory demo mode
(`npm run demo`) and the in-memory test database answer that.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
