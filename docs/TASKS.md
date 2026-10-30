# Task list

My task list for Banana Brigade, checked against the CIS046-3 Assignment 1 brief (four themes, the case study
and the Week 8 tutor demo). Last updated: 30 Oct 2026.
Status key: [ ] open · [x] done (with branch). All branches are merged into `main` with `--no-ff`.

Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

## Game (case study)
- [x] Campaign: 9 missions, stars, unlocks checked by the server, Banana continue, difficulty ramp (`feature/campaign`)
- [x] Online rooms: the host picks the bot difficulty, checked on the server (`feature/api-hardening`)
- [x] Daily challenge: the attempt is kept if the API is down; answers are atomic, so a puzzle can never score twice; a run can continue after a reload (`fix/daily-and-demo`)
- [x] Banana Powers from crates, headshots for every bullet gun, battle animations (`feature/banana-powers`, `feature/headshots`, `feature/battle-animations`)
- [x] Fair online crates: the solver is protected and shown in a banana bubble; the server ends puzzles left open (`fix/online-crate-fairness`, `fix/crate-follow-ups`)
- [x] Banana Meter with server-timed GOLD/SILVER/BRONZE grades and a supply drop on X (`feature/banana-meter`)
- [x] Boot Camp tutorial, one-time tips and story clips (`feature/boot-camp`, `feature/feel-and-cutscenes`, `feature/wire-story-clips`)
- [x] Match length from 30 s to 5 minutes, a live mini leaderboard, a minimap (M) and hold/toggle scope (`feature/match-length`, `feature/minimap-scope`)
- [x] New logo, weaker bots on every difficulty, softer music in one tab only (`feature/logo-bots`, `fix/short-match-bots`, `fix/softer-music`, `fix/one-music-tab`)

## Version control (70%+ asks for branching, tagging, code reviews)
- [x] Annotated release tags `v0.1-login` … `v0.5-campaign`, then `v1.0.0` … `v1.3.2`
- [x] `CHANGELOG.md` (`docs/readme-ci`)
- [x] Pull-request template and code-review checklist in `CONTRIBUTING.md` (`docs/readme-ci`)
- [x] GitHub Actions CI: tests, build and Playwright tests on every push (`docs/readme-ci`, `fix/review-findings`, `feature/e2e-tests`)
- [x] Server and client restructured into layers on their own branches (`refactor/server-mvc`, `refactor/client-mvc`)
- [ ] Open one real GitHub pull request with a review comment and the green CI check, turn on branch protection for `main`, and publish GitHub Releases from the tags

## Event-driven programming (Week 4: retries and timeouts)
- [x] Banana API: a timeout per attempt, 2 retries with exponential backoff and jitter, only for transient errors (`feature/api-hardening`)
- [x] Circuit breaker, a deadline on `take()`, and a limit on calls in flight (`feature/api-hardening`, `fix/review-findings`)
- [x] `/api/status`: latency, success rate and circuit state, shown in Settings in plain words
- [x] Live event feed for admins over Socket.io (`feature/live-events`)
- [x] `docs/events.md`: the event catalogue (engine bus, React hooks, server events, Socket.io, timers)

## Interoperability
- [x] `docs/api.md`: REST and Socket.io protocol; `docs/resilience.md`; `docs/evaluation.md` (alternatives and limits)
- [x] OpenAPI 3 at `/api/v1/openapi.json`, Swagger UI at `/api/docs`, `/api/v1` with old paths kept, public CORS leaderboard (`feature/openapi-v1`)
- [x] Puzzle reserve saved in MongoDB, so it survives a restart

## Virtual identity
- [x] Remember me (30 days), log out of all devices (also drops live sockets), change password, delete account (GDPR) (`feature/identity-plus`)
- [x] Live check that a username is free (rate-limited), and the session count on the Profile
- [x] Admin screen; the role is read from the database on every request (a demoted admin loses access at once)
- [x] Forgot/reset password (single-use link, 30 min) and login limits per name+IP and per IP with an atomic counter (`feature/password-reset-ip-limit`)
- [x] Have I Been Pwned check (`feature/pwned-passwords`) and guest play that can be saved (`feature/guest-play`)
- [x] Signed-in devices (sign out one) and download my data (`feature/sessions-export`)
- [x] Audit log, suspend/restore with a reason, Banana API health charts (`feature/admin-audit`)

## Polish
- [x] Procedural menu and battle music, with music and effects volume and a mute (`feature/polish`)
- [x] Puzzle timer colours, a chime when right, a buzzer and shake when wrong
- [x] Fullscreen button and a rotate-to-landscape hint on phones; installable PWA (`feature/pwa`)
- [x] Accessibility: high contrast, large text, reduced motion
- [x] Public home page, Privacy, Terms, 404 and server-down screens (`feature/public-pages`)
- [x] UI audit of every screen at desktop and phone sizes (`fix/ui-audit`, `fix/ui-audit-remaining`)

## Documentation and submission
- [x] README (setup, architecture, features, four-theme map, credits section)
- [x] `docs/architecture.md`, `docs/IDEAS.md`, `docs/VIDEO-GUIDE.md` (facts and file:line pointers only; the narration is my own)
- [x] `npm run demo` runs without installing MongoDB (in-memory), a safety net for the tutor demo (`fix/daily-and-demo`)
- [x] `npm run package` creates the source zip for the separate code submission
- [ ] Rehearse `npm run demo` and a run with a broken `BANANA_API_URL` on the laptop used for the Week 8 demo
- [ ] Confirm the date of the Week 8 tutor demo and keep the evidence of it
- [ ] Record the video in my own voice (use `docs/VIDEO-GUIDE.md` to find the code), then tag the submitted version

## Maybe later
- [ ] Docker Compose, a free deployment (Render / Fly.io), two-factor login (TOTP), friends list

## Known limits (explained in `docs/evaluation.md`)
- Login limits depend on IP addresses (botnets, shared NAT).
- Single-player kills are reported by the browser (online matches are server-authoritative).
- Daily puzzles are the same for everyone, so answers could be shared.
- A daily run that crosses midnight UTC cannot be finished.
