# Events catalogue

Banana Brigade uses four kinds of events. Each one decouples the code that notices something from the code
that reacts to it.

| Layer | Mechanism | Defined in |
|---|---|---|
| Browser game and UI | Publish/subscribe event bus (observer pattern): `on`, `off`, `emit` | `client/src/services/eventBus.js:5-36` |
| React components | `useBus(name, handler)` subscribes on mount and unsubscribes on unmount | `client/src/hooks/useBus.js:12-16` |
| Server | Node `EventEmitter` plus a list of achievement rules | `server/services/achievements.js:41-126` |
| Network | Socket.io messages (and their acknowledgement callbacks) | `server/realtime/rooms.js:158-306`, `server/realtime/socket.js:44-57`, `client/src/net/socket.js` |

Below these sit the platform's own events: DOM events (`keydown`, `mousedown`, `wheel`, `pointerdown`, `click`),
`requestAnimationFrame` (the browser game loop), and `setInterval` / `setTimeout` (the server's 30 Hz match tick,
puzzle countdowns, delays before results). The bus catches errors per listener, so one broken listener does not
stop the others (`client/src/services/eventBus.js:30-34`).

In the tables, `client/src/game/world.js:257` means file and line. "(bus)" means the browser event bus.
"(none)" means the event is announced but nothing listens to it yet.

## Input events (bus)

`client/src/game/input.js` turns DOM events into game events, so the rest of the game does not care whether
a key, the mouse or a touch button was used.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `input:pause` | `client/src/game/input.js:157` (Esc), `client/src/game/input.js:197` (button) | `client/src/game/GameSession.js:196`, `client/src/net/NetGame.js:170` | none |
| `input:banana` | `client/src/game/input.js:164` (B key) | `client/src/game/GameSession.js:145`, `client/src/net/NetGame.js:167` | none |
| `input:supply` | `client/src/game/GameSession.js:110` (X key), `client/src/game/hud.js:59` (DROP button) | `client/src/game/GameSession.js:106` (calls `callSupplyDrop`) | none |
| `input:scoreboard` | `client/src/game/input.js:160`, `client/src/game/input.js:170` (Tab down/up) | `client/src/game/hud.js:137` | `{ show }` |
| `input:zoom` | `client/src/game/input.js:145` (Z, right mouse hold, wheel, button), `client/src/game/input.js:216` (reset) | `client/src/game/hud.js:136` | `{ level, scoped, zoomLabel }` |
| `input:minimap` | `client/src/game/input.js:162` (M key) | (none) | `{ visible }` |
| `input:help` | `client/src/game/input.js:165` (H key) | (none) | `{ visible }` |
| `input:move`, `input:jet` | `client/src/game/input.js:252`, `client/src/game/input.js:253` (when the direction or jetpack changes) | `client/src/game/tutorial.js:104` (Boot Camp steps) | `{ dir, time }`, `{ on, time }` |

Held keys (move, jet, fire) are not events: the game loop reads them each step with `input.apply()`.

## Engine events (bus in the browser; per-room `emit` on the server)

`client/src/game/world.js` never touches the screen. It calls `world.emit(...)`. In the browser that is the bus
(`client/src/game/world.js:97`, default `emit = busEmit`). On the server, `server/realtime/match.js:81-106` passes its
own `emit`, which turns some events into snapshot events or puzzle offers. Online, `client/src/net/NetGame.js:176-206`
turns the snapshot events back into the same bus events, so the HUD, sounds and animations work in both.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `match:started` | `client/src/game/world.js:152` | `client/src/game/effects.js:150`, `client/src/game/tutorial.js:141`, `client/src/game/minimap.js:82` | `{ soldiers, mode }` |
| `soldier:damaged` | `client/src/game/world.js:226` | `client/src/game/hud.js:100` (hurt flash), `client/src/game/sound.js:362`, `client/src/game/effects.js:220`; server `server/realtime/match.js:87` | `{ victim, attacker, amount, headshot }` |
| `soldier:killed` | `client/src/game/world.js:257` | `client/src/game/hud.js:93` (kill feed), `client/src/game/sound.js:375`, `client/src/game/effects.js:252`, `client/src/game/minimap.js:79`, `client/src/game/input.js:152`, `client/src/controllers/useBattle.js:56`; server `server/realtime/match.js:83-86` | `{ victim, killer, weapon, headshot }` |
| `soldier:respawned` | `client/src/game/world.js:198` | `client/src/game/hud.js:135`, `client/src/game/effects.js:164`; server `server/realtime/match.js:88` | `{ soldier }` |
| `player:down` | `client/src/game/world.js:259` (Survival) | `client/src/game/GameSession.js:147` (opens the revive puzzle) | `{ wave }` |
| `player:out` | `client/src/game/world.js:238` (Campaign, no lives) | `client/src/game/GameSession.js:149` (opens the continue puzzle) | `{ continues }` |
| `weapon:fired` | `client/src/game/world.js:433` | `client/src/game/sound.js:290`, `client/src/game/effects.js:180`, `client/src/game/minimap.js:78`; server `server/realtime/match.js:93` | `{ soldier, weapon, x, y }` |
| `weapon:reloading` / `weapon:reloaded` / `weapon:empty` | `client/src/game/world.js:442`, `:453`, `:633` | `client/src/game/sound.js:321-335`, `client/src/game/effects.js:155`, `client/src/game/input.js:153`; server `server/realtime/match.js:94-95` | `{ soldier, weapon }` |
| `weapon:switched` | `client/src/game/world.js:619`, `:632` | `client/src/game/input.js:154` (resets the scope) | `{ soldier, weapon }` |
| `weapon:reload-cancelled` | `client/src/game/world.js:616` | (none) | `{ soldier, weapon }` |
| `grenade:thrown` | `client/src/game/world.js:467` | `client/src/game/sound.js:313`, `client/src/game/effects.js:153`; server `server/realtime/match.js:97` | `{ soldier }` |
| `grenade:bounce` | `client/src/game/world.js:773` | `client/src/game/sound.js:300`; server `server/realtime/match.js:97` | `{}` |
| `melee:swing` | `client/src/game/world.js:474` | `client/src/game/sound.js:307`, `client/src/game/effects.js:152`; server `server/realtime/match.js:98` | `{ soldier }` |
| `explosion` | `client/src/game/world.js:383` | `client/src/game/sound.js:298`, `client/src/game/effects.js:342`; server `server/realtime/match.js:96` | `{ x, y, radius }` |
| `bullet:wall`, `soldier:landed`, `jetpack:sputter`, `shield:broken` | `client/src/game/world.js:714`, `:602`, `:523`, `:219` | `client/src/game/sound.js:299`, `:384`, `:388`, `:358`; landing dust `client/src/game/effects.js:326`; server `server/realtime/match.js:97-98` | position or `{ soldier }` |
| `pickup:available` | `client/src/game/world.js:645`, `:655`; `client/src/net/NetGame.js:283` | `client/src/game/hud.js:107` (prompt), `client/src/controllers/useBattle.js:51` (one-time tips); server `server/realtime/match.js:101` | `{ weapon }` or `{ banana: true, supply }` |
| `pickup:taken` | `client/src/game/world.js:347`, `:515` | `client/src/game/hud.js:112`, `client/src/game/sound.js:336`, Boot Camp; server `server/realtime/match.js:92` | `{ soldier, kind, weapon }` |
| `banana:crate` | `client/src/game/world.js:644` (E at a crate) | `client/src/game/GameSession.js:175` (crate puzzle, or a supply crate's free power), Boot Camp; server `server/realtime/match.js:102` (`offerCrate`, sends `puzzle:offer`) | `{ pickup, soldier, supply }` |
| `banana:meter` | `client/src/game/world.js:286`, `:292`, `:313` | `client/src/game/hud.js:121` (toast), `client/src/components/PuzzleModal.jsx:46` (reward line) | `{ soldier, value, streak, gained, grade, full }` |
| `banana:drop` | `client/src/game/world.js:312` (`callSupplyDrop`) | `client/src/game/hud.js:126` (toast), `client/src/game/GameSession.js:100` (Banana report count) | `{ soldier, x, y, pickup }` |
| `power:start` | `client/src/game/world.js:346` (`rewardBananaCrate`) | `client/src/game/hud.js:128`, `client/src/game/sound.js:346`, Boot Camp; online via `fx` (`server/realtime/match.js:89-90`) | `{ soldier, power, seconds, random }` |
| `power:warning` | `client/src/game/world.js:362` (2 s left) | `client/src/game/hud.js:131`, `client/src/game/sound.js:352` | `{ soldier, power }` |
| `power:end` | `client/src/game/world.js:363`, `:231` (on death) | `client/src/game/hud.js:132`, `client/src/game/sound.js:355` | `{ soldier, power }` |
| `survival:wave` | `client/src/game/world.js:171` | `client/src/game/hud.js:127` | `{ wave, count }` |
| `survival:cleared` | `client/src/game/world.js:836` | `client/src/game/hud.js:133` | `{ wave }` |
| `campaign:ramp` | `client/src/game/world.js:828` | `client/src/game/hud.js:134` | `{ level }` |
| `match:countdown` | `client/src/game/world.js:811`; `client/src/net/NetGame.js:241` (each of the last 10 s) | (none: the HUD reads `timeLeft` every frame for the red pulse, `client/src/game/hud.js:272`) | `{ seconds, online? }` |
| `match:ended` | `client/src/game/world.js:379` | `client/src/game/GameSession.js:202` (emits `game:over` after 1.5 s); server `server/realtime/match.js:103` (`finish`) | `{ reason, ranking, player, mode, wave, teamKills, mission, continues }` |

"Boot Camp" means `client/src/game/tutorial.js:104`, which subscribes to every name in `BOOT_CAMP_EVENTS`
(`client/src/game/tutorial.js:29`) while the tutorial runs and unsubscribes when it stops (`:114`).

## Session and UI events (bus)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `game:state` | `client/src/game/GameSession.js:74`; `client/src/net/NetGame.js:84`, `:116`, `:173`, `:301` | `client/src/controllers/useBattle.js:59` (switches screen), `client/src/game/music.js:82` (crossfades to battle or menu music), `client/src/components/BootCampCoach.jsx:29` | `{ state: 'playing'\|'puzzle'\|'paused'\|'ending'\|'over'\|'idle', online? }` |
| `game:over` | `client/src/game/GameSession.js:208`; `client/src/net/NetGame.js:117` | `client/src/controllers/useBattle.js:65` (victory clip, then the results screen) | `{ result, outcome, session, difficulty, mission, durationS, online? }` |
| `banana:requested`, `banana:loaded`, `banana:error` | `client/src/components/PuzzleModal.jsx:92`, `:107`, `:114` | (none) | `{ purpose }`, `{ purpose, message }` |
| `banana:answered` | `client/src/components/PuzzleModal.jsx:143`; `client/src/views/Daily.jsx:59` | `client/src/game/GameSession.js:79` (stats and Banana Meter), `client/src/net/NetGame.js:147`, `client/src/services/storage.js:15` (lifetime record), `client/src/game/sound.js:289` (chime or buzzer), Boot Camp | `{ purpose, correct, timedOut, grade, ms, source }` |
| `achievement:unlocked` | `client/src/services/api.js:46` (from any HTTP reply); `client/src/net/socket.js:18` (from the socket) | `client/src/components/Toasts.jsx:18` (pop-up) | `{ id, name, text }` |
| `toast:error`, `toast:info` | `client/src/services/api.js:29`, `:42`; `client/src/controllers/useAccount.js:48`, `:55`; `client/src/controllers/useBattle.js:149`; `client/src/views/Settings.jsx:105` | `client/src/components/Toasts.jsx:19-20` | `{ text }` |
| `session:ended` | `client/src/services/api.js:39` (401 or suspended); `client/src/net/socket.js:19` (server closed the socket) | `client/src/controllers/useAccount.js:44` (back to the login screen) | `{ text }` |
| `settings:set` | `client/src/views/Menu.jsx:36`, `client/src/views/Lobby.jsx:89`, `client/src/views/Difficulty.jsx:62` | `client/src/controllers/useSettings.js:41` | `{ key, value }` |
| `tutorial:step` | `client/src/game/tutorial.js:92`, `:117` | `client/src/components/BootCampCoach.jsx:28` | the step, or `null` |
| `tutorial:done`, `tutorial:skip` | `client/src/game/tutorial.js:93`; `client/src/components/BootCampCoach.jsx:46` (Skip) | `client/src/controllers/useBattle.js:71-72` | none |
| `tip:show` | `client/src/controllers/useBattle.js:48` (first weapon crate, banana crate, death) | `client/src/components/BootCampCoach.jsx:30` | `{ id, text }` |
| `cutscene:started`, `cutscene:ended` | `client/src/services/cutsceneBridge.js:76`, `:88` | (none) | `{ id }`, `{ id, skipped }` |

`game:state` and `game:over` are the contract between the engine and React. Local games (`GameSession`) and
online games (`NetGame`) emit the same two events, so React treats both the same way.

`game:state` has independent listeners: `useBattle` changes the screen, and `client/src/game/music.js:82-85`
switches to the battle loop for `playing`, `puzzle` and `paused`, and back to the menu loop otherwise, with a
1.2 s crossfade. Neither knows about the other. Music only starts after the first click or key press
(`client/src/game/music.js:95-102`), because browsers block sound until the player does something.

Settings reach the engine without the bus: React state is passed to `GameSession.applySettings()` (volumes, mute,
laser, banners) and to classes on `<body>` (`a11y-contrast`, `a11y-large`, `a11y-calm`).

## Server events (`server/services/achievements.js`)

Services call `achievements.emit(name, userId, data)` (`server/services/achievements.js:104-117`). It emits on a Node
`EventEmitter` (`:82`), runs every rule registered for that name, writes new badges once
(`db.unlockAchievement`) and then emits `achievement:unlocked` (`:90`). It returns the new badges so the HTTP reply
or the socket can tell the player. The admin event feed also listens to this `EventEmitter`
(`server/services/eventLog.js:41-51`, wired in `server/app.js:80`).

| Event | Emitted by | Rules (handlers) | Payload |
|---|---|---|---|
| `puzzle:answered` | `server/services/puzzleService.js:46`, `server/services/dailyService.js:94`, `server/realtime/rooms.js:281` | `server/services/achievements.js:63` (Banana Brain, Speed Demon, Clutch, Crate Collector) | `{ correct, solution, purpose, ms, grade }` |
| `score:saved` | `server/services/scoreService.js:52`, `server/realtime/rooms.js:111` | `server/services/achievements.js:48` (First Blood, Sharpshooter, Survivor, Online Victor, Hard as Nails, Veteran …) | the saved score |
| `mission:finished` | `server/services/campaignService.js:48` | `server/services/achievements.js:75` (Three Stars, Campaign Hero) | `{ mission, stars }` |
| `power:used` | `server/services/scoreService.js:54`, `server/services/campaignService.js:50`, `server/realtime/rooms.js:129` | `server/services/achievements.js:83` (Power Hungry) | `{ powers }` |
| `daily:finished` | `server/services/dailyService.js:66` | `server/services/achievements.js:89` (Daily Warrior, Perfect Day) | `{ streak, solved, total }` |
| `achievement:unlocked` | `server/services/achievements.js:115` | the reply's `unlocked` list; `server/realtime/rooms.js:43` pushes it over the socket | `userId, { id, name, text }` |

## Socket.io messages

Full payloads are in [api.md](api.md#socketio-protocol-serverrealtimeroomsjs).

| Message | Direction | Sent at | Handled at |
|---|---|---|---|
| `rooms:list`, `room:create`, `room:join`, `room:start` (ack) | browser → server | `client/src/views/Lobby.jsx:34`, `:59`, `:60`, `:61` | `server/realtime/rooms.js:175`, `:177`, `:200`, `:232` |
| `room:end` (ack) | browser → server (host only) | `client/src/net/NetGame.js:309` | `server/realtime/rooms.js:275` |
| `room:leave` | browser → server | `client/src/views/Lobby.jsx:62`, `client/src/controllers/useBattle.js:138`, `client/src/net/NetGame.js:304` | `server/realtime/rooms.js:220` |
| `room:ready` | browser → server | `client/src/views/Lobby.jsx:134` | `server/realtime/rooms.js:222` |
| `input` | browser → server | `client/src/net/NetGame.js:264` | `server/realtime/rooms.js:242` → `server/realtime/match.js:167` |
| `puzzle:get`, `puzzle:answer` (ack) | browser → server | `client/src/net/NetGame.js:29-30` via `request()` | `server/realtime/rooms.js:247`, `:271` |
| `puzzle:cancel` | browser → server | `client/src/net/NetGame.js:129` | `server/realtime/rooms.js:298` |
| `power:choose` (ack) | browser → server | `client/src/net/NetGame.js:142` | `server/realtime/rooms.js:287` → `server/realtime/match.js:310` |
| `events:watch` (ack), `events:stop` | browser → server (admins) | `client/src/views/Admin/LiveEvents.jsx:30`, `:40` | `server/realtime/socket.js:49`, `:56` |
| `disconnect` | built in | socket closes | `server/realtime/rooms.js:303` (a bot takes over) |
| `room:update`, `rooms:changed` | server → browser | `server/realtime/rooms.js:60`, `:62` | `client/src/views/Lobby.jsx:44`, `:43` |
| `match:start` | server → browser | `server/realtime/rooms.js:149`, `:170` (reconnect) | `client/src/net/NetGame.js:59` |
| `match:snapshot` | server → browser | `server/realtime/match.js:200` (every tick) | `client/src/net/NetGame.js:87` |
| `match:end` | server → browser | `server/realtime/match.js:247` | `client/src/net/NetGame.js:98` |
| `puzzle:offer` | server → browser | `server/realtime/match.js:136` | `client/src/net/NetGame.js:124` |
| `puzzle:closed` | server → browser | `server/realtime/match.js:142` (crate time ran out) | `client/src/net/NetGame.js:133` |
| `power:offer` | server → browser | `server/realtime/match.js:303` | `client/src/net/NetGame.js:138` → `PowerPicker.jsx` |
| `achievement:unlocked` | server → browser | `server/realtime/rooms.js:43` | `client/src/net/socket.js:18` (re-emitted on the bus) |
| `server:event` | server → admins | `server/realtime/socket.js:43` | `client/src/views/Admin/LiveEvents.jsx:34` |
| forced disconnect | server → browser | `server/services/sessions.js:69-73`, `:89` (log out everywhere, password change, account deleted, suspended, one device signed out) | `client/src/net/socket.js:19`, `client/src/views/Lobby.jsx:37` |

## Time-based events

| Timer | Where | What it does |
|---|---|---|
| `requestAnimationFrame` | `client/src/game/GameSession.js:278-311`, `client/src/net/NetGame.js:275-293` | Browser game loop; fixed 1/60 s steps with catch-up (at most 5 per frame) |
| `setInterval(1000/30)` | `server/realtime/match.js:214-217` | Server match tick; one snapshot per tick |
| `setImmediate` | `server/realtime/match.js:245-249` | Finishes the match on the next turn of the event loop, outside the world update |
| `setTimeout` | `client/src/game/GameSession.js:147`, `:149`, `:202` | Short delays before the revive puzzle, the continue puzzle and the results |
| Crate timers (online) | `server/realtime/match.js:134`, `:296`, `:301` | Ends a crate puzzle left open (crate time + 6 s), the short hold after a wrong answer, and a random power if none is picked |
| Puzzle countdown | `client/src/components/PuzzleModal.jsx:169-179` (`setInterval` every 200 ms) | Running out of time counts as a wrong answer; the ring turns orange, then red |
| `AbortController` + `setTimeout` | `server/services/bananaApi.js:118-121` | Cancels a Banana API request after 5 s, body included |
| Backoff `sleep` | `server/services/bananaApi.js:152-155` | Waits 300 ms, then 900 ms (plus jitter) before a retry |
| `take()` deadline | `server/services/pool.js:175-176` | After 2.5 s a waiting player gets a reserve puzzle |
| Circuit cool-down | `server/services/pool.js:73`, `:111` | 30 s with no live calls after 3 failures in a row, then one probe |
| Health samples | `server/services/pool.js:221-227` | Records the API status every 30 s for the admin charts |
| Music crossfade | `client/src/game/music.js:51` (`setInterval` every 50 ms) | Fades between the menu, battle and puzzle tracks |
| `timeout(8000)` | `client/src/net/socket.js:40-41` | A socket request without a reply in 8 s fails |
| MongoDB TTL | `server/models/rateLimit.js:12`, `server/models/passwordReset.js:11`, `server/models/user.js:15` | The database deletes login counters when their window ends, reset links after 30 minutes, and unsaved guests after 7 days |

## Live event feed for admins

`server/services/eventLog.js` is a Node `EventEmitter` hub with a ring buffer of the last 100 events
(`{ id, kind, at, user, text }`). Code that does something worth watching calls `eventLog.record(kind, user, text)`;
it does not know who is listening (observer pattern).

| Event kind | Recorded by | Example |
|---|---|---|
| `auth` | `server/services/authService.js` (register, login, logout, guest, upgrade) | "sayub logged in" |
| `security` | `server/services/authService.js` (wrong password, blocked, suspended, reset asked, password reset); `server/services/accountService.js:32` (one device signed out) | "sayub typed a wrong password" |
| `puzzle`, `score`, `campaign`, `daily`, `power`, `achievement` | `eventLog.watchAchievements` (`server/services/eventLog.js:41-51`) listens to the achievement engine's `EventEmitter` | "sayub solved a respawn puzzle" |
| `kill` | `server/realtime/match.js:85` `onKill` → `server/realtime/rooms.js:130` (only kills involving a real player) | "sayub killed Rex (Sniper) in room KQ7P2D" |
| `admin` | `server/services/adminService.js:25-28` (with the audit row) | "boss suspended cheater. Reason: aimbot" |

Delivery: `server/realtime/socket.js:43` subscribes once with `eventLog.onEvent` and emits every event to the
Socket.io room `admins` as `server:event`. An admin joins that room with `events:watch` (the role is read from the
database at that moment; players get `{ error: 'Admins only' }`) and receives the recent list in the
acknowledgement. `client/src/views/Admin/LiveEvents.jsx` listens for `server:event`, with a filter and pause.

Why push (WebSocket) rather than poll: events appear at once and the server sends nothing when nobody is
watching. Polling an HTTP endpoint every few seconds would be simpler (plain HTTP, easy to cache) but is
always late and costs a request per admin per interval. The ring buffer is in memory, so the feed starts empty
after a restart; the audit log (MongoDB) is the permanent record.

## Battle animations

All in `client/src/game/effects.js` (fixed-size pools, drawn by `render.js`); they listen to the same bus events,
so they also work online, where `NetGame.js` re-emits the server's events.

| Event | Listener does |
|---|---|
| `soldier:killed` | ragdoll corpse flung away from the killer (harder on a headshot); multi-kill banners; gold HEADSHOT! pop |
| `soldier:damaged` | gold marker and damage number on headshots; small hit flinch |
| `soldier:respawned` | banana-yellow light ring and sparkles |
| `explosion` | fireball, shockwave ring, smoke, debris, scorch mark |
| `melee:swing`, `grenade:thrown`, `weapon:reloading`, `soldier:landed` | melee swing, throw arm, reload tilt and falling magazine, landing squash and dust |
| (snapshot state) `jetting`, `current`, `busy`, `health` | jetpack smoke; weapon-swap lower/raise when `current` changes; banana bubble for crate solvers; low-health glow |

_Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya._
