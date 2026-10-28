# Incomplete tasks: audit against the CIS046-3 brief

Audit date: 28 Oct 2026. Source of truth: `../ASSIGNMENT-SUMMARY.md`, which summarises the brief, the Student Guide and the grade bands.
Status key: [ ] open · [~] in progress · [x] done (with branch/commit).

Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

## Game (case study)
- [x] Campaign: 9 missions, stars, unlocks checked by the server, Banana continue, difficulty ramp (`feature/campaign`, merged)
- [ ] Online rooms: the host picks the bot difficulty (currently always Medium)

## Version control (70%+ asks for branching, **tagging**, **code reviews**)
- [ ] Release tags for each milestone, and `v1.0.0`
- [ ] `CHANGELOG.md`
- [ ] Pull-request template and a code-review checklist (`CONTRIBUTING.md`)
- [ ] GitHub Actions CI: tests and build on every push

## Event-driven programming (Week 4: retries and timeouts)
- [ ] Banana API: timeout with AbortController, retry with backoff, cache-buster
- [ ] `/api/status`: latency and success rate, shown in Settings
- [ ] `docs/events.md`: every event, who emits it, who handles it (engine bus, React hooks, server EventEmitter, Socket.io)

## Interoperability
- [ ] `docs/api.md`: REST endpoints and the Socket.io protocol table
- [ ] Notes on the evaluation: JSON+base64 vs CSV vs image URL; server proxy vs browser fetch; Socket.io vs polling

## Virtual identity
- [ ] "Remember me" (30-day session cookie)
- [ ] Log out of all devices (deletes every session of the user in the MongoDB store)
- [ ] Change password (needs the current one) and delete my account and data (GDPR)
- [ ] Live username availability check on register
- [ ] Admin screen (authorisation demo: roles checked on the server)
- [ ] Profile: member since, last login, active sessions

## Polish
- [ ] Procedural music, with music and effects volume
- [ ] Puzzle timer changes colour (safe/warning/danger); buzzer and shake on a wrong answer
- [ ] Mobile: rotate-to-landscape prompt, fullscreen button
- [ ] Accessibility: high contrast, large text, reduced motion

## Documentation and submission
- [ ] README rewrite (it still says "UI only"): setup (MongoDB, Vite), architecture, features, 4-theme map, **AI credits section**
- [ ] `docs/architecture.md`, `docs/IDEAS.md`
- [ ] `docs/VIDEO-GUIDE.md`: file:line pointers for SHOW/LOCATE (facts only; Sayub records in his own voice)
- [ ] Week 8 Progress Form answers drafted as a local .docx (`../04 Assessment and Feedback/My plans/`)
- [ ] Research doc: add the level findings from the second round of research
- [ ] `package.json` version 1.0.0 and an updated description
