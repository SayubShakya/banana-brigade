# Events catalogue

Banana Brigade uses four kinds of events. Each one decouples the code that notices something from the code
that reacts to it.

| Layer | Mechanism | Defined in |
|---|---|---|
| Browser game and UI | Publish/subscribe event bus (observer pattern): `on`, `off`, `emit` | `client/src/services/eventBus.js:3-23` |
| React components | `useBus(name, handler)` subscribes on mount and unsubscribes on unmount | `client/src/hooks/useBus.js:6-10` |
| Server | Node `EventEmitter` plus a list of achievement rules | `server/services/achievements.js:32-100` |
| Network | Socket.io messages (and their acknowledgement callbacks) | `server/realtime/rooms.js:124-247`, `server/realtime/socket.js:30-38`, `client/src/net/socket.js` |

Below these sit the platform's own events: DOM events (`keydown`, `mousedown`, `wheel`, `pointerdown`, `click`),
`requestAnimationFrame` (the browser game loop), and `setInterval` / `setTimeout` (the server's 30 Hz match tick,
puzzle countdowns, delays before results). The bus catches errors per listener, so one broken listener does not
stop the others (`client/src/services/eventBus.js:17-21`).

In the tables, `client/src/game/world.js:206` means file and line. "(bus)" means the browser event bus.
"(none)" means the event is announced but nothing listens to it yet.

## Input events (bus)

`client/src/game/input.js` turns DOM events into game events, so the rest of the game does not care whether
a key, the mouse or a touch button was used.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `input:pause` | `client/src/game/input.js:121` (Esc), `client/src/game/input.js:156` (button) | `client/src/game/GameSession.js:166`, `client/src/net/NetGame.js:149` | none |
| `input:banana` | `client/src/game/input.js:126` (B key) | `client/src/game/GameSession.js:119`, `client/src/net/NetGame.js:146` | none |
| `input:supply` | `client/src/game/GameSession.js:92` (X key), `client/src/game/hud.js:45` (DROP button) | `client/src/game/GameSession.js:89` (calls `callSupplyDrop`) | none |
| `input:scoreboard` | `client/src/game/input.js:123`, `client/src/game/input.js:132` (Tab down/up) | `client/src/game/hud.js:118` | `{ show }` |
| `input:zoom` | `client/src/game/input.js:109` (Z, right mouse hold, wheel, button), `client/src/game/input.js:174` (reset) | `client/src/game/hud.js:117` | `{ level, scoped, zoomLabel }` |
| `input:minimap` | `client/src/game/input.js:125` (M key) | (none) | `{ visible }` |
| `input:help` | `client/src/game/input.js:127` (H key) | (none) | `{ visible }` |
| `input:move`, `input:jet` | `client/src/game/input.js:204`, `client/src/game/input.js:205` (when the direction or jetpack changes) | `client/src/game/tutorial.js:87` (Boot Camp steps) | `{ dir, time }`, `{ on, time }` |

Held keys (move, jet, fire) are not events: the game loop reads them each step with `input.apply()`.

## Engine events (bus in the browser; per-room `emit` on the server)

`client/src/game/world.js` never touches the screen. It calls `world.emit(...)`. In the browser that is the bus
(`client/src/game/world.js:69`, default `emit = busEmit`). On the server, `server/realtime/match.js:51-76` passes its
own `emit`, which turns some events into snapshot events or puzzle offers. Online, `client/src/net/NetGame.js:155-181`
turns the snapshot events back into the same bus events, so the HUD, sounds and animations work in both.

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `match:started` | `client/src/game/world.js:120` | `client/src/game/effects.js:129`, `client/src/game/tutorial.js:120`, `client/src/game/minimap.js:64` | `{ soldiers, mode }` |
| `soldier:damaged` | `client/src/game/world.js:178` | `client/src/game/hud.js:82` (hurt flash), `client/src/game/sound.js:330`, `client/src/game/effects.js:195`; server `server/realtime/match.js:57` | `{ victim, attacker, amount, headshot }` |
| `soldier:killed` | `client/src/game/world.js:206` | `client/src/game/hud.js:76` (kill feed), `client/src/game/sound.js:343`, `client/src/game/effects.js:226`, `client/src/game/minimap.js:61`, `client/src/game/input.js:116`, `client/src/controllers/useBattle.js:43`; server `server/realtime/match.js:53-56` | `{ victim, killer, weapon, headshot }` |
| `soldier:respawned` | `client/src/game/world.js:158` | `client/src/game/hud.js:116`, `client/src/game/effects.js:143`; server `server/realtime/match.js:58` | `{ soldier }` |
| `player:down` | `client/src/game/world.js:208` (Survival) | `client/src/game/GameSession.js:121` (opens the revive puzzle) | `{ wave }` |
| `player:out` | `client/src/game/world.js:189` (Campaign, no lives) | `client/src/game/GameSession.js:123` (opens the continue puzzle) | `{ continues }` |
| `weapon:fired` | `client/src/game/world.js:348` | `client/src/game/sound.js:265`, `client/src/game/effects.js:158`, `client/src/game/minimap.js:60`; server `server/realtime/match.js:63` | `{ soldier, weapon, x, y }` |
| `weapon:reloading` / `weapon:reloaded` / `weapon:empty` | `client/src/game/world.js:357`, `:367`, `:526` | `client/src/game/sound.js:296-310`, `client/src/game/effects.js:134`, `client/src/game/input.js:117`; server `server/realtime/match.js:64-65` | `{ soldier, weapon }` |
| `weapon:switched` | `client/src/game/world.js:513`, `:525` | `client/src/game/input.js:118` (resets the scope) | `{ soldier, weapon }` |
| `weapon:reload-cancelled` | `client/src/game/world.js:510` | (none) | `{ soldier, weapon }` |
| `grenade:thrown` | `client/src/game/world.js:380` | `client/src/game/sound.js:288`, `client/src/game/effects.js:132`; server `server/realtime/match.js:67` | `{ soldier }` |
| `grenade:bounce` | `client/src/game/world.js:646` | `client/src/game/sound.js:275`; server `server/realtime/match.js:67` | `{}` |
| `melee:swing` | `client/src/game/world.js:386` | `client/src/game/sound.js:282`, `client/src/game/effects.js:131`; server `server/realtime/match.js:68` | `{ soldier }` |
| `explosion` | `client/src/game/world.js:309` | `client/src/game/sound.js:273`, `client/src/game/effects.js:312`; server `server/realtime/match.js:66` | `{ x, y, radius }` |
| `bullet:wall`, `soldier:landed`, `jetpack:sputter`, `shield:broken` | `client/src/game/world.js:590`, `:498`, `:429`, `:171` | `client/src/game/sound.js:274`, `:352`, `:356`, `:326`; landing dust `client/src/game/effects.js:297`; server `server/realtime/match.js:67-68` | position or `{ soldier }` |
| `pickup:available` | `client/src/game/world.js:538`, `:545`; `client/src/net/NetGame.js:245` | `client/src/game/hud.js:88` (prompt), `client/src/controllers/useBattle.js:38` (one-time tips); server `server/realtime/match.js:71` | `{ weapon }` or `{ banana: true, supply }` |
| `pickup:taken` | `client/src/game/world.js:280`, `:421` | `client/src/game/hud.js:93`, `client/src/game/sound.js:311`, Boot Camp; server `server/realtime/match.js:62` | `{ soldier, kind, weapon }` |
| `banana:crate` | `client/src/game/world.js:537` (E at a crate) | `client/src/game/GameSession.js:147` (crate puzzle, or a supply crate's free power), Boot Camp; server `server/realtime/match.js:72` (`offerCrate`, sends `puzzle:offer`) | `{ pickup, soldier, supply }` |
| `banana:meter` | `client/src/game/world.js:228`, `:234`, `:248` | `client/src/game/hud.js:102` (toast), `client/src/components/PuzzleModal.jsx:36` (reward line) | `{ soldier, value, streak, gained, grade, full }` |
| `banana:drop` | `client/src/game/world.js:247` (`callSupplyDrop`) | `client/src/game/hud.js:107` (toast), `client/src/game/GameSession.js:83` (Banana report count) | `{ soldier, x, y, pickup }` |
| `power:start` | `client/src/game/world.js:279` (`rewardBananaCrate`) | `client/src/game/hud.js:109`, `client/src/game/sound.js:315`, Boot Camp; online via `fx` (`server/realtime/match.js:59-60`) | `{ soldier, power, seconds, random }` |
| `power:warning` | `client/src/game/world.js:290` (2 s left) | `client/src/game/hud.js:112`, `client/src/game/sound.js:320` | `{ soldier, power }` |
| `power:end` | `client/src/game/world.js:291`, `:183` (on death) | `client/src/game/hud.js:113`, `client/src/game/sound.js:323` | `{ soldier, power }` |
| `survival:wave` | `client/src/game/world.js:137` | `client/src/game/hud.js:108` | `{ wave, count }` |
| `survival:cleared` | `client/src/game/world.js:700` | `client/src/game/hud.js:114` | `{ wave }` |
| `campaign:ramp` | `client/src/game/world.js:693` | `client/src/game/hud.js:115` | `{ level }` |
| `match:countdown` | `client/src/game/world.js:682`; `client/src/net/NetGame.js:210` (each of the last 10 s) | (none: the HUD reads `timeLeft` every frame for the red pulse, `client/src/game/hud.js:248`) | `{ seconds, online? }` |
| `match:ended` | `client/src/game/world.js:305` | `client/src/game/GameSession.js:172` (emits `game:over` after 1.5 s); server `server/realtime/match.js:73` (`finish`) | `{ reason, ranking, player, mode, wave, teamKills, mission, continues }` |

"Boot Camp" means `client/src/game/tutorial.js:87`, which subscribes to every name in `BOOT_CAMP_EVENTS`
(`client/src/game/tutorial.js:26`) while the tutorial runs and unsubscribes when it stops (`:96`).

## Session and UI events (bus)

| Event | Emitted by | Handled by | Payload |
|---|---|---|---|
| `game:state` | `client/src/game/GameSession.js:60`; `client/src/net/NetGame.js:68`, `:97`, `:152`, `:262` | `client/src/controllers/useBattle.js:45` (switches screen), `client/src/game/music.js:124` (crossfades to battle or menu music), `client/src/components/BootCampCoach.jsx:23` | `{ state: 'playing'\|'puzzle'\|'paused'\|'ending'\|'over'\|'idle', online? }` |
| `game:over` | `client/src/game/GameSession.js:178`; `client/src/net/NetGame.js:98` | `client/src/controllers/useBattle.js:50` (victory clip, then the results screen) | `{ result, outcome, session, difficulty, mission, durationS, online? }` |
| `banana:requested`, `banana:loaded`, `banana:error` | `client/src/components/PuzzleModal.jsx:73`, `:88`, `:94` | (none) | `{ purpose }`, `{ purpose, message }` |
| `banana:answered` | `client/src/components/PuzzleModal.jsx:116`; `client/src/views/Daily.jsx:50` | `client/src/game/GameSession.js:64` (stats and Banana Meter), `client/src/net/NetGame.js:126`, `client/src/services/storage.js:12` (lifetime record), `client/src/game/sound.js:264` (chime or buzzer), Boot Camp | `{ purpose, correct, timedOut, grade, ms, source }` |
| `achievement:unlocked` | `client/src/services/api.js:28` (from any HTTP reply); `client/src/net/socket.js:11` (from the socket) | `client/src/components/Toasts.jsx:14` (pop-up) | `{ id, name, text }` |
| `toast:error`, `toast:info` | `client/src/services/api.js:17`, `:25`; `client/src/controllers/useAccount.js:36`, `:43`; `client/src/controllers/useBattle.js:126`; `client/src/views/Settings.jsx:90` | `client/src/components/Toasts.jsx:15-16` | `{ text }` |
| `session:ended` | `client/src/services/api.js:23` (401 or suspended); `client/src/net/socket.js:12` (server closed the socket) | `client/src/controllers/useAccount.js:33` (back to the login screen) | `{ text }` |
| `settings:set` | `client/src/views/Menu.jsx:29`, `client/src/views/Lobby.jsx:78`, `client/src/views/Difficulty.jsx:53` | `client/src/controllers/useSettings.js:35` | `{ key, value }` |
| `tutorial:step` | `client/src/game/tutorial.js:79`, `:99` | `client/src/components/BootCampCoach.jsx:22` | the step, or `null` |
| `tutorial:done`, `tutorial:skip` | `client/src/game/tutorial.js:80`; `client/src/components/BootCampCoach.jsx:40` (Skip) | `client/src/controllers/useBattle.js:56-57` | none |
| `tip:show` | `client/src/controllers/useBattle.js:36` (first weapon crate, banana crate, death) | `client/src/components/BootCampCoach.jsx:24` | `{ id, text }` |
| `cutscene:started`, `cutscene:ended` | `client/src/services/cutsceneBridge.js:59`, `:70` | (none) | `{ id }`, `{ id, skipped }` |

`game:state` and `game:over` are the contract between the engine and React. Local games (`GameSession`) and
online games (`NetGame`) emit the same two events, so React treats both the same way.

`game:state` has independent listeners: `useBattle` changes the screen, and `client/src/game/music.js:124-127`
switches to the battle loop for `playing`, `puzzle` and `paused`, and back to the menu loop otherwise, with a
1.2 s crossfade. Neither knows about the other. Music only starts after the first click or key press
(`client/src/game/music.js:128-135`), because browsers block sound until the player does something.

Settings reach the engine without the bus: React state is passed to `GameSession.applySettings()` (volumes, mute,
laser, banners) and to classes on `<body>` (`a11y-contrast`, `a11y-large`, `a11y-calm`).

## Server events (`server/services/achievements.js`)

Services call `achievements.emit(name, userId, data)` (`server/services/achievements.js:81-92`). It emits on a Node
`EventEmitter` (`:82`), runs every rule registered for that name, writes new badges once
(`db.unlockAchievement`) and then emits `achievement:unlocked` (`:90`). It returns the new badges so the HTTP reply
or the socket can tell the player. The admin event feed also listens to this `EventEmitter`
(`server/services/eventLog.js:27-36`, wired in `server/app.js:63`).

| Event | Emitted by | Rules (handlers) | Payload |
|---|---|---|---|
| `puzzle:answered` | `server/services/puzzleService.js:25`, `server/services/dailyService.js:71`, `server/realtime/rooms.js:229` | `server/services/achievements.js:51` (Banana Brain, Speed Demon, Clutch, Crate Collector) | `{ correct, solution, purpose, ms, grade }` |
| `score:saved` | `server/services/scoreService.js:33`, `server/realtime/rooms.js:83` | `server/services/achievements.js:37` (First Blood, Sharpshooter, Survivor, Online Victor, Hard as Nails, Veteran …) | the saved score |
| `mission:finished` | `server/services/campaignService.js:35` | `server/services/achievements.js:62` (Three Stars, Campaign Hero) | `{ mission, stars }` |
| `power:used` | `server/services/scoreService.js:35`, `server/services/campaignService.js:37`, `server/realtime/rooms.js:100` | `server/services/achievements.js:69` (Power Hungry) | `{ powers }` |
| `daily:finished` | `server/services/dailyService.js:51` | `server/services/achievements.js:74` (Daily Warrior, Perfect Day) | `{ streak, solved, total }` |
| `achievement:unlocked` | `server/services/achievements.js:90` | the reply's `unlocked` list; `server/realtime/rooms.js:26` pushes it over the socket | `userId, { id, name, text }` |

## Socket.io messages

Full payloads are in [api.md](api.md#socketio-protocol-serverrealtimeroomsjs).

| Message | Direction | Sent at | Handled at |
|---|---|---|---|
| `rooms:list`, `room:create`, `room:join`, `room:start` (ack) | browser → server | `client/src/views/Lobby.jsx:26`, `:50`, `:51`, `:52` | `server/realtime/rooms.js:140`, `:142`, `:162`, `:187` |
| `room:leave` | browser → server | `client/src/views/Lobby.jsx:53`, `client/src/controllers/useBattle.js:115`, `client/src/net/NetGame.js:265` | `server/realtime/rooms.js:178` |
| `room:ready` | browser → server | `client/src/views/Lobby.jsx:123` | `server/realtime/rooms.js:180` |
| `input` | browser → server | `client/src/net/NetGame.js:230` | `server/realtime/rooms.js:197` → `server/realtime/match.js:127` |
| `puzzle:get`, `puzzle:answer` (ack) | browser → server | `client/src/net/NetGame.js:22-23` via `request()` | `server/realtime/rooms.js:202`, `:220` |
| `puzzle:cancel` | browser → server | `client/src/net/NetGame.js:110` | `server/realtime/rooms.js:239` |
| `power:choose` (ack) | browser → server | `client/src/net/NetGame.js:122` | `server/realtime/rooms.js:233` → `server/realtime/match.js:244` |
| `events:watch` (ack), `events:stop` | browser → server (admins) | `client/src/views/Admin/LiveEvents.jsx:25`, `:35` | `server/realtime/socket.js:31`, `:37` |
| `disconnect` | built in | socket closes | `server/realtime/rooms.js:244` (a bot takes over) |
| `room:update`, `rooms:changed` | server → browser | `server/realtime/rooms.js:41`, `:42` | `client/src/views/Lobby.jsx:35`, `:34` |
| `match:start` | server → browser | `server/realtime/rooms.js:116`, `:135` (reconnect) | `client/src/net/NetGame.js:44` |
| `match:snapshot` | server → browser | `server/realtime/match.js:153` (every tick) | `client/src/net/NetGame.js:71` |
| `match:end` | server → browser | `server/realtime/match.js:193` | `client/src/net/NetGame.js:80` |
| `puzzle:offer` | server → browser | `server/realtime/match.js:99` | `client/src/net/NetGame.js:105` |
| `puzzle:closed` | server → browser | `server/realtime/match.js:105` (crate time ran out) | `client/src/net/NetGame.js:113` |
| `power:offer` | server → browser | `server/realtime/match.js:241` | `client/src/net/NetGame.js:118` → `PowerPicker.jsx` |
| `achievement:unlocked` | server → browser | `server/realtime/rooms.js:26` | `client/src/net/socket.js:11` (re-emitted on the bus) |
| `server:event` | server → admins | `server/realtime/socket.js:29` | `client/src/views/Admin/LiveEvents.jsx:29` |
| forced disconnect | server → browser | `server/services/sessions.js:50-54`, `:66` (log out everywhere, password change, account deleted, suspended, one device signed out) | `client/src/net/socket.js:12`, `client/src/views/Lobby.jsx:29` |

## Time-based events

| Timer | Where | What it does |
|---|---|---|
| `requestAnimationFrame` | `client/src/game/GameSession.js:244-271`, `client/src/net/NetGame.js:237-254` | Browser game loop; fixed 1/60 s steps with catch-up (at most 5 per frame) |
| `setInterval(1000/30)` | `server/realtime/match.js:166-168` | Server match tick; one snapshot per tick |
| `setImmediate` | `server/realtime/match.js:191-195` | Finishes the match on the next turn of the event loop, outside the world update |
| `setTimeout` | `client/src/game/GameSession.js:121`, `:123`, `:172` | Short delays before the revive puzzle, the continue puzzle and the results |
| Crate timers (online) | `server/realtime/match.js:97`, `:235`, `:239` | Ends a crate puzzle left open (crate time + 6 s), the short hold after a wrong answer, and a random power if none is picked |
| Puzzle countdown | `client/src/components/PuzzleModal.jsx:140-150` (`setInterval` every 200 ms) | Running out of time counts as a wrong answer; the ring turns orange, then red |
| `AbortController` + `setTimeout` | `server/services/bananaApi.js:84-86` | Cancels a Banana API request after 5 s, body included |
| Backoff `sleep` | `server/services/bananaApi.js:109-112` | Waits 300 ms, then 900 ms (plus jitter) before a retry |
| `take()` deadline | `server/services/pool.js:126-127` | After 2.5 s a waiting player gets a reserve puzzle |
| Circuit cool-down | `server/services/pool.js:51`, `:79` | 30 s with no live calls after 3 failures in a row, then one probe |
| Health samples | `server/services/pool.js:169-174` | Records the API status every 30 s for the admin charts |
| Music scheduler | `client/src/game/music.js:109` (`setInterval` every 25 ms) | Schedules notes 0.12 s ahead on the audio clock |
| `timeout(8000)` | `client/src/net/socket.js:25-26` | A socket request without a reply in 8 s fails |
| MongoDB TTL | `server/models/rateLimit.js:10`, `server/models/passwordReset.js:9`, `server/models/user.js:11` | The database deletes login counters when their window ends, reset links after 30 minutes, and unsaved guests after 7 days |

## Live event feed for admins

`server/services/eventLog.js` is a Node `EventEmitter` hub with a ring buffer of the last 100 events
(`{ id, kind, at, user, text }`). Code that does something worth watching calls `eventLog.record(kind, user, text)`;
it does not know who is listening (observer pattern).

| Event kind | Recorded by | Example |
|---|---|---|
| `auth` | `server/services/authService.js` (register, login, logout, guest, upgrade) | "sayub logged in" |
| `security` | `server/services/authService.js` (wrong password, blocked, suspended, reset asked, password reset); `server/services/accountService.js:18` (one device signed out) | "sayub typed a wrong password" |
| `puzzle`, `score`, `campaign`, `daily`, `power`, `achievement` | `eventLog.watchAchievements` (`server/services/eventLog.js:27-36`) listens to the achievement engine's `EventEmitter` | "sayub solved a respawn puzzle" |
| `kill` | `server/realtime/match.js:55` `onKill` → `server/realtime/rooms.js:101` (only kills involving a real player) | "sayub killed Rex (Sniper) in room KQ7P2D" |
| `admin` | `server/services/adminService.js:15-18` (with the audit row) | "boss suspended cheater. Reason: aimbot" |

Delivery: `server/realtime/socket.js:29` subscribes once with `eventLog.onEvent` and emits every event to the
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
