# Test results

Run on **22 Nov 2026** on branch `docs/faq-alignment` (commit `1ee530f`, built on `release/v1.4.0`), macOS, Node 24.
Supporting material for the code submission (unit FAQ Q7). It is not marked directly.

## Unit and API tests: `npm test` (node:test)

```
ℹ tests 234
ℹ pass 234
ℹ fail 0
ℹ duration_ms 28506
```

| Area | Test files | Theme |
|---|---|---|
| Game engine | `tests/unit/`: gameplay, autofire, banana-meter, battle-log, bootcamp, bot-difficulty, maps, match-*, minimap, powers, puzzle-grade, zoom-camera, config | Event-driven |
| Banana API client | `tests/unit/resilience.test.js` (timeouts, retries, bad data, circuit breaker, saved puzzles) | Interoperability |
| REST API and docs | `tests/integration/server.test.js`, `openapi.test.js`, `history.test.js`, `match-length.test.js`, `campaign.test.js`, `achievements-daily.test.js` | Interoperability |
| Online multiplayer | `tests/integration/realtime.test.js` (Socket.io rooms, server-run matches, host-only start and end) | Event-driven, interoperability |
| Identity and security | `tests/integration/auth.test.js` (bcrypt, HttpOnly cookie, lockout, **admin-only login**), `identity.test.js`, `guest.test.js`, `password-reset.test.js`, `pwned.test.js`, `sessions-export.test.js`, `admin-audit.test.js`, `events.test.js` | Virtual identity |

## End-to-end browser tests: `npx playwright test` (Chrome)

```
✓ register, log in, start Quick Play and solve the deploy puzzle
✓ unknown pages show the 404 screen with status 404
✓ a preview link opens once: Back then refresh stays on the menu
✓ the admin login page refuses a player account and links back to the player login
4 passed (10.6s)
```

## Continuous integration (GitHub Actions)

Every push and pull request runs two jobs, **test-and-build** and **e2e** (`.github/workflows/ci.yml`).
Latest runs, all **success**:

| Branch | Commit message | Result |
|---|---|---|
| `release/v1.4.0` | Write the 1.4.0 changelog and update the tag list | ✅ success (43 s) |
| `docs/banana-api-comment` | Explain where the server calls the Banana API over HTTPS | ✅ success (46 s) |
| `feature/host-end-match` | Document the room:end event | ✅ success (38 s) |

All runs: https://github.com/SayubShakya/banana-brigade/actions

## How to run them yourself

```bash
npm ci
npm test               # 234 unit and API tests (in-memory MongoDB, no internet needed)
npx playwright test    # 4 browser tests (starts its own server on port 3199)
```

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
