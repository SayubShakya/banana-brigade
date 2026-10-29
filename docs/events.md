# Events catalogue

Banana Brigade uses four kinds of events. Each one decouples the code that notices something from the code
that reacts to it.

| Layer | Mechanism | Defined in |
|---|---|---|
| Browser game and UI | Publish/subscribe event bus (observer pattern): `on`, `off`, `emit` | `client/src/eventBus.js:9-28` |
| React components | `useBus(name, handler)` subscribes on mount and unsubscribes on unmount | `client/src/hooks.js:11-15` |
| Server | Node `EventEmitter` plus a list of achievement rules | `server/achievements.js:36-94` |
| Network | Socket.io messages (and their acknowledgement callbacks) | `server/realtime/rooms.js:140-257`, `client/src/net/socket.js` |

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
| `input:pause` | `input.js:63` (Esc), `input.js:94` (button) | `GameSession.js:123`, `NetGame.js:140` | none |
| `input:banana` | `input.js:67` (B key) | `GameSession.js:95`, `NetGame.js:136` | none |
| `input:scoreboard` | `input.js:65`, `input.js:72` (Tab down/up) | `hud.js:78` | `{ show }` |
| `input:zoom` | `input.js:60` (Z, wheel, button) | `hud.js:77` | `{ level }` |

Held keys (move, jet, fire) are not events: the game loop reads them each step with `input.apply()`.

## Engine events (bus in the browser; per-room `emit` on the server)

`client/src/game/world.js` never touches the screen. It calls `world.emit(...)`. In the browser that is the bus
(`world.js:68`, default `emit = busEmit`). On the server, `match.js:53-66` passes its own `emit`, which turns
some events into snapshot events or puzzle offers.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `match:started` | `world.js:119` | (none yet) | `{ soldiers, mode }` |
| `soldier:damaged` | `world.js:168` | `hud.js:56` (hurt flash), `sound.js:119`; server `match.js:56` | `{ victim, attacker, amount }` |
| `soldier:killed` | `world.js:195` | `hud.js:50` (kill feed), `sound.js:123`; server `match.js:55` | `{ victim, killer, weapon }` |
| `soldier:respawned` | `world.js:156` | `hud.js:76`; server `match.js:57` | `{ soldier }` |
| `player:down` | `world.js:197` (Survival) | `GameSession.js:97` (opens the revive puzzle) | `{ wave }` |
| `player:out` | `world.js:178` (Campaign, no lives) | `GameSession.js:100` (opens the continue puzzle) | `{ continues }` |
| `weapon:fired` | `world.js:285` | `sound.js:101`; server `match.js:59` | `{ soldier, weapon, x, y }` |
| `weapon:reloading` / `weapon:reloaded` / `weapon:empty` | `world.js:294`, `:304`, `:423` | `sound.js:111-113`; server `match.js:60` | `{ soldier, weapon }` |
| `weapon:switched` | `world.js:410`, `:422` | (none yet) | `{ soldier, weapon }` |
| `grenade:thrown` | `world.js:317` | `sound.js:126` | `{ soldier }` |
| `grenade:bounce` | `world.js:526` | (none yet) | `{}` |
| `melee:swing` | `world.js:323` | `sound.js:127` | `{ soldier }` |
| `explosion` | `world.js:249` | `sound.js:106`; server `match.js:62` | `{ x, y, radius }` |
| `pickup:available` | `world.js:435`, `:440`; `NetGame.js:237` | `hud.js:62` (prompt); server `match.js:63` | `{ weapon }` or `{ banana: true }` |
| `pickup:taken` | `world.js:229`, `:346` | `hud.js:67`, `sound.js:114`; server `match.js:58` | `{ soldier, kind, weapon }` |
| `banana:crate` | `world.js:434` (E at a crate) | `GameSession.js:111` (crate puzzle); server `match.js:64` (sends `puzzle:offer`) | `{ pickup, soldier }` |
| `survival:wave` | `world.js:136` | `hud.js:73` | `{ wave, count }` |
| `survival:cleared` | `world.js:576` | `hud.js:74` | `{ wave }` |
| `campaign:ramp` | `world.js:569` | `hud.js:75` | `{ level }` |
| `match:ended` | `world.js:245` | `GameSession.js:129` (emits `game:over` after 1.5 s); server `match.js:65` (`finish`) | `{ reason, ranking, player, mode, wave, teamKills, mission, continues }` |

## Session and UI events (bus)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `game:state` | `GameSession.js:61`; `NetGame.js:75`, `:103`, `:143`, `:253` | `App.jsx:95` (switches screen), `music.js:133` (crossfades to battle or menu music) | `{ state: 'playing'\|'puzzle'\|'paused'\|'over'\|'idle', online? }` |
| `game:over` | `GameSession.js:135`; `NetGame.js:104` | `App.jsx:100` (results screen) | `{ result, outcome, session, difficulty, mission, durationS, online? }` |
| `banana:requested` | `PuzzleModal.jsx:63` | (none yet) | `{ purpose }` |
| `banana:loaded` | `PuzzleModal.jsx:77` | (none yet) | `{ purpose }` |
| `banana:error` | `PuzzleModal.jsx:83` | (none yet) | `{ purpose, message }` |
| `banana:answered` | `PuzzleModal.jsx:101`; `Daily.jsx:53` | `GameSession.js:64` (battle stats), `NetGame.js:117`, `storage.js:16` (lifetime record), `sound.js:100` (chime or buzzer) | `{ purpose, correct, timedOut? }` |
| `achievement:unlocked` | `api.js:17` (from any HTTP reply); `net/socket.js:14` (from the socket) | `Toasts.jsx:12` (pop-up) | `{ id, name, text }` |

`game:state` and `game:over` are the contract between the engine and React. Local games (`GameSession`) and
online games (`NetGame`) emit the same two events, so `App.jsx` treats both the same way.

`game:state` now has two kinds of listener: `App.jsx` changes the screen, and `music.js:133-136` switches to the
battle loop for `playing`, `puzzle` and `paused`, and back to the menu loop otherwise, with a 1.2 s crossfade.
Neither knows about the other. Music only starts after the first click or key press (`music.js:138-145`),
because browsers block sound until the player does something.

Settings changes are not bus events: React state is passed to `GameSession.applySettings()` (volumes, mute) and
to classes on `<body>` (`a11y-contrast`, `a11y-large`, `a11y-calm`, set in `App.jsx`).

Events marked "(none yet)" are announced but nobody listens. They cost almost nothing and are ready for
features such as weapon-switch sounds or puzzle analytics.

## Server events (`server/achievements.js`)

Routes call `achievements.emit(name, userId, data)`. It emits on a Node `EventEmitter` (`achievements.js:82`),
runs every rule registered for that name, writes new badges once (`db.unlockAchievement`) and then emits
`achievement:unlocked` (`achievements.js:90`). It returns the new badges so the HTTP reply or the socket can
tell the player.

| Event | Emitted by | Rules (handlers) | Payload |
|---|---|---|---|
| `puzzle:answered` | `app.js:105`, `routes/daily.js:92`, `realtime/rooms.js:245` | `achievements.js:55` (Banana Brain, Speed Demon, Clutch, Crate Collector) | `{ correct, solution, purpose, ms }` |
| `score:saved` | `routes/scores.js:40`, `realtime/rooms.js:103` | `achievements.js:41` (First Blood, Sharpshooter, Survivor, Online Victor, Hard as Nails, Veteran …) | the saved score |
| `mission:finished` | `routes/campaign.js:52` | `achievements.js:66` (Three Stars, Campaign Hero) | `{ mission, stars }` |
| `daily:finished` | `routes/daily.js:101` | `achievements.js:73` (Daily Warrior, Perfect Day) | `{ streak, solved, total }` |
| `achievement:unlocked` | `achievements.js:90` | the reply's `unlocked` list; `rooms.js:47` pushes it over the socket | `userId, { id, name, text }` |

## Socket.io messages

Full payloads are in [api.md](api.md#socketio-protocol-serverrealtimeroomsjs).

| Message | Direction | Sent at | Handled at |
|---|---|---|---|
| `rooms:list`, `room:create`, `room:join`, `room:start` (ack) | browser → server | `Lobby.jsx:26`, `:50-52` | `rooms.js:157`, `:159`, `:179`, `:204` |
| `room:leave`, `room:ready` | browser → server | `Lobby.jsx:53`, `:120`; `App.jsx:142` | `rooms.js:195`, `:197` |
| `input` | browser → server | `NetGame.js:222` | `rooms.js:214` → `match.js:91` |
| `puzzle:get`, `puzzle:answer` (ack) | browser → server | `NetGame.js` via `request()` | `rooms.js:220`, `:236` |
| `puzzle:cancel` | browser → server | `NetGame.js:114` | `rooms.js:249` |
| `disconnect` | built in | socket closes | `rooms.js:254` (a bot takes over) |
| `room:update`, `rooms:changed` | server → browser | `rooms.js:61`, `:62` | `Lobby.jsx:35`, `:34` |
| `match:start` | server → browser | `rooms.js:132`, `:152` | `NetGame.js:54` |
| `match:snapshot` | server → browser | `match.js:117` (every tick) | `NetGame.js:78` |
| `match:end` | server → browser | `match.js:157` | `NetGame.js:87` |
| `puzzle:offer` | server → browser | `match.js:88` | `NetGame.js:111` |
| `achievement:unlocked` | server → browser | `rooms.js:47` | `net/socket.js:14` (re-emitted on the bus) |
| forced disconnect | server → browser | `sessions.js:37-41` (log out everywhere, password change, account deleted) | `Lobby.jsx:32` (`disconnect`) |

## Time-based events

| Timer | Where | What it does |
|---|---|---|
| `requestAnimationFrame` | `GameSession.js:193-220`, `NetGame.js:229-245` | Browser game loop; fixed 1/60 s steps with catch-up (at most 5 per frame) |
| `setInterval(1000/30)` | `match.js:130-132` | Server match tick; one snapshot per tick |
| `setImmediate` | `match.js:155` | Finishes the match on the next turn of the event loop, outside the world update |
| `setTimeout` | `GameSession.js:97`, `:100`, `:129` | Short delays before the revive puzzle, the continue puzzle and the results |
| Puzzle countdown | `PuzzleModal.jsx:125-134` (`setInterval` every 200 ms) | Running out of time counts as a wrong answer; the ring turns orange, then red |
| `AbortController` + `setTimeout` | `bananaApi.js:115-117` | Cancels a Banana API request after 5 s, body included |
| Backoff `sleep` | `bananaApi.js:145-150` | Waits 300 ms, then 900 ms (plus jitter) before a retry |
| `take()` deadline | `pool.js:147-148` | After 2.5 s a waiting player gets a reserve puzzle |
| Circuit cool-down | `pool.js:65`, `:68-73` | 30 s with no live calls after 3 failures in a row, then one probe |
| Music scheduler | `music.js:117` (`setInterval` every 25 ms) | Schedules notes 0.12 s ahead on the audio clock |
| `timeout(8000)` | `net/socket.js:28-29` | A socket request without a reply in 8 s fails |
| MongoDB TTL | `models.js:55` | The database deletes failed logins after 10 minutes |

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._

## Banana Powers (added in 1.2.0)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `power:start` | `client/src/game/world.js` `rewardBananaCrate` | `hud.js` (toast), `sound.js` (fanfare) | `{ soldier, power, seconds, random }` |
| `power:warning` | `world.js` `updatePower` (2 s left) | `hud.js`, `sound.js` | `{ soldier, power }` |
| `power:end` | `world.js` `updatePower` / `damage` (on death) | `hud.js`, `sound.js` | `{ soldier, power }` |
| `power:offer` (Socket.io, server → player) | `server/realtime/match.js` `applyPuzzle` | `client/src/net/NetGame.js` → `PowerPicker.jsx` | `{ choices, seconds }` |
| `power:choose` (Socket.io, player → server, ack) | `NetGame.js` | `server/realtime/rooms.js` → `match.choosePower` | `{ power }` → `{ power }` |

Online, `power:start/warning/end` travel inside snapshots as `fx` events and are re-emitted on the browser's bus.

## Live event feed for admins (added on `feature/live-events`)

`server/eventLog.js` is a Node `EventEmitter` hub with a ring buffer of the last 100 events
(`{ id, kind, at, user, text }`). Code that does something worth watching calls `eventLog.record(kind, user, text)`;
it does not know who is listening (observer pattern).

| Event kind | Recorded by | Example |
|---|---|---|
| `auth` | `server/routes/auth.js` (register, login, logout, guest, upgrade) | "sayub logged in" |
| `security` | `auth.js` (wrong password, blocked, reset asked, password reset) | "sayub typed a wrong password" |
| `puzzle`, `score`, `campaign`, `daily`, `power`, `achievement` | `eventLog.watchAchievements` listens to the achievement engine's `EventEmitter` | "sayub solved a respawn puzzle" |
| `kill` | `server/realtime/match.js` `onKill` → `rooms.js` (only kills involving a real player) | "sayub killed Rex (Sniper) in room KQ7P2D" |
| `admin` | `server/routes/admin.js` (audit log, see below) | "boss suspended cheater: aimbot" |

Delivery: `server/realtime/socket.js` subscribes once with `eventLog.onEvent` and emits every event to the
Socket.io room `admins` as `server:event`. An admin joins that room with `events:watch` (the role is read from the
database at that moment; players get `{ error: 'Admins only' }`) and receives the recent list in the
acknowledgement. `client/src/screens/LiveEvents.jsx` listens for `server:event`, with a filter and pause.

Why push (WebSocket) rather than poll: events appear at once and the server sends nothing when nobody is
watching. Polling `/api/admin/events` every few seconds would be simpler (plain HTTP, easy to cache) but is
always late and costs a request per admin per interval. The ring buffer is in memory, so the feed starts empty
after a restart; the audit log (MongoDB) is the permanent record.
