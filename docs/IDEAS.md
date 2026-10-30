# Ideas for future work

Things that would make Banana Brigade better, grouped by theme. Each one says why it matters. Items marked
**(done)** have been built since this list was first written.

## Game
- **Replays:** online matches already send snapshots; saving them per match would allow a replay viewer and
  checking reports of cheating.
- **More maps** and a map vote in online rooms. (More maps: **done**, `feature/maps`; the vote is still open.)
- **A first-run tutorial.** **(done)** Boot Camp, `feature/boot-camp`.
- **Server-checked single-player:** run offline battles' key events (kills) through the server, or replay the
  inputs on the server, so offline scores are as trustworthy as online ones.
- **Spectator mode** for full rooms.
- **Seasonal leaderboards** that reset monthly.
- **Daily challenge fairness:** show the solutions only after the day ends, and let a run started before
  midnight UTC finish.

## Version control and teamwork
- **Pull-request based reviews:** merge every branch through a GitHub pull request with the template and a
  required green CI check (branch protection on `main`).
- **End-to-end tests in CI.** **(done)** Playwright, `feature/e2e-tests`.
- **Linting and formatting in CI** (ESLint, Prettier) and a test-coverage report.
- **Semantic versioning with release notes** generated from `CHANGELOG.md` for each tag.
- **Dependabot** for dependency updates.

## Event-driven programming
- Listen to the events that have no listeners yet: puzzle analytics from `banana:requested` / `banana:loaded` /
  `banana:error` (how long the API takes for players), a countdown beep on `match:countdown`, and a weapon-switch
  sound on `weapon:switched` (today only the scope listens to it).
- **A live event feed for admins.** **(done)** `feature/live-events`.
- Run slow server-side rules (achievements) in the background with a queue so the HTTP reply is never delayed.

## Interoperability
- **OpenAPI description** of the REST API, checked in CI. **(done)** `server/routes/openapi.js`, checked by
  `tests/integration/openapi.test.js` (`feature/openapi-v1`).
- Keep the puzzle reserve in MongoDB so it survives a restart. **(done)** `server/repositories/reservePuzzleRepository.js`.
- A second puzzle provider behind the same `fetchPuzzle()` interface, as a fallback.

## Virtual identity
- **OAuth / OpenID Connect** login with Google or GitHub, next to passwords.
- **Friends list** and private invites to rooms, using the existing identity.
- **Multi-factor authentication** (TOTP app codes) for admin accounts.
- **Per-IP rate limiting** on login, so nobody can lock another player out, and an atomic failed-login counter so
  parallel guesses cannot slip past the limit of 5. **(done)** limits per name+IP and per IP,
  `feature/password-reset-ip-limit`.
- Password reset. **(done)** single-use link printed in the server log. Still open: email verification and
  sending the reset link by email.
- HTTPS in development with a local certificate (mkcert), so the cookie is always `Secure`.

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
