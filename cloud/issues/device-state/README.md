# Device State REST API

Move glasses connection state updates from WebSocket to REST API.

## Problem

Mobile never syncs `useGlassesStore.connected` with Core status → sends "DISCONNECTED" via WebSocket even when glasses ARE connected → cloud rejects display requests with `GLASSES_DISCONNECTED` error.

## Solution

REST endpoint: `POST /api/client/device/state`

Type: `Partial<GlassesInfo>` from `@mentra/types`

Client sends only changed properties. Cloud merges into existing state.

Example payloads:

```typescript
// Glasses connect
{ connected: true, modelName: "Even Realities G1", timestamp: "..." }

// WiFi change only
{ wifiConnected: true, wifiSsid: "Home-Network", timestamp: "..." }

// Disconnect
{ connected: false, modelName: null, timestamp: "..." }
```

## Why REST not WebSocket

- Idempotent (safe to retry)
- Confirmed (HTTP 200)
- Explicit state update (not event-driven)
- Follows existing pattern (`/api/client/location`, `/api/client/calendar`)

## Implementation (Cloud Only)

**Type:**

- `GlassesInfo` interface in `@mentra/types` package
- Exported from `cloud/packages/types/src/device.ts`

**Endpoint:**

- `cloud/src/api/client/device-state.api.ts`
- Route: `POST /api/client/device/state`
- Middleware: `clientAuthWithUserSession`
- Accepts: `Partial<GlassesInfo>`

**DeviceManager:**

- New method: `updateDeviceState(payload: Partial<GlassesInfo>)`
- Merges partial updates into UserSession
- Triggers capabilities/analytics when needed
- Replaces: `handleGlassesConnectionState()` and `setCurrentModel()` (future)

**Mobile (Separate Task):**

- Mobile dev will implement REST API calls
- Mobile dev will update CoreStatusProvider
- Keep WebSocket handler until mobile deployed

## Deployment

1. **Deploy cloud to staging** - Test endpoint with curl
2. **Deploy cloud to production** - Backward compatible (WebSocket still works)
3. **Mobile dev implements** - RestComms + CoreStatusProvider changes
4. **Deploy mobile** - New clients use REST, old clients use WebSocket
5. **Next deployment** - Remove WebSocket handler (breaks old clients)

Goal: Clean codebase, REST for state, WebSocket only for real-time streams.

## Metrics

| Current                        | Target                       |
| ------------------------------ | ---------------------------- |
| Display requests fail randomly | 100% success when connected  |
| No confirmation                | HTTP 200 with merged state   |
| Full CoreStatus (2-3KB)        | Partial updates (~120 bytes) |

## Files

- `device-state-spec.md` - Type definition, API contract, what cloud uses
- `device-state-arch.md` - Code changes, data flow, examples
- `IMPLEMENTATION.md` - Implementation summary, testing, mobile integration guide
