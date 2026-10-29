# Changelog

All notable changes to Banana Brigade. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). Each milestone below is one feature branch
merged into `main` with `--no-ff`; the merge commit is given in brackets.

## [Unreleased]

On `feature/auto-fire`.

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
