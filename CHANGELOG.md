# Changelog

All notable changes to Banana Brigade. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). Each milestone below is one feature branch
merged into `main` with `--no-ff`; the merge commit is given in brackets.

## [Unreleased]

### Added (`feature/match-length`, `feature/minimap-scope`, `feature/logo-bots`, `fix/zoom-labels`)
- Match length 30 s / 1 / 2 / 3 / 5 min (also for online rooms, checked by the server) with scaled kill targets; a
  live mini leaderboard with sliding rows; a red final-10-seconds timer and `match:countdown` events.
- Minimap (line-of-sight enemies, crates, view box, death pings, M to toggle); a hold/toggle sniper scope that zooms
  in, keeps the player visible and keeps the crosshair; the camera keeps the player in a safe area.
- New logo (banana soldier with helmet, goggles, jetpack and "+ ?" puzzle tiles) with a floating shine, new favicon
  and app icons.
- Bots about 25–35 % weaker on every difficulty; Hard fires in short bursts; gentler campaign ramp.

### Added (`feature/banana-meter`, `feature/boot-camp`, `feature/feel-and-cutscenes`, `feature/wire-story-clips`)
- Server-timed puzzle grades (gold/silver/bronze), the Banana Meter with streaks, Supply Drops (X), grade-based
  deploy/respawn/crate rewards (also online), a Banana report on Results, correct hidden-digit instructions.
- Boot Camp guided tutorial, How to play card, H key help, one-time tips, Easy default with aim assist and 30 s
  bot hold-fire, Training without a deploy puzzle.
- Trauma shake, hit-stop, aim-leading camera, tracers, pickup badges, low-fuel warning; eight short story clips
  played once each (intro, crate, chapters 1–3, victory, daily; rank-up clip ready) with a Settings switch.

### Changed (`refactor/server-mvc`, `refactor/client-mvc`, `chore/strip-comments`, `docs/after-mvc`)
- **Server in layers (MVC, SOLID):** routes only wire URLs → controllers handle HTTP → services hold the rules (no
  req/res, dependencies passed in) → repositories do the queries (one per aggregate) → models are the schemas (one
  file each). Middleware files for the v1 rewrite, session cookie, CORS, last-seen, 404 and errors; `AppError`
  carries status codes. `app.js` only composes. Same URLs, responses and cookies as before.
- **Client in MVC style:** `views/` (was `screens/`), `controllers/` (hooks: navigation, account, settings, battle,
  game engine), `services/` (was `lib/`); `App.jsx` went from 269 to 77 lines and only composes.
- **Comments removed** from all code; every file keeps one credit line naming Claude (Anthropic).
- README layout and architecture tables describe the new layers; all file:line pointers in the docs remapped.

### Fixed (`fix/alignment-code`, from the alignment check)
- **The puzzle reserve is saved in MongoDB** (the newest 25) and loaded when the server starts, so restarting with
  the Banana API down still gives puzzles: the "API down" demo works from a cold start.
- `run.sh` uses a `PORT` given on the command line; it checks for Node 22.9+ (needed for `--env-file-if-exists`),
  and `engines` says the same. A busy port now prints a clear message instead of a stack trace.
- Production refuses to start without `APP_URL`, so reset links never use the request's Host header.
- `npm run demo` finds a local MongoDB on Apple silicon, Intel or Linux and uses its version (no warning).
- Playwright updated to 1.63.0 (no npm audit findings); `vite.config.mjs` (no build warning).
- Old "power weapon" wording in mission 3 and a config comment; the route summary at the top of `server/app.js`.

### Changed (`feature/gemini-trailer`)
- New 20-second home page trailer from Google Gemini: one hero flies in, opens a banana crate, the five Banana Power
  orbs come out, then desert, night and blue-vs-red battles. Compressed for the web (2.8 MB, starts playing at once)
  with a new poster of the crate and the power orbs.

### Added (`feature/headshots`)
- **Headshots for every bullet gun:** magnum ×1.5, SMG ×1.3, rifle ×1.5, shotgun ×1.25 per pellet, sniper ×2.0.
  The head zone matches the drawn head (top 45% of the body plus a small cap above it). A gold 🎯 HEADSHOT tag in
  the kill feed; the headshot ding is rate-limited.

### Fixed (`fix/online-crate-fairness`, `fix/crate-follow-ups`)
- **Online banana crates are fair:** the player solving stays frozen and protected until the puzzle window has
  closed (also 1.6 s after a wrong answer), then gets a 2 s exit shield; explosions do not push a solver; bots
  leave solvers alone (and for 1 s after). The server closes a puzzle nobody answers (crate time + 6 s) and the
  window closes by itself; online uses the room difficulty's crate time; a 5 s cooldown between crates; one player
  at a time per crate; the online respawn puzzle is one try per death.

### Added (`feature/battle-animations`)
- **Mini Militia–style animations:** killed soldiers ragdoll away from the killer, bounce and fade; gold HEADSHOT!
  pop, marker and damage number; respawn light ring; jetpack smoke trail; explosions with fireball, shockwave,
  smoke, debris and scorch mark; melee swing, grenade throw, reload (with a falling magazine), weapon swap, landing
  squash, hit flinch and lean; a banana bubble with a 🍌? badge over players solving a crate online; a red
  low-health vignette; DOUBLE KILL / TRIPLE KILL / RAMPAGE! banners. Reduced motion tones them down.

### Changed (`feature/gun-pickups`)
- **Weapon pickups are drawn as the gun itself**, not a wooden box: the same detailed gun a soldier holds, floating
  over a soft glow with a shadow and a gentle tilt, with its name above. A gun dropped by a soldier lies flat on
  the ground.

### Changed (`feature/character-art`)
- **Soldiers redrawn** after the doodle-army reference: big bald head with a headband whose tails flutter (or
  other headgear), chunky goggles with a bridge and strap, an ear and a determined mouth, a jacket with collar,
  vest pouches and a jetpack strap, camo trousers with knees that bend when walking, brown boots with soles, a
  capped and banded jetpack, and **both hands on the gun**. Every weapon has its own detailed shape (wooden
  rifle with curved magazine, pump shotgun, scoped sniper, rocket tube with warhead, flamethrower tank, revolver).
- New avatar options: **Headband** and **Bald** headgear, a **Woodland** uniform, and a **Face** choice (clean,
  stubble, beard, moustache) instead of the beard switch (old saves keep their beard). New default look:
  headband, woodland, dark goggles. Eight bots with distinct looks.

### Changed (`chore/folder-structure`)
- **Tidy folders**, moved with `git mv` so each file keeps its history:
  client `lib/` (api, eventBus, storage, rank, fullscreen, bridges), `hooks/` (useBus), `components/` (common,
  Toasts, PuzzleModal, PowerPicker), `screens/Login/` and `screens/Admin/`; server `config/` (all settings),
  `models/` (schemas and queries), `services/` (pool, puzzles, sessions, achievements, eventLog, new
  rateLimiter), `routes/docs.js` and `routes/public.js` (out of `app.js`); tests in `unit/`, `integration/` and
  `e2e/`; `INCOMPLETE_TASKS.md` is now `docs/TASKS.md`.
- `docs/openapi.yaml`, written from `server/routes/openapi.js` by `npm run openapi`; a test checks it is current.
- README project layout, `docs/architecture.md` and all file:line pointers (README, VIDEO-GUIDE, events) updated.

## [1.3.2] - 2026-10-29

The last findings of the UI audit, merged from `fix/ui-audit-remaining`.

### Changed
- Phones held sideways: no more black bars. The screen is filled and the battle view fills the width (cropped a
  little at the top and bottom); aiming still maps correctly.
- Touch screens are detected at start, so the joysticks show and keyboard hints are hidden straight away,
  including the key badges on the Banana Power cards.
- The new-password form says which account the reset link is for, and says at once if the link has expired
  (`POST /api/auth/reset/check`, which does not use the link up).

## [1.3.1] - 2026-10-29

UI audit: every screen and button checked at desktop and phone size; fixes merged from `fix/ui-audit`.

### Fixed
- Ending a battle early, or a tie on kills, no longer counts as a win (and no longer gives win XP).
- Esc after "End battle" no longer reopens Pause on a finished match; shooting stops at once.
- The respawn puzzle really is one try per death; the death message drops the offer after a miss.
- Training dummies now appear near the player instead of off screen.
- A correct answer says what happens next (deploying, back in the fight, choose your power).
- A player who is signed out by the server (suspended, password reset, signed out from another device) is
  returned to the home page with the reason, instead of screens that fail one by one.
- Reset links opened in a tab where the game is already open now show the new-password form; old hashes
  (#privacy, #login, #settings) no longer come back after a reload.
- Back returns to the screen you came from (Avatar → Profile, Controls → Settings, Difficulty → More Modes).
- Avatar preview no longer crashes on phones; the Privacy link in Settings works every time.
- Admin: the result message is next to the action, the row being changed is highlighted, disabled buttons say
  why; Live events keeps its list, Clear and Pause between tabs and holds events while paused ("Resume (3 new)");
  the live dot is green; leaderboard styling no longer leaks into admin and lobby tables.
- Lobby: one Back button ("Leave room and go back") plus Leave room in the room; rooms in a match are not
  listed; the host sees a clear "waiting for Ready" line instead of a disabled yellow button.

### Changed
- Disabled buttons look disabled everywhere. Account actions are outlined buttons; "Log out everywhere" asks first.
- Settings is wider; form results show inside the form; deleting the account confirms with a message.
- Long panels keep their Back/main buttons visible at the bottom.
- Save account (for guests) works like Create account (name check, strength meter, clear errors).
- Phones held sideways: small text has a minimum size and buttons a finger-sized height.
- Large text and High contrast now also reach the menu, cards, lists and locked campaign missions.
- Results: training has no ranking table, failed missions have Menu and a main Retry button, a survival run you
  end says so; the team HUD shows your team; the power picker explains tapping and the timeout.
- Wording: "Esc pause", "Back to Banana Brigade" on the 404 page, no developer text on the server-down screen.

## [1.3.0] - 2026-10-29

Identity, interoperability and quality round. Merged from `feature/auto-fire`, `feature/password-reset-ip-limit`,
`feature/public-pages`, `feature/pwned-passwords`, `feature/guest-play`, `feature/live-events`,
`feature/openapi-v1`, `feature/sessions-export`, `feature/admin-audit`, `feature/e2e-tests`,
`feature/loading-states` and `feature/pwa`.

### Added (`feature/public-pages`)
- **Public home page** before login: the game in one line, a battle screenshot, Play, how the Banana puzzles
  work, the game modes and a live Banana API line from `/api/status`.
- **Privacy** (what the `brigade.sid` cookie and the server store, where and for how long) and **Terms** pages,
  open to everyone (`#privacy`, `#terms`).
- **404:** unknown addresses get status 404 and a "page not found" screen; unknown `/api` paths get JSON.
- **Server down** screen when the game server cannot be reached; it checks `/api/status` every 5 s and carries
  on by itself.

### Added (`feature/pwa`)
- **Installable app (PWA):** a web app manifest (name, icons, fullscreen, landscape) and a service worker
  (`client/public/sw.js`). On a phone it can be added to the home screen; on a desktop it installs from Chrome.
  The app itself (page, scripts, styles, pictures) opens offline and shows "You are offline"; logins, puzzles,
  scores and battles always go to the server and are never cached.
- The offline screen now tells "this device is offline" apart from "the server is down".

### Added (`feature/loading-states`)
- **Loading skeletons** (shimmering placeholders) on Profile, Scores, Daily, Campaign, Settings → Account and
  every Admin tab, so screens do not jump when data arrives. They stop shimmering with Reduced motion.
- **Error toasts** on every screen when the server cannot be reached or has a fault (5xx), from one place
  (`api.js` → `toast:error` on the event bus → `Toasts.jsx`). Form errors (4xx) stay in their forms.
- Scores says "Could not load" instead of "No scores yet" when loading fails.

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

### Auto-fire (`feature/auto-fire`)

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

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
