# Incomplete tasks: audit against the CIS046-3 brief

Audit date: 28 Oct 2026. Source of truth: `../../ASSIGNMENT-SUMMARY.md`, which summarises the brief, the Student Guide and the grade bands.
Status key: [ ] open · [x] done (with branch). All branches are merged into `main` with `--no-ff`.

Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

## Game (case study)
- [x] Campaign: 9 missions, stars, unlocks checked by the server, Banana continue, difficulty ramp (`feature/campaign`)
- [x] Online rooms: the host picks the bot difficulty, checked on the server (`feature/api-hardening`)
- [x] Daily challenge: the attempt is kept if the API is down; answers are atomic, so a puzzle can never score twice; a run can continue after a reload (`fix/daily-and-demo`)

## Version control (70%+ asks for branching, tagging, code reviews)
- [x] Annotated release tags `v0.1-login` … `v0.5-campaign`, plus `v1.0.0` at the end
- [x] `CHANGELOG.md` (`docs/readme-ci`)
- [x] Pull-request template and code-review checklist in `CONTRIBUTING.md` (`docs/readme-ci`)
- [x] GitHub Actions CI: tests and build on every push, green on GitHub (`docs/readme-ci`, `fix/review-findings`)
- [ ] **For Sayub:** open one real GitHub pull request from your own account, with a review comment and the green CI check, and turn on branch protection for `main`. This gives you code-review evidence to SHOW. (`gh` on this Mac is logged in as another account, so this was not done for you.)

## Event-driven programming (Week 4: retries and timeouts)
- [x] Banana API: a timeout per attempt, 2 retries with exponential backoff and jitter, only for transient errors (`feature/api-hardening`)
- [x] Circuit breaker, a deadline on `take()`, and a limit on calls in flight (`feature/api-hardening`, `fix/review-findings`)
- [x] `/api/status`: latency, success rate and circuit state, shown in Settings in plain words
- [x] `docs/events.md`: the event catalogue (engine bus, React hooks, server events, Socket.io)

## Interoperability
- [x] `docs/api.md`: REST and Socket.io protocol; `docs/resilience.md`; `docs/evaluation.md` (alternatives and limits)

## Virtual identity
- [x] Remember me (30 days), log out of all devices (MongoDB session store, also drops live sockets; checked by hand against the real store), change password, delete account (GDPR) (`feature/identity-plus`)
- [x] Live check that a username is free (rate-limited), and the session count on the Profile
- [x] Admin screen; the role is read from the database on every request (a demoted admin loses access at once)

## Polish
- [x] Procedural menu and battle music, with music and effects volume and a mute (`feature/polish`)
- [x] Puzzle timer colours, a chime when right, a buzzer and shake when wrong
- [x] Fullscreen button and a rotate-to-landscape hint on phones
- [x] Accessibility: high contrast, large text, reduced motion
- [x] Settings split into tabs: Game / Sound / Accessibility / Account

## Documentation and submission
- [x] README rewritten (setup, architecture, features, four-theme map, **credits section**) (`docs/readme-ci`)
- [x] `docs/architecture.md`, `docs/IDEAS.md`, `docs/VIDEO-GUIDE.md` (facts and file:line pointers; the narration must be Sayub's own)
- [x] `npm run demo` runs without installing MongoDB (in-memory), a safety net for the tutor demo (`fix/daily-and-demo`)
- [x] `npm run package` creates the source zip for the separate code submission
- [x] Week 8 Progress Form: draft answers in `../../04 Assessment and Feedback/My plans/Week8-Progress-Form-DRAFT-answers.docx` (**rewrite in your own words before printing**)
- [x] Research doc updated with the level findings
- [x] `package.json` version 1.0.0

## Round 1.3.0 (29 Oct 2026, from Sayub's list of 10)
- [x] 1. Forgot/reset password (single-use link, 30 min, console in dev) and per-IP login limits with an atomic counter (`feature/password-reset-ip-limit`)
- [x] 2. Public home page, Privacy, Terms, 404 and server-down screens (`feature/public-pages`)
- [x] 3. Have I Been Pwned check with k-anonymity (`feature/pwned-passwords`) and guest play that can be saved (`feature/guest-play`)
- [x] 4. Event-driven: live event viewer for admins over Socket.io (`feature/live-events`); match replay was not built (battle events happen in the browser engine)
- [x] 5. OpenAPI 3 at `/api/v1/openapi.json`, Swagger UI at `/api/docs`, `/api/v1` with old paths kept, public CORS leaderboard (`feature/openapi-v1`)
- [x] 6. Where you're signed in (sign out one device) and download my data (`feature/sessions-export`)
- [x] 7. Audit log, suspend/restore with a reason, Banana API health charts (`feature/admin-audit`)
- [x] 8. Playwright end-to-end tests in CI (`feature/e2e-tests`); loading skeletons and error toasts (`feature/loading-states`)
- [x] 9. Installable PWA that opens offline (`feature/pwa`)
- [ ] 10. **For Sayub:** branch protection, one real pull request with a review comment and green CI, GitHub Releases from the tags. Exact steps: `../../GITHUB-STEPS.md`.
- [x] UI audit of every screen at desktop and phone sizes, about 45 fixes (`fix/ui-audit`, `fix/ui-audit-remaining`, 1.3.1–1.3.2)
- [x] Tidy folder structure: client lib/, hooks/, components/; server config/, models/, services/; tests unit/integration/e2e; `docs/openapi.yaml` (`chore/folder-structure`)
- [ ] Optional if time: Docker Compose, free deployment (Render / Fly.io), two-factor login (TOTP), first-run tutorial, friends list.

## Known limits (said honestly in `docs/evaluation.md`)
- ~~Login lockout is per username and racy~~: fixed on `feature/password-reset-ip-limit` (per-IP limits, atomic counter). New limit: login limits depend on IP addresses (botnets, shared NAT).
- Single-player kills are reported by the browser (online matches are server-authoritative).
- Daily puzzles are the same for everyone, so answers could be shared.
- A daily run that crosses midnight UTC cannot be finished.

## Still for Sayub (cannot be done by code)
- [ ] Rehearse `npm run demo` and a broken `BANANA_API_URL` run on the laptop you will use at the Week 8 demo.
- [ ] Check the demo date: CLAUDE.md says around 2 Nov, ASSIGNMENT-SUMMARY says Thu 12 Nov 2026.
- [ ] Record the video in your own voice (use `docs/VIDEO-GUIDE.md` to find the code).
