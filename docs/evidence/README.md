# Evidence: screenshots and test results

Supporting material sent with the code (unit FAQ Q7: "screenshots; design documents; test results"). No report is
required, and this folder is not marked directly; it helps the marker check the video against the running code.
Screenshots were taken on 22 Nov 2026 from a throw-away copy of the game (its own database, deleted afterwards).

| Screenshot | What it shows | Theme |
|---|---|---|
| [01-home](screenshots/01-home.jpg) | Home page: trailer, "Banana API online", how the puzzles work | Interoperability |
| [02-player-login](screenshots/02-player-login.jpg) | Player login: password, remember me, guest, admin link | Virtual identity |
| [03-admin-login](screenshots/03-admin-login.jpg) | Separate admin login (players are refused, no session) | Virtual identity (roles) |
| [04-admin-dashboard](screenshots/04-admin-dashboard.jpg) | Admin dashboard: players, audit log, API health, live events | Virtual identity (roles) |
| [05-banana-puzzle](screenshots/05-banana-puzzle.jpg) | A live Banana API puzzle: the deploy screen with the 0-9 keypad | Interoperability, event-driven |
| [06-battle-hud-minimap](screenshots/06-battle-hud-minimap.jpg) | Battle: HUD, minimap, live scoreboard, kill feed | Event-driven |
| [07-results](screenshots/07-results.jpg) | Results: puzzles solved, Banana report, scoreboard | Event-driven |
| [08-battle-log](screenshots/08-battle-log.jpg) | Battle log timeline built from game events | Event-driven |
| [09-match-history](screenshots/09-match-history.jpg) | Match history saved on the server per user | Virtual identity |
| [10-swagger-api-docs](screenshots/10-swagger-api-docs.jpg) | My own REST API documented with OpenAPI/Swagger (`/api/docs`) | Interoperability |

Test results: [test-results.md](test-results.md).
Design documents: [architecture](../architecture.md), [events](../events.md), [API](../api.md),
[resilience](../resilience.md), [evaluation](../evaluation.md).

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
