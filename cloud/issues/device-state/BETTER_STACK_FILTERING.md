# Better Stack Filtering Guide - Device State Testing

## Overview

All logs related to the device state system now include a `feature: "device-state"` tag for easy filtering in Better Stack.

## Better Stack Query

To see all device-state related logs for your testing:

```
feature:"device-state"
```

To filter by specific user:

```
feature:"device-state" AND userId:"isaiah@mentra.glass"
```

To filter by time range and user:

```
feature:"device-state" AND userId:"isaiah@mentra.glass" AND dt:[2025-11-13T18:40:00 TO 2025-11-13T18:45:00]
```

## What's Tagged

All logs with `feature: "device-state"` include:

### 1. Device State API Endpoint (`device-state.api.ts`)

- Device state update requests received
- Device state update errors
- Logs when the REST endpoint `/api/client/device/state` is called
- Note: `connected` state is automatically inferred from `modelName` (modelName present = connected)

### 2. DeviceManager (`DeviceManager.ts`)

- Initial device state update received
- Connection state inference logs ("Inferred connected=true from modelName")
- Device state updated successfully (with before/after state)
- Model changes and capability updates
- Glasses connection state changes (CONNECTED/DISCONNECTED)
- MicrophoneManager integration errors
- PostHog analytics errors

### 3. ConnectionValidator (`ConnectionValidator.ts`)

- Hardware request validation (display, photo, audio, sensor, stream)
- Validation success/failure
- Glasses connection checks
- WiFi validation
- WebSocket validation
- Stale connection warnings
- Validation bypass (when VALIDATION_ENABLED=false)

### 4. DisplayManager (`DisplayManager6.1.ts`)

- Display request validation failures
- Shows error code, connection status, glasses model
- Includes requestType: "display"

### 5. WebSocket App Service (`websocket-app.service.ts`)

- Display requests received from Apps
- Includes packageName and requestType: "display"

## Example Testing Flow

When you make a display request, you should see logs in this order:

1. **App sends display request**

   ```
   service:"websocket-app.service"
   feature:"device-state"
   message:"Received display request from App"
   ```

2. **Validation check**

   ```
   feature:"device-state"
   message:"Hardware request validation successful" OR "Hardware request validation failed"
   ```

3. **Display result**
   ```
   service:"DisplayManager"
   feature:"device-state"
   message:"Display request validation failed" (if validation failed)
   ```

## Debugging Your Current Issue

For the error you're seeing:

```json
{
  "error": "Glasses not connected",
  "message": "Hardware request validation failed - glasses not connected"
}
```

Run this query to trace the full flow:

```
feature:"device-state" AND userId:"isaiah@mentra.glass" AND dt:[2025-11-13T18:40:00 TO 2025-11-13T18:45:00]
```

Look for:

1. ✅ Did device state update arrive? (Look for "Updating device state")
2. ✅ Was it processed? (Look for "Device state updated successfully")
3. ✅ What state was set? (Check `connected`, `modelName` fields)
4. ❌ Why did validation fail? (Check "Hardware request validation failed")

## Common Queries

### See all device state updates for a user

```
feature:"device-state" AND userId:"isaiah@mentra.glass" AND message:"Device state updated successfully"
```

### See all validation failures

```
feature:"device-state" AND message:"Hardware request validation failed"
```

### See all glasses connection changes

```
feature:"device-state" AND message:"Handling GLASSES_CONNECTION_STATE"
```

### See all display requests and their validation

```
feature:"device-state" AND requestType:"display"
```

## Tips

- Use the timeline view in Better Stack to see the sequence of events
- Check the `glassesModel` field to see what model ConnectionValidator thinks is connected
- Check the `connected` field in "Device state updated successfully" logs to verify state
- The `connectionStatus` field shows the full connection summary (WebSocket, phone, glasses)
- Look for "Inferred connected=true from modelName" logs to see when connection is auto-detected
- Mobile client only needs to send `modelName` - `connected` is inferred automatically
