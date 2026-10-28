# Changelog

All notable changes to Banana Brigade. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/). Each milestone below is one feature branch
merged into `main` with `--no-ff`; the merge commit is given in brackets.

## [1.0.0] - 2026-10-28

### Added
- Documentation: README rewrite, `docs/architecture.md`, `docs/events.md`, `docs/api.md`,
  `docs/evaluation.md`, `docs/IDEAS.md`, `docs/VIDEO-GUIDE.md`.
- GitHub Actions CI: tests and the Vite build on every push and pull request.
- `CONTRIBUTING.md` with the branch, commit, merge, review and release rules, and a pull-request template.
- This changelog.

### Changed
- Version 1.0.0 and an accurate package description.

## Milestones before 1.0.0

### Audit against the brief - 2026-10-28 (`docs/incomplete-tasks`, 871d390)
#### Added
- `INCOMPLETE_TASKS.md`: what is done and what is left, theme by theme.

### Campaign - 2026-10-28 (`feature/campaign`, b97fb75)
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

### Online multiplayer - 2026-10-28 (`feature/multiplayer`, b8b4252)
#### Added
- Socket.io server that only accepts logged-in sessions.
- Online matches run on the server with the shared engine.
- Rooms with codes, ready checks and server-checked Banana puzzles; lobby screen.
- Tests: socket login, rooms, faked scores ignored.

### React screens - 2026-10-28 (`feature/react-screens`, 7cfa490)
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

### Gameplay - 2026-10-28 (`feature/gameplay`, f4e4b23)
#### Added
- Game engine: jetpack physics, weapons, bots and four modes.
- Canvas renderer, keyboard/mouse/touch input and Web Audio sounds.
- Live game loop with Banana respawns, crates and saved scores.

### Login - 2026-10-28 (`feature/login`, 3b4994b)
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

[1.0.0]: https://github.com/SayubShakya/banana-brigade/releases/tag/v1.0.0

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
