# Coping with a slow or broken Banana API

<!-- Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya. -->

The Banana API "may be discontinued without notice". Single calls: `server/services/bananaApi.js`. Calls over time: `server/services/pool.js`.

## Choices

- **Timeout per attempt (5 s, `AbortController`).** A hung request is cancelled, so it cannot block a player.
- **Retry, at most 2 more tries.** Only network errors, timeouts, HTTP 5xx and 429 are retried, because those can pass. Bad JSON or a 404 will not change, so retrying them only adds load.
- **Exponential backoff with jitter (300 ms, then 900 ms, plus up to 30%).** The API gets time to recover. The jitter stops clients from retrying at the same moment.
- **Deadline on `take()` (2.5 s).** After 2.5 s the player gets a reserve puzzle. Otherwise the worst case would be three attempts that each time out after 5 s, plus about 1.2–1.6 s of backoff: roughly 16 s. The late live puzzle is still kept.
- **In-flight limit (3 calls).** When no puzzles are ready, extra requests wait for one instead of each calling the API.
- **Circuit breaker.** After 3 failures in a row, live calls stop for 30 s and the reserve is served. One trial call then checks whether the API has recovered.
- **Saved reserve.** Every live puzzle is also saved in MongoDB (`server/repositories/reservePuzzleRepository.js`), and the last 25 are loaded as the reserve when the server starts (`server/index.js:35-40`). So even a server started while the API is down can serve puzzles, as long as it has run once before.
- **Validation.** The base64 PNG and the one-digit answer are checked. Harmless format differences are normalised first.

`/api/status` shows the last, median (p50) and average latency, the success rate over the last 20 calls, the retries used and the circuit state. The last error appears only as a category, such as `timeout`, `network`, `http-5xx` or `bad-data`.

## Alternatives

- **No retry.** Simplest, but one dropped packet costs the player a live puzzle.
- **Fixed-interval retry.** This is easy to predict. But clients retry in step after an outage, and that "thundering herd" can keep a recovering server down.
- **Queue with a worker.** This handles bursts well and survives restarts, but it needs Redis or a message broker. The pool is already a small in-memory buffer, which is enough at this scale.
- **Retries without a breaker.** During an outage each request could take about 16 s (three 5 s timeouts plus backoff), and the API would get three times the traffic.

## Trade-offs

- Retries make a call slower before it fails. The deadline caps the delay a player notices.
- The breaker state lives in one process's memory, so several servers would each keep a separate breaker.
- A reserve puzzle can repeat, and a player could learn its answer. The reserve is a fallback, not the normal source.
