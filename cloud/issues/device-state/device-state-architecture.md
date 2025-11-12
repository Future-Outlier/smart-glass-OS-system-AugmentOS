# Device State REST API - Architecture

## Current Flow (Broken)

```
Android Core → React Native
  → CoreStatusProvider updates status.glasses_info ✅
  → useGlassesStore.connected NEVER UPDATED ❌
  → SocketComms reads stale store
  → Sends "DISCONNECTED" via WebSocket
  → Cloud sets userSession.glassesConnected = false
  → Display requests fail with GLASSES_DISCONNECTED
```

**Problem:** Two sources of truth never synced.

## New Flow (Fixed)

```
Android Core → React Native
  → CoreStatusProvider updates status.glasses_info ✅
  → CoreStatusProvider calls restComms.updateDeviceState() ✅
  → HTTP POST /api/client/device/state
  → Cloud updates userSession.glassesConnected = true
  → Display requests succeed ✅
```

**Fix:** Single explicit state update via REST.

## Code Changes

### Cloud: New Endpoint

**File:** `cloud/packages/cloud/src/api/client/device-state.api.ts`

```typescript
import {Router, Request, Response} from "express"
import {GlassesInfo} from "@mentra/types"
import {clientAuthWithUserSession, RequestWithUserSession} from "../middleware/client.middleware"

const router = Router()

router.post("/", clientAuthWithUserSession, updateDeviceState)

async function updateDeviceState(req: Request, res: Response) {
  const _req = req as RequestWithUserSession
  const {userSession} = _req
  const payload = req.body as Partial<GlassesInfo>

  // Validate: if connected is being set to true, modelName must be provided
  if (payload.connected === true && !payload.modelName) {
    return res.status(400).json({
      success: false,
      message: "modelName required when connected=true",
    })
  }

  try {
    await userSession.deviceManager.updateDeviceState(payload)

    return res.json({
      success: true,
      appliedState: {
        connected: payload.connected,
        modelName: payload.modelName,
        capabilities: userSession.deviceManager.getCapabilities(),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    _req.logger.error(error, "Failed to update device state")
    return res.status(500).json({
      success: false,
      message: "Failed to update device state",
    })
  }
}

export default router
```

**Register route:**

`cloud/packages/cloud/src/api/index.ts`

```typescript
import deviceStateApi from "./client/device-state.api"

export function registerApi(app: Application) {
  // ... existing
  app.use("/api/client/device/state", deviceStateApi)
}
```

### Cloud: DeviceManager Method

**File:** `cloud/packages/cloud/src/services/session/DeviceManager.ts`

Add new method:

```typescript
import { GlassesInfo } from "@mentra/types";

/**
 * Update device state with partial data
 * Merges provided properties into existing state
 * Triggers capability updates, analytics, app notifications as needed
 */
async updateDeviceState(payload: Partial<GlassesInfo>): Promise<void> {
  this.logger.info(
    { userId: this.userSession.userId, payload },
    "Updating device state"
  );

  // Merge partial updates into UserSession
  if (payload.connected !== undefined) {
    this.userSession.glassesConnected = payload.connected;
  }
  if (payload.modelName !== undefined) {
    this.userSession.glassesModel = payload.modelName || undefined;
  }
  if (payload.timestamp) {
    this.userSession.lastGlassesStatusUpdate = new Date(payload.timestamp);
  }

  // Merge into stored state
  this.userSession.lastGlassesConnectionState = {
    ...this.userSession.lastGlassesConnectionState,
    ...payload,
  } as any;

  // Update capabilities & analytics (only if connection state changed)
  if (payload.connected !== undefined) {
    if (payload.connected && payload.modelName) {
      await this.handleGlassesConnectionState(payload.modelName, "CONNECTED");
    } else {
      await this.handleGlassesConnectionState(null, "DISCONNECTED");
    }

    // Notify microphone manager
    try {
      this.userSession.microphoneManager?.handleConnectionStateChange(
        payload.connected ? "CONNECTED" : "DISCONNECTED"
      );
    } catch (error) {
      this.logger.warn({ error }, "MicrophoneManager handler error");
    }
  }
}
```

**Migration from old methods:**

- `handleGlassesConnectionState(modelName, status)` → `updateDeviceState({ connected, modelName })`
- `setCurrentModel(modelName)` → `updateDeviceState({ modelName })`

### Mobile: RestComms Method

**File:** `mobile/src/services/RestComms.ts`

```typescript
import type { GlassesInfo } from "@mentra/types";

public async updateDeviceState(payload: Partial<GlassesInfo>): Promise<void> {
  this.validateToken();

  console.log(
    `${this.TAG}: Updating device state - connected: ${payload.connected}, model: ${payload.modelName}`
  );

  try {
    const response = await this.makeRequest({
      method: "POST",
      url: `${this.getBaseUrl()}/api/client/device/state`,
      headers: this.createAuthHeaders(),
      data: payload,
    });

    console.log(`${this.TAG}: Device state updated successfully`);
    return response;
  } catch (error) {
    console.error(`${this.TAG}: Failed to update device state:`, error);
    throw error;
  }
}
```

### Mobile: CoreStatusProvider

**File:** `mobile/src/contexts/CoreStatusProvider.tsx`

```typescript
import restComms from "@/services/RestComms"
import type {GlassesInfo} from "@mentra/types"

const refreshStatus = useCallback((data: any) => {
  if (!(data && "core_status" in data)) return

  const parsedStatus = CoreStatusParser.parseStatus(data)

  setStatus((prevStatus) => {
    const diff = deepCompare(prevStatus, parsedStatus)
    if (diff.length === 0) return prevStatus

    // Build partial update with only changed properties
    const payload: Partial<GlassesInfo> = {
      connected: Boolean(parsedStatus.glasses_info?.model_name),
      modelName: parsedStatus.glasses_info?.model_name || null,
      timestamp: new Date().toISOString(),
    }

    // Add WiFi info if available
    if (parsedStatus.glasses_info?.glasses_use_wifi) {
      payload.wifiConnected = parsedStatus.glasses_info.glasses_wifi_connected || false
      payload.wifiSsid = parsedStatus.glasses_info.glasses_wifi_ssid || null
    }

    // Send partial update to cloud
    restComms.updateDeviceState(payload).catch((error) => {
      console.error("Failed to sync device state:", error)
    })

    return parsedStatus
  })
}, [])
```

## Data Flow Examples

### Glasses Connect

```
1. User pairs glasses
2. Core: connected_glasses.model_name = "Even Realities G1"
3. Mobile: POST /api/client/device/state
   Partial<GlassesInfo> {
     connected: true,
     modelName: "Even Realities G1",
     timestamp: "2025-01-11T20:34:07Z"
   }
4. Cloud: Merges into userSession.glassesConnected = true
5. Cloud: Detects capabilities { hasDisplay: true, hasCamera: true }
6. Display requests now succeed ✅
```

### WiFi Connect (Mentra Live)

```
1. Glasses connect to WiFi "Home-Network"
2. Core: glasses_wifi_connected = true
3. Mobile: POST /api/client/device/state
   Partial<GlassesInfo> {
     wifiConnected: true,
     wifiSsid: "Home-Network",
     timestamp: "2025-01-11T20:35:12Z"
   }
4. Cloud: Merges WiFi state into userSession.lastGlassesConnectionState
5. Streaming operations allowed ✅
```

### Glasses Disconnect

```
1. Bluetooth disconnects
2. Core: connected_glasses = null
3. Mobile: POST /api/client/device/state
   Partial<GlassesInfo> {
     connected: false,
     modelName: null,
     timestamp: "2025-01-11T20:40:00Z"
   }
4. Cloud: Merges into userSession.glassesConnected = false
5. Display requests rejected with GLASSES_DISCONNECTED ✅
```

## Backward Compatibility

### Deployment 1: Add REST (Keep WebSocket)

Cloud keeps WebSocket handler:

```typescript
// websocket-glasses.service.ts - KEEP THIS FOR NOW
case GlassesToCloudMessageType.GLASSES_CONNECTION_STATE:
  await this.handleGlassesConnectionState(userSession, message);
  break;
```

Old clients: Use WebSocket (works)
New clients: Use REST (works)

### Deployment 2: Remove WebSocket

Remove WebSocket handler:

```typescript
// websocket-glasses.service.ts - DELETE THIS
case GlassesToCloudMessageType.GLASSES_CONNECTION_STATE:
  // DELETED
```

Old clients: Break (acceptable)
New clients: Continue with REST

### Mobile: Remove After Deployment 2

Remove `SocketComms.sendGlassesConnectionState()`:

```typescript
// mobile/src/services/SocketComms.ts - DELETE THIS
private constructor() {
  // DELETE: Zustand subscription
  // DELETE: sendGlassesConnectionState() method
}
```

Clean codebase: REST for state, WebSocket only for streams.

## Testing

### Manual Testing

1. Connect glasses → verify display requests succeed
2. Disconnect glasses → verify display requests fail
3. WiFi connect (Mentra Live) → verify streaming allowed
4. Rapid connect/disconnect → verify state tracks correctly

### Monitor

- `/api/client/device/state` latency (target: <50ms p95)
- Success rate (target: >99.9%)
- Display request success rate (target: 100% when connected)
- `GLASSES_DISCONNECTED` errors (target: 0 for actually-connected glasses)

## Why REST Not WebSocket

| WebSocket        | REST                  |
| ---------------- | --------------------- |
| Fire-and-forget  | Confirmed (HTTP 200)  |
| No retry         | Can retry             |
| Event stream     | Explicit state update |
| Hard to debug    | HTTP logs             |
| Timing-dependent | Always works          |

REST is right tool for state updates. WebSocket is for real-time streams (audio, transcription, button events).
