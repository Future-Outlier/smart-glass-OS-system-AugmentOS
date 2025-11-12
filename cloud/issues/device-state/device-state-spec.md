# Device State REST API - Spec

## Type Definition

Uses shared type from `@mentra/types`:

```typescript
// cloud/packages/types/src/device.ts
export interface GlassesInfo {
  // Connection state
  connected: boolean

  // Device identification
  modelName: string
  androidVersion?: string
  fwVersion?: string
  buildNumber?: string
  otaVersionUrl?: string
  appVersion?: string
  bluetoothName?: string
  serialNumber?: string
  style?: string
  color?: string

  // WiFi info (only for WiFi-capable devices)
  wifiConnected?: boolean
  wifiSsid?: string
  wifiLocalIp?: string

  // Battery info
  batteryLevel?: number
  charging?: boolean
  caseBatteryLevel?: number
  caseCharging?: boolean
  caseOpen?: boolean
  caseRemoved?: boolean

  // Hotspot info
  hotspotEnabled?: boolean
  hotspotSsid?: string
  hotspotPassword?: string
  hotspotGatewayIp?: string

  // Metadata
  timestamp?: string
}
```

Client sends `Partial<GlassesInfo>` - only properties that changed.
Cloud updates specified properties, leaves others unchanged.

## What Cloud Uses

Traced through `ConnectionValidator`, `DeviceManager`, and validation code.

**Primary (always used):**

- `connected: boolean` - For `ConnectionValidator.validateForHardwareRequest()`
- `modelName: string` - For capability detection (`hasDisplay`, `hasCamera`, etc.)

**Secondary (conditional):**

- `wifiConnected?: boolean` - For `ConnectionValidator.validateWifiForOperation()`
- `wifiSsid?: string` - For logging/debugging
- `timestamp?: string` - For staleness detection (warns if >60s old)

**Future (not yet used, but available):**

- Device metadata (androidVersion, fwVersion, etc.) - For analytics/debugging
- Battery info - Already sent via `GLASSES_BATTERY_UPDATE` stream (could consolidate)
- Hotspot info - Currently mobile UI only (could be used for connectivity troubleshooting)

## Current Problem

Mobile maintains two separate states:

- `CoreStatusProvider.status.glasses_info.model_name` (from Android Core) ✅
- `useGlassesStore.connected` (Zustand) ❌ Never synced

`SocketComms.sendGlassesConnectionState()` reads stale Zustand store → sends "DISCONNECTED" even when glasses ARE connected → cloud validation fails.

Production error:

```json
{
  "error": "Cannot process display request - smart glasses are not connected",
  "errorCode": "GLASSES_DISCONNECTED",
  "connectionStatus": "WebSocket: OPEN, Phone: Connected, Glasses: Disconnected"
}
```

## API Contract

### Request

```
POST /api/client/device/state
Authorization: Bearer {coreToken}
Content-Type: application/json

Body: Partial<GlassesInfo>
```

Only send properties that changed. Cloud updates specified fields.

**Examples:**

Glasses connected (BLE only):

```typescript
{
  connected: true,
  modelName: "Even Realities G1",
  timestamp: "2025-01-11T20:34:07.253Z"
}
```

Glasses connected (WiFi capable):

```typescript
{
  connected: true,
  modelName: "Mentra Live",
  wifiConnected: true,
  wifiSsid: "Home-Network",
  timestamp: "2025-01-11T20:34:07.253Z"
}
```

WiFi status change only:

```typescript
{
  wifiConnected: false,
  wifiSsid: null,
  timestamp: "2025-01-11T20:35:12.253Z"
}
```

Glasses disconnected:

```typescript
{
  connected: false,
  modelName: null,
  timestamp: "2025-01-11T20:40:00.253Z"
}
```

### Response (200 OK)

```typescript
{
  success: true,
  appliedState: {
    connected: boolean,
    modelName: string | null,
    capabilities: {
      hasDisplay: boolean,
      hasCamera: boolean,
      hasMicrophone: boolean,
      hasWifi: boolean
    }
  },
  timestamp: string
}
```

### Response (400 Bad Request)

```typescript
{
  success: false,
  error: "Invalid payload",
  message: "connected field required (boolean)",
  timestamp: string
}
```

### Response (401 Unauthorized)

```typescript
{
  success: false,
  error: "No active session",
  message: "WebSocket session required for device state updates",
  timestamp: string
}
```

## Cloud Processing

```typescript
// Handler calls DeviceManager with partial update
await userSession.deviceManager.updateDeviceState(payload)

// DeviceManager.updateDeviceState() handles:
// 1. Merge into UserSession (for validation)
//    - userSession.glassesConnected
//    - userSession.glassesModel
//    - userSession.lastGlassesConnectionState
//
// 2. Update capabilities (if model changed)
//    - Detect capabilities from model
//    - Stop incompatible apps
//    - Update DB + PostHog analytics
//
// 3. Notify MicrophoneManager (if connection changed)
//    - handleConnectionStateChange("CONNECTED" | "DISCONNECTED")
```

## Mobile Integration

````typescript
// CoreStatusProvider.tsx - when Core reports connection change
const payload: Partial<GlassesInfo> = {
  connected: Boolean(parsedStatus.glasses_info?.model_name),
  modelName: parsedStatus.glasses_info?.model_name || null,
  timestamp: new Date().toISOString()
}

// Add WiFi info if available
if (parsedStatus.glasses_info?.glasses_use_wifi) {
  payload.wifiConnected = parsedStatus.glasses_info.glasses_wifi_connected || false
  payload.wifiSsid = parsedStatus.glasses_info.glasses_wifi_ssid || null
}

// Send only changed properties
restComms.updateDeviceState(payload)
```</text>


## Deployment Strategy

1. **Deploy cloud endpoint** - New REST endpoint, keep WebSocket handler (backward compat)
2. **Deploy mobile** - Add REST call, old clients continue using WebSocket
3. **Next deployment** - Remove WebSocket `GLASSES_CONNECTION_STATE` handler (breaks old clients)

No feature flag. Old clients work until step 3 (acceptable breakage).

Goal: Move state updates to REST, keep WebSocket only for real-time streams (audio, transcription, button events).

## Validation

**Middleware:** `clientAuthWithUserSession` (requires active WebSocket session)

**Payload validation:**
- If `connected=true` is sent, `modelName` must also be provided
- All properties are optional (partial update)
- Types validated against `GlassesInfo` interface

## DeviceManager Refactor

**New method:**
```typescript
deviceManager.updateDeviceState(payload: Partial<GlassesInfo>): Promise<void>
````

**Replaces:**

- `handleGlassesConnectionState(modelName, status)` - Old WebSocket handler
- `setCurrentModel(modelName)` - Old settings API handler

**Benefits:**

- Single entry point for all device state updates
- Works for both REST and WebSocket
- Handles partial updates naturally
- Clear naming: "update" + "device state"

## Success Criteria

- Display requests succeed 100% when glasses connected
- Zero `GLASSES_DISCONNECTED` errors for actually-connected glasses
- API p95 latency <50ms
- WebSocket handler removed by next deployment
