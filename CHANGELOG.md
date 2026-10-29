# Changelog

All notable changes to Banana Brigade. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). Each milestone below is one feature branch
merged into `main` with `--no-ff`; the merge commit is given in brackets.

## [Unreleased]

### Added (`feature/public-pages`)
- **Public home page** before login: the game in one line, a battle screenshot, Play, how the Banana puzzles
  work, the game modes and a live Banana API line from `/api/status`.
- **Privacy** (what the `brigade.sid` cookie and the server store, where and for how long) and **Terms** pages,
  open to everyone (`#privacy`, `#terms`).
- **404:** unknown addresses get status 404 and a "page not found" screen; unknown `/api` paths get JSON.
- **Server down** screen when the game server cannot be reached; it checks `/api/status` every 5 s and carries
  on by itself.

### Added (`feature/e2e-tests`)
- **End-to-end tests** with Playwright (`npm run e2e`): register, log out and in, start Quick Play, solve the
  deploy puzzle (fake Banana API) and reach the battle; and the 404 page. A second GitHub Actions job runs them
  in Chromium and keeps the report if they fail.

### Fixed
- Replaced the deprecated Mongoose `new: true` option with `returnDocument: 'after'` (no more warnings in the log).

### Added (`feature/admin-audit`)
- **Audit log:** every admin action (reset scores, promote/demote, suspend, restore) needs a reason and is saved
  with who, what, to whom and when (MongoDB `auditlogs`); Admin → Audit log shows it. Actions also appear in
  the live event feed.
- **Suspend and restore** a player with a reason: all their sessions end and their sockets close at once; they
  cannot log in (the reason is shown) or open a WebSocket until restored. Admins must be demoted first.
- **API health** tab: Banana API online state, circuit breaker, ready and reserve puzzles, retries, and charts
  of median latency and success rate (a sample every 30 s for the last hour, `/api/admin/health`).

### Added (`feature/sessions-export`)
- **Where you're signed in** (Settings → Account): every live session with its device ("Chrome on macOS"),
  when it started and when it was last used, read from the MongoDB session store; **Sign out** ends one other
  device and drops its WebSocket. The browser only sees a hash of each session id, never the id.
- **Download my data**: a JSON file with the profile, achievements, campaign, scores, daily results and
  sessions (GDPR right of access). The password hash is never included.

### Added (`feature/openapi-v1`)
- **API version 1** at `/api/v1/...` (the browser uses it); the old `/api/...` paths still work.
- **OpenAPI 3** description at `/api/v1/openapi.json` and **Swagger UI** at `/api/docs`. A test checks that the
  spec and the routes in the code match.
- **Public leaderboard** `GET /api/v1/public/leaderboard`: read-only, no login, CORS for any origin, cached 30 s.

### Added (`feature/live-events`)
- **Live events** tab in Admin: logins, wrong passwords, guests, puzzles, scores, achievements, online kills and
  admin actions appear as they happen, pushed over Socket.io from a server `EventEmitter` (`server/eventLog.js`).
  Filter by kind, pause and clear. Only admins can watch (role checked in the database).

### Added (`feature/guest-play`)
- **Play as guest** (home page and login): a temporary account `guest_xxxxxx` with no password, kept 7 days
  (cookie and a MongoDB TTL index) and left off the leaderboards. **Save your progress** turns it into a full
  account with a name and password; it is the same record, so scores, achievements and stars stay.

### Added (`feature/pwned-passwords`)
- New passwords (sign-up, change, reset) are checked against **Have I Been Pwned** with the k-anonymity range
  API: only the first 5 characters of the SHA-1 hash are sent. If the service is down the password is allowed
  and a warning is logged. `PWNED_CHECK=off` turns it off.

### From `feature/password-reset-ip-limit`

### Added
- **Forgot password.** "Forgot password?" on the login screen asks for a reset link by username. The link works
  once, for 30 minutes; only a SHA-256 hash of its token is stored. Using it sets the new password, ends every
  session of the account and clears its login limit. In development the link is printed in the server terminal.
  The reply is the same for unknown names; 5 requests per IP every 15 minutes. `APP_URL` sets the link address.
- Tests in `tests/password-reset.test.js`.

### Changed
- **Login limits are per IP address.** 5 wrong passwords for one name from one IP, or 20 from one IP across all
  names, per 10 minutes. A stranger can no longer lock someone else out. Tries are counted with an atomic `$inc`
  before the password is checked, so parallel guesses cannot get past the limit.
- README: the banana crate row now describes Banana Powers.

## Auto-fire - 2026-10-29

Merged from `feature/auto-fire`.

### Added
- **Auto-fire.** Players only aim (mouse or right stick) and the gun fires by itself while the aim is on an
  enemy that is alive, on the other team, within the weapon's range and not behind a wall. No need to hold
  the mouse button or touchpad. On by default; can be switched off in Settings. Clicking still works.
- Tests for auto-fire (`tests/autofire.test.js`).

## [1.2.0] - 2026-10-28

Merged from `feature/banana-powers`.

### Added
- **Banana Powers.** Solving a banana crate puzzle now opens "Choose your Banana Power": three random powers
  or Random (+3 s). Banana Rage (×2 damage, 8 s), Jet Overdrive (endless fuel, +40% speed, 10 s),
  Banana Bubble (no damage, 6 s), Rapid Fire (×2 fire rate, no ammo, 8 s), Banana Juice (full health and
  fast healing, 8 s). Shown as a HUD chip, a coloured glow round the soldier, toasts and sounds.
- Five banana crates on every map (was two); a taken crate returns after 40 s and shows a ghost countdown.
- Online: the server offers the powers, checks the choice and picks at random after 7 s.
- "Power Hungry" achievement for using all five powers.

### Changed
- Banana crates no longer give a power weapon, full health and grenades.

## [1.1.0] - 2026-10-28

Gameplay quality round. Merged from `feature/game-audio`, `feature/shooting-feel`, `feature/combat-feel`,
`fix/buff-hud-and-dust`, `feature/maps`, `feature/logo` and `fix/qa-gameplay`.

### Added
- Four maps with their own look: Jungle Ridge, Desert Outpost, Snow Peak and Night Base (random in quick modes,
  fixed per campaign mission, chosen by the server online), with tests that every spawn and pickup can be reached.
- Shooting feel: sniper scope overlay, hit markers, floating damage numbers, damage-direction arrows, recoil,
  muzzle flashes per weapon, tracers, wall sparks, shell casings, screen shake (off with reduced motion).
- Combat: smoother jetpack take-off, coyote time and jump buffer, sniper headshots, shotgun falloff, shield /
  jet fuel / ammo pickups (shown as HUD chips), smarter bots (retreat, dodge, spread targets).
- Game audio: a sound per weapon with stereo panning and distance, jetpack loop, impacts, footsteps, landings,
  headshot ding, kill chord, low-health heartbeat.
- The Banana Brigade emblem (tab icon, login, menu, README).

### Fixed
- One press of E could pick the old gun straight back up.
- Explosions hurt soldiers through walls and floors.
- The battle kept running (and making noise) behind the results screen.
- Melee was stronger than guns; it is now 25 damage every 0.8 s and skips teammates.
- Online players were missing landing dust, ricochets, grenade, melee and shield sounds.
- A new battle could start already zoomed in.

## [1.0.0] - 2026-10-28

Merged from `fix/daily-and-demo` (90b15bd), `feature/identity-plus` (5945813), `feature/polish` (ccb8657),
`feature/api-hardening` (63b53da), `docs/readme-ci` (3abaa7f), `fix/review-findings` (90b97cd) and
`docs/final-pass`.

### Added
- Account tools: remember me (30 days), log out of all devices, change password, delete account, a live
  username check and an active-session count on the profile.
- Admin screen: list users, reset scores, promote and demote (but not yourself).
- Banana API resilience: per-attempt timeout, up to 2 retries with backoff and jitter for transient failures,
  a 2.5 s deadline on `take()`, an in-flight limit and a circuit breaker; latency, success rate and circuit
  state in `/api/status` and in Settings; `docs/resilience.md`.
- Online rooms: the host picks the bots' difficulty, checked on the server.
- Procedural menu and battle music that crossfades on `game:state`; music and effects volume sliders and a
  mute; a chime or buzzer for each Banana answer.
- Accessibility: high contrast, large text and reduced motion, with focus outlines; a coloured puzzle timer.
- Phones: a fullscreen button and a rotate-to-landscape hint.
- `npm run demo` (in-memory MongoDB) and `npm run package` (source zip of `HEAD`).
- The daily challenge carries on after a page reload (`GET /api/daily/current`).
- Documentation: README rewrite, `docs/architecture.md`, `docs/events.md`, `docs/api.md`,
  `docs/evaluation.md`, `docs/IDEAS.md`, `docs/VIDEO-GUIDE.md`.
- GitHub Actions CI: tests and the Vite build on every push and pull request.
- `CONTRIBUTING.md` with the branch, commit, merge, review and release rules, and a pull-request template.
- This changelog.

### Changed
- Version 1.0.0 and an accurate package description.
- Protected routes read the user and role from the database on every request, so a deleted or demoted account
  loses access at once.
- Settings split into Game, Sound, Accessibility and Account tabs.

### Fixed
- Daily challenge: an API outage no longer uses up the day's attempt, and two answers sent at once can no
  longer score one puzzle twice (the run's position is advanced atomically in MongoDB).
- A queued player no longer loses their place in the puzzle pool when another player times out.
- CI downloads MongoDB into the cached folder, so the cache is used.

## Milestones before 1.0.0

### Audit against the brief - 2026-10-28 (`docs/incomplete-tasks`, 871d390)
#### Added
- `INCOMPLETE_TASKS.md`: what is done and what is left, theme by theme.

### Campaign - 2026-10-28 (`feature/campaign`, b97fb75, tag `v0.5-campaign`)
#### Added
- 9 missions in 3 chapters with lives, kill targets, Banana continues and a difficulty ramp.
- Server-checked unlocks and stars, saved per player.
- Campaign map with stars, locks and briefings; mission stars, Retry and Next on the results screen.

### Difficulty levels - 2026-10-28 (`feature/difficulty-levels`, 9331ece)
#### Added
- Easy, Medium and Hard: change bots and puzzle timers; chosen before every battle.
- Difficulty saved with each score; the Hard as Nails achievement.
#### Changed
- Cleaner menu: name on the podium; logout and API status moved to Settings.

### Fair bots and UI polish - 2026-10-28 (`fix/fair-bots-and-ui-polish`, c9eaa13)
#### Fixed
- Bots were too accurate: slower reactions, burst fire, softer hits.
#### Changed
- Screen polish: hills behind panels, pop-in, hover glow, leaderboard medals.

### Achievements and Daily Challenge - 2026-10-28 (`feature/achievements-daily`, 5083e5d)
#### Added
- Event-driven achievements with write-once unlocks, fired from puzzles, scores and online matches.
- Daily Banana Challenge: one attempt a day, doubling points, day streaks.
- Achievement toasts over HTTP and the socket; badges on the profile; tests.

### Lag fixes and clearer UI - 2026-10-28 (`fix/lag-and-clear-ui`, 2e89f37)
#### Fixed
- The local game steps in fixed 1/60 s steps, so it never slows down.
- Smoother online play: 30 Hz snapshots, blending of every soldier, controls sent on change.
#### Changed
- Controls shown at the start of a battle, key letters on buttons, an FPS option.
- Menu simplified to three choices with an icon rail and a More Modes screen.

### Online multiplayer - 2026-10-28 (`feature/multiplayer`, b8b4252, tag `v0.4-multiplayer`)
#### Added
- Socket.io server that only accepts logged-in sessions.
- Online matches run on the server with the shared engine.
- Rooms with codes, ready checks and server-checked Banana puzzles; lobby screen.
- Tests: socket login, rooms, faked scores ignored.

### React screens - 2026-10-28 (`feature/react-screens`, 7cfa490, tag `v0.3-mongo-react`)
#### Changed
- Vite and React set up; the engine moved into `client/`; the server serves the build.
- Game loop split into `GameSession`, with event-bus hooks for React.
- Every screen rebuilt as a React component with one screen state machine.

### MongoDB - 2026-10-28 (`feature/mongodb`, d7750c1)
#### Changed
- Storage moved from SQLite to MongoDB with Mongoose models; sessions kept in MongoDB.
- Tests run on an in-memory MongoDB; `run.sh` starts `mongod`.

### Profile screens - 2026-10-28 (`feature/profile-screens`, 4ff980b)
#### Added
- Today's leaders, play time and wins; rank and XP; Profile, Scores and Settings screens.
- Sight laser and a switch for kill-streak banners.

### Gameplay - 2026-10-28 (`feature/gameplay`, f4e4b23, tag `v0.2-gameplay`)
#### Added
- Game engine: jetpack physics, weapons, bots and four modes.
- Canvas renderer, keyboard/mouse/touch input and Web Audio sounds.
- Live game loop with Banana respawns, crates and saved scores.

### Login - 2026-10-28 (`feature/login`, 3b4994b, tag `v0.1-login`)
#### Added
- Register, login and logout with bcrypt and sessions; score saving, leaderboard and admin API.
- SQLite storage for players, scores and login attempts.
- Tests for login, sessions, lockout, roles and scores; the login screen.

### Banana Brigade UI - 2026-10-28 (`feature/banana-brigade`, a5fcdca)
#### Added
- Banana Brigade server and Banana API client; puzzle API, pool and parsing tests.
- Event bus, map, soldier avatars, puzzle screen, menu, HUD, pause and results screens.
#### Removed
- The earlier Banana Rush prototype.

### Project skeleton - 2026-10-14 (`feature/project-skeleton`, ead691b)
#### Added
- Banana API service with timeout, retry and JSON/CSV parsing.
- SQLite schema, registration, login and sessions with bcrypt.
- Game, scores and admin routes; first pages and event bus; automated tests.

[1.2.0]: https://github.com/SayubShakya/banana-brigade/releases/tag/v1.2.0
[1.1.0]: https://github.com/SayubShakya/banana-brigade/releases/tag/v1.1.0
[1.0.0]: https://github.com/SayubShakya/banana-brigade/releases/tag/v1.0.0

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
