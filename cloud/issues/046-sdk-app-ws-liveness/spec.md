# Issue 046 — SDK App-WS Liveness: Ping-Pong

## Background

We recently fixed WebSocket connection drops between the **phone/glasses and cloud** (issues 034/035)
by implementing an app-level ping/pong on the `glasses-ws` connection:

- Cloud sends `{type:"ping"}` to the phone every 2 seconds via `UserSession.appLevelPingInterval`
- Phone responds with `{type:"pong"}`
- Cloud consumes the pong silently in `bun-websocket.ts` (prevents relay to mini apps)
- This is tested on debug and appears to be working

The **same WebSocket dying problem exists on the `app-ws` connection** — between the SDK
(mini app server) and the cloud. Long-idle SDK connections drop when nginx/the load balancer
times out the TCP connection because no data has flowed.

The existing fix on `glasses-ws` cannot simply be mirrored on `app-ws` (cloud sends ping to SDK)
because of backwards compatibility:

> **Old SDK versions (`2.x`) have no `{type:"ping"}` handling.** They route every unrecognized
> message type through the `default` case in `handleMessage()` which emits an error event and
> logs a warning. A ping every 2–5 seconds would generate **thousands of error log entries per
> user per hour** across every deployed mini app in the ecosystem.

---

## Spike: Why SDK-Initiated Is the Right Direction

### Option A: Cloud sends ping → SDK responds with pong ❌

- Cloud mirrors `glasses-ws` approach: sends `{type:"ping"}` to SDK apps every N seconds
- **Problem:** Old SDK apps (`2.x`) receive unrecognized message → `MentraError("UNKNOWN_TYPE")`
  emitted, `this.logger.warn(...)` fires → at 1 ping/5s that's ~720 warnings/hour/user/app
- No way to gate this without knowing the SDK version of connected apps at runtime
- Even if we add a version check, cloud doesn't know the SDK version of a connected app

### Option B: SDK sends ping → Cloud responds with pong ✅

- New SDK (`3.x hono`) sends `{type:"ping"}` to cloud every N seconds
- Cloud responds `{type:"pong"}` on the `app-ws` handler
- SDK consumes pong silently (no warning, no error event)
- **Backwards compatible by design:** old SDK apps never send pings → cloud never responds →
  no noise on old deployments
- Only apps that upgrade to the new SDK get liveness detection
- Exactly mirrors how the mobile app handles it (client-initiated)

### Option C: Rely on protocol-level WebSocket ping from cloud ❌

- Cloud already does `ws.ping()` (protocol-level) in `AppSession.ts` (cloud-side app session)
- Protocol-level pings are handled by the OS TCP stack — they keep the connection alive at
  the kernel level but are **not visible to the SDK's `ws.on("message")` handler**
- The SDK has no way to verify the connection is alive from its side
- If the cloud-side `AppSession` goes away and respawns, the SDK has no signal

### Why Option B also improves SDK-side reconnection detection

Currently the SDK only discovers a dead connection when it tries to send and gets an error,
or when the WebSocket `close` event fires (which may be delayed by TCP keepalive timeouts
of 30–75 seconds on some load balancers). With SDK-initiated ping/pong:

- If the cloud doesn't respond within N seconds → SDK knows the connection is dead → triggers
  its own reconnection immediately, without waiting for TCP to time out
- This is the same pattern the mobile app uses for liveness detection (issues 034/035)

---

## Design

### Message Types

Both types already exist in `CloudToAppMessageType` and are already in the SDK's enum. No
new enum values needed.

```
SDK → Cloud:   { type: "ping", timestamp: <epoch ms> }
Cloud → SDK:   { type: "pong", timestamp: <epoch ms> }
```

`"ping"` is not a registered `AppToCloudMessageType` enum value — it's a raw string that
bypasses the typed message system, same as on `glasses-ws`. This is intentional: it's
infrastructure, not application protocol.

### Cloud Changes (small — `bun-websocket.ts`)

In `handleAppMessage()`, before delegating to `userSession.handleAppMessage()`, add early
returns for ping/pong — mirroring the existing `handleGlassesMessage()` pattern:

```typescript
// App-level ping from SDK — respond immediately, don't touch session state
if (parsed.type === "ping") {
  ws.send(JSON.stringify({type: "pong", timestamp: Date.now()}))
  return
}

// App-level pong (future: SDK responding to cloud-initiated ping) — consume silently
if (parsed.type === "pong") {
  return
}
```

This is a **3-line cloud change**. No new types, no new handlers, no session state.

### SDK Changes (`AppSession`)

#### 1. Ping interval

After successful connection (`CONNECTION_ACK` received), start a ping interval:

```typescript
private pingInterval?: NodeJS.Timeout
private lastPongTime?: number
private readonly PING_INTERVAL_MS = 15_000   // send ping every 15s
private readonly PONG_TIMEOUT_MS  = 30_000   // consider dead if no pong for 30s
```

Why 15 seconds? The nginx `proxy-read-timeout` on debug/dev is already set to 3600s (issue 035).
The real threat is intermediate load balancers / Cloudflare with shorter idle timeouts (~60–90s).
15s keeps us well under any common threshold without spamming the connection.

#### 2. Pong handling in `handleMessage()`

Add a branch before the unrecognized-message `else` to consume pong silently:

```typescript
} else if ((message as any).type === "pong") {
  // Cloud acknowledged our ping — connection is alive
  this.lastPongTime = Date.now()
  // no log, no error, no event
}
```

#### 3. Dead connection detection (optional for v1)

On each ping, check if `lastPongTime` is older than `PONG_TIMEOUT_MS`. If so, the connection
is silently dead — force-close the WebSocket to trigger the existing reconnection logic:

```typescript
if (this.lastPongTime && Date.now() - this.lastPongTime > this.PONG_TIMEOUT_MS) {
  this.logger.warn("App-WS liveness timeout — no pong received, forcing reconnect")
  this.ws?.close(1001, "Liveness timeout")
  return
}
```

#### 4. Cleanup

Clear the ping interval on disconnect (both permanent and temporary). The interval should
also guard against `this.ws?.readyState !== 1` before sending (same pattern as `UserSession`).

---

## Backwards Compatibility Matrix

| SDK Version             | Sends ping?  | Receives cloud pong?     | Effect                 |
| ----------------------- | ------------ | ------------------------ | ---------------------- |
| `2.x` (old Express SDK) | ❌ No        | ❌ No pong sent by cloud | No change, no noise    |
| `3.0.0-hono.7+` (new)   | ✅ Every 15s | ✅ Cloud responds        | Connection stays alive |

Old apps: zero impact. New apps: automatic liveness without any developer code.

---

## Files to Change

### Cloud (`cloud/packages/cloud/`)

| File                                      | Change                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| `src/services/websocket/bun-websocket.ts` | Add ping/pong early-return in `handleAppMessage()` (~3 lines) |

### SDK (`cloud/packages/sdk/`)

| File                       | Change                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/session/index.ts` | Add `pingInterval`, `lastPongTime`, `PING_INTERVAL_MS`, `PONG_TIMEOUT_MS`; start interval on `CONNECTION_ACK`; consume pong silently in `handleMessage()`; clear interval on disconnect |

### React SDK (`cloud/packages/react-sdk/`)

No changes needed.

---

## Interval Timing Rationale

| Timeout                       | Value | Reason                                                                  |
| ----------------------------- | ----- | ----------------------------------------------------------------------- |
| Ping interval                 | 15s   | Well under Cloudflare's 100s idle timeout, under common LB 60s defaults |
| Pong timeout                  | 30s   | Two missed pings before declaring dead — tolerates one transient loss   |
| Connection timeout (existing) | 5s    | Already in SDK for initial handshake                                    |

The 15s interval also means the SDK sends ~4 pings/minute per connected app. At 100 concurrent
apps that's 400 tiny JSON messages/minute server-wide — negligible load.

---

## Implementation Order

1. **Cloud change first** (`bun-websocket.ts`) — deploy to debug. This is safe to deploy before
   SDK change because no current SDK sends `{type:"ping"}` on `app-ws`, so the new handler is
   never triggered.

2. **SDK change** (`AppSession`) — implement ping interval + pong consumption.

3. **Publish** `@mentra/sdk@3.0.0-hono.7` with tag `hono`.

4. **Update live-captions** to `3.0.0-hono.7` as part of the Hono SDK refactor (issue 046b).

---

## Out of Scope

- Cloud-initiated ping to SDK apps (backwards-incompatible, not needed given SDK-initiated approach)
- Ping-pong on the `glasses-ws` connection (already handled in 034/035)
- Changing the `latest` npm tag (Hono SDK is still pre-release on the `hono` tag)
- Exposing ping interval as a developer-configurable option (internal infrastructure detail)
