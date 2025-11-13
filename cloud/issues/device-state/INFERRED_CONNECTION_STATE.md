# Connection State Inference from Model Name

## Overview

The cloud now automatically infers the glasses connection state from the presence of a `modelName` in device state updates. This simplifies the mobile client implementation and reduces the chance of state mismatches.

## The Problem We Solved

**Before:**

- Mobile had to send both `connected: true` AND `modelName: "Mentra Live"`
- Easy to have mismatched state (modelName set but connected: false)
- Redundant data - if we know the model, glasses must be connected
- Mobile wasn't sending `connected` flag, causing validation failures

**After:**

- Mobile only needs to send `modelName`
- Cloud automatically infers `connected: true` when modelName is present
- Cloud automatically infers `connected: false` when modelName is null/empty
- Simpler, less error-prone, more intuitive

## Implementation

### DeviceManager Logic

```typescript
// In DeviceManager.updateDeviceState()

if (payload.modelName && payload.connected === undefined) {
  payload.connected = true
  // Log: "Inferred connected=true from modelName"
}

if ((payload.modelName === null || payload.modelName === "") && payload.connected === undefined) {
  payload.connected = false
  // Log: "Inferred connected=false from empty/null modelName"
}
```

### API Endpoint

The REST endpoint `/api/client/device/state` no longer requires the `connected` field. It's completely optional.

## Usage Examples

### Glasses Connect

Mobile sends:

```json
{
  "modelName": "Mentra Live"
}
```

Cloud infers:

```json
{
  "connected": true,
  "modelName": "Mentra Live"
}
```

### Glasses Disconnect

Mobile sends:

```json
{
  "modelName": null
}
```

Cloud infers:

```json
{
  "connected": false,
  "modelName": null
}
```

### Explicit Connection State (Still Supported)

Mobile can still explicitly send `connected` if needed:

```json
{
  "connected": true,
  "modelName": "Mentra Live"
}
```

This will not be overridden - explicit values take precedence.

## Benefits

### 1. Simpler Mobile Implementation

```typescript
// Mobile code - just send the model name
await RestComms.updateDeviceState({
  modelName: glasses.modelName, // Cloud handles the rest
})
```

### 2. No State Mismatches

Can't have:

- `connected: true` with `modelName: null` ❌
- `connected: false` with `modelName: "Mentra Live"` ❌

The connection state is derived directly from the model name.

### 3. Backward Compatible

- Old code that sends `connected` explicitly still works
- New code that only sends `modelName` works
- No breaking changes

### 4. Intuitive Semantics

"Here's the glasses model" naturally means "glasses are connected"
"No glasses model" naturally means "glasses are disconnected"

## Logging

New debug logs help trace the inference:

```json
{
  "level": "debug",
  "feature": "device-state",
  "message": "Inferred connected=true from modelName",
  "modelName": "Mentra Live"
}
```

```json
{
  "level": "debug",
  "feature": "device-state",
  "message": "Inferred connected=false from empty/null modelName"
}
```

## Testing

### Better Stack Query

```
feature:"device-state" AND message:"Inferred connected"
```

This shows all instances where connection state was automatically inferred.

### Expected Flow

1. Mobile detects glasses connected
2. Mobile sends: `POST /api/client/device/state` with `{ modelName: "Mentra Live" }`
3. Cloud logs: "Updating device state" with `payload: { modelName: "Mentra Live" }`
4. Cloud logs: "Inferred connected=true from modelName"
5. Cloud logs: "Device state updated successfully" with `connected: true`
6. Display requests now succeed ✅

## Migration Notes

### Mobile Team

No changes required! Your existing code that sends just `modelName` now works correctly.

If you want to be explicit, you can still send `connected` too.

### Cloud Team

The inference happens in `DeviceManager.updateDeviceState()` before any other processing.

### API Consumers

The API response now includes both inferred flags:

```json
{
  "success": true,
  "appliedState": {
    "isGlassesConnected": true,
    "isPhoneConnected": true,
    "modelName": "Mentra Live",
    "capabilities": { ... }
  }
}
```

## Edge Cases

### Both Fields Provided

```json
{
  "connected": false,
  "modelName": "Mentra Live"
}
```

**Result:** Explicit `connected: false` is respected, no inference happens.
**Warning:** This creates inconsistent state and should be avoided.

### Empty String vs Null

Both are treated as "disconnected":

```json
{ "modelName": "" }      // → connected: false
{ "modelName": null }    // → connected: false
{ "modelName": undefined } // → connected: false (no change to existing state)
```

### Only WiFi Fields Updated

```json
{
  "wifiConnected": true,
  "wifiSsid": "MyNetwork"
}
```

**Result:** No inference, `connected` state unchanged.

## Related Changes

- **File:** `DeviceManager.ts` - Added inference logic
- **File:** `device-state.api.ts` - Removed validation requiring `connected` field
- **File:** `BETTER_STACK_FILTERING.md` - Updated with inference info

## Rollout

- ✅ Cloud deployed with inference logic
- ✅ Backward compatible - no mobile changes required
- ✅ All existing mobile code continues to work
- ✅ New mobile code can simplify by omitting `connected` field

## Future Considerations

### Could We Remove `connected` Field Entirely?

Potentially yes, but keeping it allows:

1. Explicit disconnection without changing model
2. Backward compatibility
3. Edge cases where model is set but glasses aren't actually connected

For now, we'll keep both approaches supported.
