# Ideas for future work

Things that would make Banana Brigade better, grouped by theme. Each one says why it matters.

## Game
- **Replays:** online matches already send snapshots; saving them per match would allow a replay viewer and
  checking reports of cheating.
- **More maps** and a map vote in online rooms.
- **Server-checked single-player:** run offline battles' key events (kills) through the server, or replay the
  inputs on the server, so offline scores are as trustworthy as online ones.
- **Spectator mode** for full rooms.
- **Seasonal leaderboards** that reset monthly.

## Version control and teamwork
- **Pull-request based reviews:** merge every branch through a GitHub pull request with the template and a
  required green CI check (branch protection on `main`).
- **Linting and formatting in CI** (ESLint, Prettier) and a test-coverage report.
- **Semantic versioning with release notes** generated from `CHANGELOG.md` for each tag.
- **Dependabot** for dependency updates.

## Event-driven programming
- Listen to the events that have no listeners yet: a weapon-switch sound, and puzzle analytics from
  `banana:requested` / `banana:loaded` / `banana:error` (how long the API takes for players).
- Run slow server-side rules (achievements) in the background with a queue so the HTTP reply is never delayed.

## Interoperability
- **OpenAPI description** of the REST API, generated or checked in CI.
- Keep the puzzle reserve in MongoDB so it survives a restart.
- A second puzzle provider behind the same `fetchPuzzle()` interface, as a fallback.

## Virtual identity
- **OAuth / OpenID Connect** login with Google or GitHub, next to passwords.
- **Friends list** and private invites to rooms, using the existing identity.
- **Multi-factor authentication** (TOTP app codes) for admin accounts.
- **Per-IP rate limiting** on login as well as per username, so nobody can lock another player out.
- Email verification and password reset.
- HTTPS in development with a local certificate (mkcert), so the cookie is always `Secure`.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
