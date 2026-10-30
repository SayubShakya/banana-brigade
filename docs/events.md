# Events catalogue

Banana Brigade uses four kinds of events. Each one decouples the code that notices something from the code
that reacts to it.

| Layer | Mechanism | Defined in |
|---|---|---|
| Browser game and UI | Publish/subscribe event bus (observer pattern): `on`, `off`, `emit` | `client/src/services/eventBus.js:5-8` |
| React components | `useBus(name, handler)` subscribes on mount and unsubscribes on unmount | `client/src/hooks/useBus.js:6-9` |
| Server | Node `EventEmitter` plus a list of achievement rules | `server/services/achievements.js:32-95` |
| Network | Socket.io messages (and their acknowledgement callbacks) | `server/realtime/rooms.js:121-154`, `client/src/net/socket.js` |

Below these sit the platform's own events: DOM events (`keydown`, `mousedown`, `pointerdown`, `click`),
`requestAnimationFrame` (the browser game loop), and `setInterval` / `setTimeout` (the server's 30 Hz match tick,
puzzle countdowns, delays before results). The bus catches errors per listener, so one broken listener does not
stop the others (`client/src/services/eventBus.js:16-20`).

In the tables, `client/src/game/world.js:203` means file and line. "(bus)" means the browser event bus.

## Input events (bus)

`client/src/game/input.js` turns DOM events into game events, so the rest of the game does not care whether
a key, the mouse or a touch button was used.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `input:pause` | `client/src/game/input.js:53` (Esc), `client/src/game/input.js:83` (button) | `client/src/game/GameSession.js:124`, `client/src/net/NetGame.js:148` | none |
| `input:banana` | `client/src/game/input.js:57` (B key) | `client/src/game/GameSession.js:89`, `client/src/net/NetGame.js:145` | none |
| `input:scoreboard` | `client/src/game/input.js:55`, `client/src/game/input.js:62` (Tab down/up) | `client/src/game/hud.js:84` | `{ show }` |
| `input:zoom` | `client/src/game/input.js:50` (Z, wheel, button) | `client/src/game/hud.js:83` | `{ level }` |

Held keys (move, jet, fire) are not events: the game loop reads them each step with `input.apply()`.

## Engine events (bus in the browser; per-room `emit` on the server)

`client/src/game/world.js` never touches the screen. It calls `world.emit(...)`. In the browser that is the bus
(`client/src/game/world.js:67`, default `emit = busEmit`). On the server, `server/realtime/match.js:50-73` passes its own `emit`, which turns
some events into snapshot events or puzzle offers.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `match:started` | `client/src/game/world.js:117` | (none yet) | `{ soldiers, mode }` |
| `soldier:damaged` | `client/src/game/world.js:175` | `client/src/game/hud.js:54` (hurt flash), `client/src/game/sound.js:330`; server `server/realtime/match.js:56` | `{ victim, attacker, amount }` |
| `soldier:killed` | `client/src/game/world.js:203` | `client/src/game/hud.js:48` (kill feed), `client/src/game/sound.js:343`; server `server/realtime/match.js:52` | `{ victim, killer, weapon }` |
| `soldier:respawned` | `client/src/game/world.js:155` | `client/src/game/hud.js:82`; server `server/realtime/match.js:57` | `{ soldier }` |
| `player:down` | `client/src/game/world.js:205` (Survival) | `client/src/game/GameSession.js:91` (opens the revive puzzle) | `{ wave }` |
| `player:out` | `client/src/game/world.js:186` (Campaign, no lives) | `client/src/game/GameSession.js:93` (opens the continue puzzle) | `{ continues }` |
| `weapon:fired` | `client/src/game/world.js:310` | `client/src/game/sound.js:265`; server `server/realtime/match.js:62` | `{ soldier, weapon, x, y }` |
| `weapon:reloading` / `weapon:reloaded` / `weapon:empty` | `client/src/game/world.js:319`, `:304`, `:423` | `client/src/game/sound.js:296-308`; server `server/realtime/match.js:63` | `{ soldier, weapon }` |
| `weapon:switched` | `client/src/game/world.js:475`, `:422` | (none yet) | `{ soldier, weapon }` |
| `grenade:thrown` | `client/src/game/world.js:342` | `client/src/game/sound.js:288` | `{ soldier }` |
| `grenade:bounce` | `client/src/game/world.js:608` | (none yet) | `{}` |
| `melee:swing` | `client/src/game/world.js:348` | `client/src/game/sound.js:282` | `{ soldier }` |
| `explosion` | `client/src/game/world.js:271` | `client/src/game/sound.js:273`; server `server/realtime/match.js:65` | `{ x, y, radius }` |
| `pickup:available` | `client/src/game/world.js:500`, `:440`; `client/src/net/NetGame.js:242` | `client/src/game/hud.js:60` (prompt); server `server/realtime/match.js:70` | `{ weapon }` or `{ banana: true }` |
| `pickup:taken` | `client/src/game/world.js:242`, `:346` | `client/src/game/hud.js:65`, `client/src/game/sound.js:311`; server `server/realtime/match.js:61` | `{ soldier, kind, weapon }` |
| `banana:crate` | `client/src/game/world.js:499` (E at a crate) | `client/src/game/GameSession.js:104` (crate puzzle); server `server/realtime/match.js:71` (sends `puzzle:offer`) | `{ pickup, soldier }` |
| `survival:wave` | `client/src/game/world.js:134` | `client/src/game/hud.js:74` | `{ wave, count }` |
| `survival:cleared` | `client/src/game/world.js:660` | `client/src/game/hud.js:80` | `{ wave }` |
| `campaign:ramp` | `client/src/game/world.js:653` | `client/src/game/hud.js:81` | `{ level }` |
| `match:ended` | `client/src/game/world.js:267` | `client/src/game/GameSession.js:130` (emits `game:over` after 1.5 s); server `server/realtime/match.js:72` (`finish`) | `{ reason, ranking, player, mode, wave, teamKills, mission, continues }` |

## Session and UI events (bus)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `game:state` | `client/src/game/GameSession.js:55`; `client/src/net/NetGame.js:67`, `:103`, `:143`, `:253` | `client/src/controllers/useBattle.js:18` (switches screen), `client/src/game/music.js:122` (crossfades to battle or menu music) | `{ state: 'playing'\|'puzzle'\|'paused'\|'over'\|'idle', online? }` |
| `game:over` | `client/src/game/GameSession.js:136`; `client/src/net/NetGame.js:97` | `client/src/controllers/useBattle.js:23` (results screen) | `{ result, outcome, session, difficulty, mission, durationS, online? }` |
| `banana:requested` | `client/src/components/PuzzleModal.jsx:62` | (none yet) | `{ purpose }` |
| `banana:loaded` | `client/src/components/PuzzleModal.jsx:76` | (none yet) | `{ purpose }` |
| `banana:error` | `client/src/components/PuzzleModal.jsx:82` | (none yet) | `{ purpose, message }` |
| `banana:answered` | `client/src/components/PuzzleModal.jsx:99`; `client/src/views/Daily.jsx:49` | `client/src/game/GameSession.js:57` (battle stats), `client/src/net/NetGame.js:125`, `client/src/services/storage.js:12` (lifetime record), `client/src/game/sound.js:264` (chime or buzzer) | `{ purpose, correct, timedOut? }` |
| `achievement:unlocked` | `client/src/services/api.js:28` (from any HTTP reply); `client/src/net/socket.js:11` (from the socket) | `client/src/components/Toasts.jsx:14` (pop-up) | `{ id, name, text }` |

`game:state` and `game:over` are the contract between the engine and React. Local games (`GameSession`) and
online games (`NetGame`) emit the same two events, so `App.jsx` treats both the same way.

`game:state` now has two kinds of listener: `App.jsx` changes the screen, and `client/src/game/music.js:122-124` switches to the
battle loop for `playing`, `puzzle` and `paused`, and back to the menu loop otherwise, with a 1.2 s crossfade.
Neither knows about the other. Music only starts after the first click or key press (`client/src/game/music.js:126-133`),
because browsers block sound until the player does something.

Settings changes are not bus events: React state is passed to `GameSession.applySettings()` (volumes, mute) and
to classes on `<body>` (`a11y-contrast`, `a11y-large`, `a11y-calm`, set in `App.jsx`).

Events marked "(none yet)" are announced but nobody listens. They cost almost nothing and are ready for
features such as weapon-switch sounds or puzzle analytics.

## Server events (`server/services/achievements.js`)

Routes call `achievements.emit(name, userId, data)`. It emits on a Node `EventEmitter` (`server/services/achievements.js:82`),
runs every rule registered for that name, writes new badges once (`db.unlockAchievement`) and then emits
`achievement:unlocked` (`server/services/achievements.js:90`). It returns the new badges so the HTTP reply or the socket can
tell the player.

| Event | Emitted by | Rules (handlers) | Payload |
|---|---|---|---|
| `puzzle:answered` | `server/services/puzzleService.js:25`, `server/services/dailyService.js:71`, `server/realtime/rooms.js:224` | `server/services/achievements.js:51` (Banana Brain, Speed Demon, Clutch, Crate Collector) | `{ correct, solution, purpose, ms }` |
| `score:saved` | `server/services/scoreService.js:33`, `server/realtime/rooms.js:82` | `server/services/achievements.js:37` (First Blood, Sharpshooter, Survivor, Online Victor, Hard as Nails, Veteran …) | the saved score |
| `mission:finished` | `server/services/campaignService.js:35` | `server/services/achievements.js:62` (Three Stars, Campaign Hero) | `{ mission, stars }` |
| `daily:finished` | `server/services/dailyService.js:51` | `server/services/achievements.js:74` (Daily Warrior, Perfect Day) | `{ streak, solved, total }` |
| `achievement:unlocked` | `server/services/achievements.js:90` | the reply's `unlocked` list; `server/realtime/rooms.js:26` pushes it over the socket | `userId, { id, name, text }` |

## Socket.io messages

Full payloads are in [api.md](api.md#socketio-protocol-serverrealtimeroomsjs).

| Message | Direction | Sent at | Handled at |
|---|---|---|---|
| `rooms:list`, `room:create`, `room:join`, `room:start` (ack) | browser → server | `client/src/views/Lobby.jsx:22`, `:50-52` | `server/realtime/rooms.js:137`, `:159`, `:179`, `:204` |
| `room:leave`, `room:ready` | browser → server | `client/src/views/Lobby.jsx:49`, `:120`; `client/src/controllers/useBattle.js:64` | `server/realtime/rooms.js:173`, `:197` |
| `input` | browser → server | `client/src/net/NetGame.js:227` | `server/realtime/rooms.js:192` → `server/realtime/match.js:127` |
| `puzzle:get`, `puzzle:answer` (ack) | browser → server | `NetGame.js` via `request()` | `server/realtime/rooms.js:197`, `:236` |
| `puzzle:cancel` | browser → server | `client/src/net/NetGame.js:109` | `server/realtime/rooms.js:234` |
| `disconnect` | built in | socket closes | `server/realtime/rooms.js:239` (a bot takes over) |
| `room:update`, `rooms:changed` | server → browser | `server/realtime/rooms.js:40`, `:62` | `client/src/views/Lobby.jsx:31`, `:34` |
| `match:start` | server → browser | `server/realtime/rooms.js:113`, `:152` | `client/src/net/NetGame.js:44` |
| `match:snapshot` | server → browser | `server/realtime/match.js:153` (every tick) | `client/src/net/NetGame.js:70` |
| `match:end` | server → browser | `server/realtime/match.js:193` | `client/src/net/NetGame.js:79` |
| `puzzle:offer` | server → browser | `server/realtime/match.js:99` | `client/src/net/NetGame.js:104` |
| `achievement:unlocked` | server → browser | `server/realtime/rooms.js:26` | `client/src/net/socket.js:11` (re-emitted on the bus) |
| forced disconnect | server → browser | `server/services/sessions.js:50-53` (log out everywhere, password change, account deleted) | `client/src/views/Lobby.jsx:28` (`disconnect`) |

## Time-based events

| Timer | Where | What it does |
|---|---|---|
| `requestAnimationFrame` | `client/src/game/GameSession.js:192-217`, `client/src/net/NetGame.js:234-249` | Browser game loop; fixed 1/60 s steps with catch-up (at most 5 per frame) |
| `setInterval(1000/30)` | `server/realtime/match.js:166-168` | Server match tick; one snapshot per tick |
| `setImmediate` | `server/realtime/match.js:191` | Finishes the match on the next turn of the event loop, outside the world update |
| `setTimeout` | `client/src/game/GameSession.js:91`, `:100`, `:129` | Short delays before the revive puzzle, the continue puzzle and the results |
| Puzzle countdown | `client/src/components/PuzzleModal.jsx:86-131` (`setInterval` every 200 ms) | Running out of time counts as a wrong answer; the ring turns orange, then red |
| `AbortController` + `setTimeout` | `server/services/bananaApi.js:84-86` | Cancels a Banana API request after 5 s, body included |
| Backoff `sleep` | `server/services/bananaApi.js:109-112` | Waits 300 ms, then 900 ms (plus jitter) before a retry |
| `take()` deadline | `server/services/pool.js:126-127` | After 2.5 s a waiting player gets a reserve puzzle |
| Circuit cool-down | `server/services/pool.js:51`, `:68-73` | 30 s with no live calls after 3 failures in a row, then one probe |
| Music scheduler | `client/src/game/music.js:108` (`setInterval` every 25 ms) | Schedules notes 0.12 s ahead on the audio clock |
| `timeout(8000)` | `client/src/net/socket.js:25-26` | A socket request without a reply in 8 s fails |
| MongoDB TTL | `server/models/rateLimit.js:10`, `server/models/passwordReset.js:9` | The database deletes login counters when their window ends, and reset links after 30 minutes |

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._

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

`server/services/eventLog.js` is a Node `EventEmitter` hub with a ring buffer of the last 100 events
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
acknowledgement. `client/src/views/Admin/LiveEvents.jsx` listens for `server:event`, with a filter and pause.

Why push (WebSocket) rather than poll: events appear at once and the server sends nothing when nobody is
watching. Polling `/api/admin/events` every few seconds would be simpler (plain HTTP, easy to cache) but is
always late and costs a request per admin per interval. The ring buffer is in memory, so the feed starts empty
after a restart; the audit log (MongoDB) is the permanent record.


## Battle animations (added on `feature/battle-animations`)

All in `client/src/game/effects.js` (fixed-size pools, drawn by `render.js`); they listen to the same bus events,
so they also work online, where `NetGame.js` re-emits the server's events.

| Event | New listener does |
|---|---|
| `soldier:killed` | ragdoll corpse flung away from the killer (harder on a headshot); multi-kill banners; gold HEADSHOT! pop |
| `soldier:damaged` | gold marker and damage number on headshots; small hit flinch |
| `soldier:respawned` | banana-yellow light ring and sparkles |
| `explosion` | fireball, shockwave ring, smoke, debris, scorch mark |
| `melee:swing`, `grenade:thrown`, `weapon:reloading`, `soldier:landed` | melee swing, throw arm, reload tilt and falling magazine, landing squash (dust from 260 px/s) |
| (snapshot state) `jetting`, `current`, `busy`, `health` | jetpack smoke; weapon-swap lower/raise when `current` changes; banana bubble for crate solvers; low-health vignette |
