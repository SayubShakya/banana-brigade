# Events catalogue

Banana Brigade uses four kinds of events. Each one decouples the code that notices something from the code
that reacts to it.

| Layer | Mechanism | Defined in |
|---|---|---|
| Browser game and UI | Publish/subscribe event bus (observer pattern): `on`, `off`, `emit` | `client/src/eventBus.js:9-28` |
| React components | `useBus(name, handler)` subscribes on mount and unsubscribes on unmount | `client/src/hooks.js:11-15` |
| Server | Node `EventEmitter` plus a list of achievement rules | `server/achievements.js:36-94` |
| Network | Socket.io messages (and their acknowledgement callbacks) | `server/realtime/rooms.js:137-250`, `client/src/net/socket.js` |

Below these sit the platform's own events: DOM events (`keydown`, `mousedown`, `pointerdown`, `click`),
`requestAnimationFrame` (the browser game loop), and `setInterval` / `setTimeout` (the server's 30 Hz match tick,
puzzle countdowns, delays before results). The bus catches errors per listener, so one broken listener does not
stop the others (`eventBus.js:20-26`).

In the tables, `world.js:195` means file and line. "(bus)" means the browser event bus.

## Input events (bus)

`client/src/game/input.js` turns DOM events into game events, so the rest of the game does not care whether
a key, the mouse or a touch button was used.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `input:pause` | `input.js:63` (Esc), `input.js:94` (button) | `GameSession.js:122`, `NetGame.js:140` | none |
| `input:banana` | `input.js:67` (B key) | `GameSession.js:94`, `NetGame.js:136` | none |
| `input:scoreboard` | `input.js:65`, `input.js:72` (Tab down/up) | `hud.js:78` | `{ show }` |
| `input:zoom` | `input.js:60` (Z, wheel, button) | `hud.js:77` | `{ level }` |

Held keys (move, jet, fire) are not events: the game loop reads them each step with `input.apply()`.

## Engine events (bus in the browser; per-room `emit` on the server)

`client/src/game/world.js` never touches the screen. It calls `world.emit(...)`. In the browser that is the bus
(`world.js:68`, default `emit = busEmit`). On the server, `match.js:52-67` passes its own `emit`, which turns
some events into snapshot events or puzzle offers.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `match:started` | `world.js:119` | (none yet) | `{ soldiers, mode }` |
| `soldier:damaged` | `world.js:168` | `hud.js:56` (hurt flash), `sound.js:92`; server `match.js:55` | `{ victim, attacker, amount }` |
| `soldier:killed` | `world.js:195` | `hud.js:50` (kill feed), `sound.js:96`; server `match.js:54` | `{ victim, killer, weapon }` |
| `soldier:respawned` | `world.js:156` | `hud.js:76`; server `match.js:56` | `{ soldier }` |
| `player:down` | `world.js:197` (Survival) | `GameSession.js:96` (opens the revive puzzle) | `{ wave }` |
| `player:out` | `world.js:178` (Campaign, no lives) | `GameSession.js:99` (opens the continue puzzle) | `{ continues }` |
| `weapon:fired` | `world.js:285` | `sound.js:74`; server `match.js:58` | `{ soldier, weapon, x, y }` |
| `weapon:reloading` / `weapon:reloaded` / `weapon:empty` | `world.js:294`, `:304`, `:423` | `sound.js:84-86`; server `match.js:59` | `{ soldier, weapon }` |
| `weapon:switched` | `world.js:410`, `:422` | (none yet) | `{ soldier, weapon }` |
| `grenade:thrown` | `world.js:317` | `sound.js:99` | `{ soldier }` |
| `grenade:bounce` | `world.js:526` | (none yet) | `{}` |
| `melee:swing` | `world.js:323` | `sound.js:100` | `{ soldier }` |
| `explosion` | `world.js:249` | `sound.js:79`; server `match.js:61` | `{ x, y, radius }` |
| `pickup:available` | `world.js:435`, `:440`; `NetGame.js:237` | `hud.js:62` (prompt); server `match.js:62` | `{ weapon }` or `{ banana: true }` |
| `pickup:taken` | `world.js:229`, `:346` | `hud.js:67`, `sound.js:87`; server `match.js:57` | `{ soldier, kind, weapon }` |
| `banana:crate` | `world.js:434` (E at a crate) | `GameSession.js:110` (crate puzzle); server `match.js:63` (sends `puzzle:offer`) | `{ pickup, soldier }` |
| `survival:wave` | `world.js:136` | `hud.js:73` | `{ wave, count }` |
| `survival:cleared` | `world.js:576` | `hud.js:74` | `{ wave }` |
| `campaign:ramp` | `world.js:569` | `hud.js:75` | `{ level }` |
| `match:ended` | `world.js:245` | `GameSession.js:128` (emits `game:over` after 1.5 s); server `match.js:64` (`finish`) | `{ reason, ranking, player, mode, wave, teamKills, mission, continues }` |

## Session and UI events (bus)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `game:state` | `GameSession.js:60`; `NetGame.js:75`, `:103`, `:143`, `:253` | `App.jsx:75` (switches screen) | `{ state: 'playing'\|'puzzle'\|'paused'\|'over'\|'idle', online? }` |
| `game:over` | `GameSession.js:134`; `NetGame.js:104` | `App.jsx:80` (results screen) | `{ result, outcome, session, difficulty, mission, durationS, online? }` |
| `banana:requested` | `PuzzleModal.jsx:63` | (none yet) | `{ purpose }` |
| `banana:loaded` | `PuzzleModal.jsx:77` | (none yet) | `{ purpose }` |
| `banana:error` | `PuzzleModal.jsx:83` | (none yet) | `{ purpose, message }` |
| `banana:answered` | `PuzzleModal.jsx:101`; `Daily.jsx:47` | `GameSession.js:63` (battle stats), `NetGame.js:117`, `storage.js:16` (lifetime record) | `{ purpose, correct, timedOut? }` |
| `achievement:unlocked` | `api.js:17` (from any HTTP reply); `net/socket.js:14` (from the socket) | `Toasts.jsx:12` (pop-up) | `{ id, name, text }` |

`game:state` and `game:over` are the contract between the engine and React. Local games (`GameSession`) and
online games (`NetGame`) emit the same two events, so `App.jsx` treats both the same way.

Events marked "(none yet)" are announced but nobody listens. They cost almost nothing and are ready for
features such as weapon-switch sounds or puzzle analytics.

## Server events (`server/achievements.js`)

Routes call `achievements.emit(name, userId, data)`. It emits on a Node `EventEmitter` (`achievements.js:82`),
runs every rule registered for that name, writes new badges once (`db.unlockAchievement`) and then emits
`achievement:unlocked` (`achievements.js:90`). It returns the new badges so the HTTP reply or the socket can
tell the player.

| Event | Emitted by | Rules (handlers) | Payload |
|---|---|---|---|
| `puzzle:answered` | `app.js:104`, `routes/daily.js:85`, `realtime/rooms.js:238` | `achievements.js:55` (Banana Brain, Speed Demon, Clutch, Crate Collector) | `{ correct, solution, purpose, ms }` |
| `score:saved` | `routes/scores.js:40`, `realtime/rooms.js:101` | `achievements.js:41` (First Blood, Sharpshooter, Survivor, Online Victor, Hard as Nails, Veteran …) | the saved score |
| `mission:finished` | `routes/campaign.js:52` | `achievements.js:66` (Three Stars, Campaign Hero) | `{ mission, stars }` |
| `daily:finished` | `routes/daily.js:95` | `achievements.js:73` (Daily Warrior, Perfect Day) | `{ streak, solved, total }` |
| `achievement:unlocked` | `achievements.js:90` | the reply's `unlocked` list; `rooms.js:45` pushes it over the socket | `userId, { id, name, text }` |

## Socket.io messages

Full payloads are in [api.md](api.md#socketio-protocol-serverrealtimeroomsjs).

| Message | Direction | Sent at | Handled at |
|---|---|---|---|
| `rooms:list`, `room:create`, `room:join`, `room:start` (ack) | browser → server | `Lobby.jsx:22`, `:46-48` | `rooms.js:154`, `:156`, `:172`, `:197` |
| `room:leave`, `room:ready` | browser → server | `Lobby.jsx:49`, `:111`; `App.jsx:122` | `rooms.js:188`, `:190` |
| `input` | browser → server | `NetGame.js:222` | `rooms.js:207` → `match.js:90` |
| `puzzle:get`, `puzzle:answer` (ack) | browser → server | `NetGame.js` via `request()` | `rooms.js:213`, `:229` |
| `puzzle:cancel` | browser → server | `NetGame.js:114` | `rooms.js:242` |
| `disconnect` | built in | socket closes | `rooms.js:247` (a bot takes over) |
| `room:update`, `rooms:changed` | server → browser | `rooms.js:59`, `:60` | `Lobby.jsx:31`, `:30` |
| `match:start` | server → browser | `rooms.js:129`, `:149` | `NetGame.js:54` |
| `match:snapshot` | server → browser | `match.js:116` (every tick) | `NetGame.js:78` |
| `match:end` | server → browser | `match.js:156` | `NetGame.js:87` |
| `puzzle:offer` | server → browser | `match.js:87` | `NetGame.js:111` |
| `achievement:unlocked` | server → browser | `rooms.js:45` | `net/socket.js:14` (re-emitted on the bus) |

## Time-based events

| Timer | Where | What it does |
|---|---|---|
| `requestAnimationFrame` | `GameSession.js:188-215`, `NetGame.js` frame loop | Browser game loop; fixed 1/60 s steps with catch-up (at most 5 per frame) |
| `setInterval(1000/30)` | `match.js:129-131` | Server match tick; one snapshot per tick |
| `setImmediate` | `match.js:154` | Finishes the match on the next turn of the event loop, outside the world update |
| `setTimeout` | `GameSession.js:96`, `:99`, `:128` | Short delays before the revive puzzle, the continue puzzle and the results |
| Puzzle countdown | `PuzzleModal.jsx:126-` | Running out of time counts as a wrong answer |
| `AbortSignal.timeout` | `bananaApi.js:74` | Cancels a Banana API request after 5 s |
| `timeout(8000)` | `net/socket.js:28-29` | A socket request without a reply in 8 s fails |
| MongoDB TTL | `models.js:55` | The database deletes failed logins after 10 minutes |

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
