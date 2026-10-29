# Evaluation: choices, alternatives and limits

For each theme: what was chosen, what else was possible, the trade-offs, and the honest limits. Comparisons with
other students' Banana API games come from the research notes in
`04 Assessment and Feedback/My plans/RESEARCH-other-banana-games.md` (outside this repository).

## 1. Version control

**Chosen:** Git with one feature branch per step (`feature/login`, `feature/gameplay`, `feature/mongodb`,
`feature/multiplayer`, `fix/lag-and-clear-ui` …), small commits with plain messages, and `git merge --no-ff`
into `main`, so every feature shows as its own bubble in `git log --graph`. GitHub Actions runs the tests and
the build on every push and pull request. A pull-request template and a review checklist are in the repository.
Milestones are marked with annotated tags: `v0.1-login`, `v0.2-gameplay`, `v0.3-mongo-react`,
`v0.4-multiplayer`, `v0.5-campaign` and `v1.0.0` (`git tag -n`). The release steps are in `CONTRIBUTING.md`.

| Alternative | For | Against |
|---|---|---|
| Trunk-based (commit straight to `main`) | Simple; no merge work | No visible feature boundaries; a broken commit hits `main` at once |
| Feature branches + GitHub pull requests | Review comments, CI status before merge, a record of discussion | Overhead for one developer reviewing his own code |
| Fast-forward or squash merges | Short, linear history | Loses the feature grouping; squash loses the small steps |
| Git Flow (develop, release, hotfix branches) | Clear for teams with scheduled releases | Too heavy for a one-person project |

**Trade-offs and limits**
- **Code reviews were done locally**: each branch was checked against the review checklist and merged with
  `--no-ff` on this machine, not through GitHub pull requests. So there is no recorded review discussion on
  GitHub. The PR template and CI are the review workflow; using real GitHub pull requests with a required green
  check is the obvious improvement.
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
| Timeout (5 s) + up to 2 retries with exponential backoff and jitter (300 ms, 900 ms), only for transient failures | No timeout; no retry; fixed-interval retries; unlimited retries | Without a timeout a hung API hangs the player. Backoff gives the API time to recover and jitter stops many clients retrying at the same moment. Bad data and 4xx answers are not retried because they will not change. The cost: a failing call takes up to about 16 s, which the 2.5 s deadline hides from the player |
| Circuit breaker (3 failures → 30 s pause → one probe) | Keep calling on every request | Spares a struggling API and stops players waiting for calls that will fail; but the state is per process, so several servers would each keep their own |
| Ready pool (3) + reserve (25) | Fetch on every request; a fixed fallback image | Instant puzzles and the game still works if the API "may be discontinued without notice". A reserve puzzle can repeat |
| All API code in one file (`bananaApi.js`) | Calls spread over routes | If the API changes, only one file changes; the tests replace it with a fake |
| REST/JSON for menus, Socket.io for matches | Polling HTTP for matches; raw `ws`; WebRTC | Polling at 30 Hz would be wasteful and laggy. Socket.io adds rooms, acks, reconnection and a polling fallback over raw `ws`, at the cost of a bigger library and its own protocol. WebRTC would be peer-to-peer, so no server authority |
| Server-authoritative online matches | Each browser reports its own kills (as Banana Brain Quest did) | The server must run the physics for every room (CPU cost), and players see others 60 ms in the past; in return nobody can fake kills |

**Limits**
- No caching headers or rate limits towards the Banana API beyond the pool; many players at once could still
  hit it often.
- The reserve lives in memory and is lost on restart.
- **Daily answers can be shared.** Every player gets the same 5 puzzles, and the solution is shown after
  answering, so a player who has finished could tell a friend. This is an accepted trade-off: a fair shared
  leaderboard needs the same puzzles, and showing the answer helps players learn.
- **A daily run that crosses midnight UTC cannot be finished.** The routes use today's date, so a run started at
  23:59 belongs to a day that has ended.
- Our REST API has no version prefix and no OpenAPI file; `docs/api.md` documents it by hand.

## 4. Virtual identity

**Chosen:** username and password; bcrypt hashes (cost 10); a server-side session in MongoDB identified by an
HttpOnly, SameSite=Lax cookie; session regeneration at login; login limits per IP address (5 tries for one name
from one IP, 20 tries from one IP across all names, per 10 minutes, counted atomically); a dummy
hash compare so timing does not reveal usernames; roles (`player`, `admin`) checked by middleware, which loads the user from the
database on every request so a deleted or demoted account loses access at once; the same session authenticates
the WebSocket. Account tools: "remember me" (30 days, off by default), log out everywhere, change password
(needs the current one, ends the other sessions) and delete account (GDPR erasure). Each of these also closes
the player's open WebSockets, because ending a session does not close a socket that is already connected.
"Forgot password" gives a single-use reset link that lasts 30 minutes; in development the link is printed in
the server terminal instead of emailed.

**Login limits: why per IP, and why atomic** (changed on `feature/password-reset-ip-limit`)

The first version locked a *username* after 5 wrong passwords. That had two problems: anyone who knew your name
could lock you out for 10 minutes, and the check ("fewer than 5 failures?") and the record ("one more failure")
were two separate steps, so guesses sent in parallel could all pass the check before any was recorded.
Now every try is counted *before* the password is checked, with one atomic `findOneAndUpdate` + `$inc` on a
counter document (`server/db.js`, `bumpCounter`). Twelve guesses sent at once get the numbers 1 to 12, so exactly
5 are checked and 7 are refused (`tests/password-reset.test.js`). A correct password takes its try back.

| Option | For | Against |
|---|---|---|
| Per username (old) | Simple; stops guessing one account from many IPs | Anyone can lock out anyone |
| **Per username + IP, plus a cap per IP (chosen)** | A stranger only locks themselves out; one machine cannot spray many names | A botnet with many IPs gets 5 tries per IP; a whole lab behind one NAT IP shares the 20-try cap |
| Per IP only | Cannot lock out a name | Students behind the same university IP block each other |
| CAPTCHA after a few failures | Stops bots, not people | Needs a third-party service; worse for players |
| `express-rate-limit` package | Ready-made | Counts in memory by default, so it resets on restart and is not shared between servers; ours is in MongoDB |

**Breached passwords: Have I Been Pwned** (`server/services/pwned.js`, `feature/pwned-passwords`)

New passwords (sign-up, change, reset) are checked against the 800+ million passwords seen in real breaches.
Only the first 5 characters of the password's SHA-1 hash are sent (k-anonymity); the service returns every suffix
with that prefix and the match is made on our server. If the service is down the password is allowed and a
warning is logged (fail open).

| Option | For | Against |
|---|---|---|
| **HIBP range API, fail open (chosen)** | Blocks the passwords attackers try first; the password never leaves the server | Depends on a third-party service; a 2.5 s timeout can slow sign-up when it is down |
| HIBP, fail closed | Never lets a breached password through | Nobody can sign up while the service is down |
| Download the HIBP list and check locally | No third party at run time | Tens of gigabytes to store and keep up to date |
| Composition rules (must have a digit, a symbol…) | Easy | NIST SP 800-63B advises against them: they lead to `Password1!`; a breach list helps more |
| Send the full hash | Simpler | The service (or anyone watching) learns the hash, which can be cracked |

**Password reset: design choices**

| Choice | Why | Alternative |
|---|---|---|
| Request by username | Accounts have no email address | Add an email field (more personal data to protect under GDPR) |
| Link printed in the server log | No mail service needed for the demo | Real email (SMTP or a service such as SendGrid): the function `sendResetLink` is the place to plug it in |
| 32 random bytes, only the SHA-256 hash stored | A database leak does not give working links; a fast hash is fine because the token is random, unlike a password | Store the token itself (a leak would let anyone reset any account) |
| Single use, marked used in the same atomic step that checks it | The same link sent twice at once still works once | Check then update (racy) |
| 30-minute expiry, MongoDB TTL index deletes it | Short window if a link leaks (e.g. from history) | A signed JWT link: no storage, but cannot be made single-use without storing something anyway |
| Same reply for known and unknown names, 5 requests per IP every 15 min | Cannot be used to find accounts or to flood the log | Saying "no such user" (user enumeration) |
| All sessions ended and the lockout cleared after a reset | Whoever had the old password is thrown out | Keep sessions (an attacker stays logged in) |
| Link address from `APP_URL` in production | The Host header can be faked to send links to an attacker's site | Use the Host header (host header injection) |
| The token is removed from the address bar after it is read | Not left in browser history or a screen recording | Leave it (it is single-use, but still) |

| Alternative | For | Against |
|---|---|---|
| JWT in `localStorage` (Banana Brain Quest) | Stateless; no session store | JavaScript can read it, so an XSS bug can steal it; cannot be revoked before it expires without a deny-list |
| JWT in an HttpOnly cookie | Not readable by JavaScript; stateless | Still hard to revoke; "log out everywhere" needs a server-side list anyway |
| OAuth / OpenID Connect (Google, GitHub) | No passwords to store; MFA from the provider | Depends on a third party; extra setup (client ids, redirect URLs); players need such an account |
| Plain SHA-256 password hash | Fast | Fast is bad: easy to brute-force. bcrypt is slow on purpose and salted |
| Argon2 | Modern, memory-hard | Needs a native module; bcrypt is well proven and pure JavaScript here |
| PHP-style sessions in memory | Simple | Lost on restart; cannot list or end one player's sessions |

**Limits (honest)**
- **Login limits depend on the IP address.** An attacker with many IP addresses (a botnet) gets 5 tries per
  address, and players who share one IP (a university network) share the cap of 20 wrong passwords per 10 minutes.
  Behind a proxy, `trust proxy` must be set correctly or every player looks like the proxy's IP.
- **Reset links go to the server log, not to the player.** In a real deployment only the server owner sees them,
  so a mail service is needed before this is useful to players. The reply time for a known name is slightly
  longer than for an unknown one (it writes the link), which could hint that a name exists; usernames are public
  on the leaderboard anyway.
- Loading the user on every request costs one small database read per request; that is the price of instant
  revocation.
- "Remember me" on a shared computer lets the next person in; that is why it is off by default.
- **Single-player kills are reported by the browser.** Puzzle counts, stars and daily scores are checked by the
  server, and online matches are fully server-authoritative, but in offline modes a modified browser could post
  a high kill count (within the limits in `routes/scores.js`).
- No HTTPS in local development; the cookie becomes `Secure` only with `NODE_ENV=production`.
- No email address on accounts, so no email verification; no multi-factor authentication.
- SameSite=Lax is the CSRF defence; there is no separate CSRF token.
- bcrypt only uses the first 72 bytes, so passwords are capped at 72 characters.

## 5. Storage: MongoDB vs SQLite

The project started on SQLite (`fadda7c`) and moved to MongoDB (`75afbbd`).

| | SQLite | MongoDB |
|---|---|---|
| Setup | One file, nothing to install | A server (Homebrew or Atlas) |
| Shape | Tables and joins | A player document holds achievements, daily streak and campaign progress |
| Sessions | Needs a separate store | `connect-mongo` keeps sessions in the same database |
| Expiry | Manual clean-up | TTL indexes delete old login counters and reset links by themselves |
| Hosting | Hard to share between servers | Atlas works from anywhere |
| Risk | SQL injection if strings are concatenated (prepared statements were used) | NoSQL injection if objects come straight from input (queries are built from checked values) |

Trade-off: MongoDB needs a running server, which makes the tutor demo harder. The in-memory demo mode
(`npm run demo`) and the in-memory test database answer that.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
