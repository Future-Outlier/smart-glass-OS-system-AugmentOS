# BES & MTK Sequential Firmware OTA Update Plan

## Executive Summary

This document outlines the implementation plan for adding sequential firmware patch support for BES and MTK firmwares to the Mentra Live OTA system. Unlike the APK updates which simply install the latest version, BES and MTK firmware patches are **sequential** and must be applied in a specific order from a starting version to an ending version.

## Current State Analysis

### What We Have

**ASG Client OTA (Working)**
- Location: `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/helpers/OtaHelper.java`
- Schema: Simple versionCode comparison - if server versionCode > current, download and install
- Works well because APK can update to any newer version

**BES Firmware OTA (Partially Implemented)**
- Location: `asg_client/app/src/main/java/com/mentra/asg_client/io/bes/BesOtaManager.java`
- Code for applying patches exists and works
- Missing: Logic for finding the correct patch based on current version
- Current version retrieval: `BesOtaManager.getCurrentFirmwareVersion()` - returns `byte[4]` (major.minor.patch.build)
- **Problem**: Version is only populated during OTA process (after sending `GetFirmwareVersion` command 0x8e)
- **Solution Needed**: Query BES version on startup before checking for updates

**MTK Firmware OTA (Partially Implemented)**
- Location: `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/helpers/OtaHelper.java` (checkAndUpdateMtkFirmware method)
- Code for applying patches exists via `SysControl.installOTA(context, path)`
- Missing: Logic for finding the correct patch based on current version
- Current version retrieval: `SysControl.getSystemCurrentVersion(context)` - reads `ro.custom.ota.version` system property
- Format: `YYYYMMDD` (e.g., "20241130")

**Current live_version.json Schema**
```json
{
  "versionCode": 28,
  "apkUrl": "https://github.com/.../asg-client-28.apk",
  "sha256": "aa8c52c4..."
}
```

**Extended Schema in Code (Never Deployed - Will Be Removed)**
```json
{
  "mtk_firmware": { ... },
  "bes_firmware": { ... }
}
```
This schema was added to the code but never deployed to production. We're replacing it with the patches array approach below.

## Problem Statement

1. **Sequential Patch Requirement**: BES and MTK patches are designed to update from version A to version B. You cannot skip intermediate versions.

2. **Patch Selection Logic**: Need to match current device version with the correct patch that has `start_version == current_version`.

3. **Update Order**: If both MTK and BES updates are available:
   - MTK installs but only applies after reboot
   - BES installs and automatically reboots
   - **Therefore**: If both are needed, apply MTK first, then BES (which triggers reboot)

4. **Version Retrieval**: Need reliable way to get current BES version before OTA check (currently only retrieved during OTA process).

## Proposed Schema Changes

### New live_version.json Schema

```json
{
  "apps": {
    "com.mentra.asg_client": {
      "versionCode": 29,
      "versionName": "29.0",
      "apkUrl": "https://...",
      "sha256": "..."
    },
    "com.augmentos.otaupdater": {
      "versionCode": 200,
      "versionName": "2.0.0",
      "apkUrl": "https://...",
      "sha256": "..."
    }
  },
  "mtk_patches": [
    {
      "start_firmware": "20241130",
      "end_firmware": "20250115",
      "url": "https://ota.mentraglass.com/mtk/20241130_to_20250115.zip"
    },
    {
      "start_firmware": "20250115",
      "end_firmware": "20250125",
      "url": "https://ota.mentraglass.com/mtk/20250115_to_20250125.zip"
    }
  ],
  "bes_patches": [
    {
      "start_firmware": "17.26.1.14",
      "end_firmware": "17.27.0.0",
      "url": "https://ota.mentraglass.com/bes/17.26.1.14_to_17.27.0.0.bin"
    },
    {
      "start_firmware": "17.27.0.0",
      "end_firmware": "17.28.0.0",
      "url": "https://ota.mentraglass.com/bes/17.27.0.0_to_17.28.0.0.bin"
    }
  ]
}
```

### Schema Design Decisions

1. **Array Format**: Using arrays for patches because:
   - Easy to iterate and find matching `start_firmware` version
   - Allows multiple patches to be available simultaneously
   - Clear ordering for future multi-step upgrade paths

2. **Minimal Patch Fields**: Only `start_firmware`, `end_firmware`, and `url` required
   - No SHA256 or fileSize needed for firmware patches
   - Keeps schema simple and easy to maintain

3. **Version String Format**:
   - MTK: `YYYYMMDD` format (existing format from `ro.custom.ota.version`)
   - BES: `major.minor.patch.build` format (e.g., "17.26.1.14" - from `hs_syvr` at boot)

4. **Backward Compatibility**:
   - Support current flat schema: `{ "versionCode": 28, "apkUrl": "...", "sha256": "..." }`
   - New `apps` object takes precedence if present
   - Old `mtk_firmware`/`bes_firmware` objects will be removed from code (never deployed)

## Implementation Plan

### Phase 1: Version Retrieval

#### 1.1 BES Version & MAC - Explicit Query on Startup

**Problem**: The BES chip is *supposed* to automatically send `hs_syvr` at boot with version and MAC addresses. However, the firmware stack is unreliable - sometimes the response arrives too late or not at all. When `sendVersionInfo()` is called (after phone connects), the cached values are often empty.

**Solution**: Explicitly query `sh_syvr` at startup in `K900HardwareManager` and cache the response. This ensures values are populated before the phone ever connects.

**The sh_syvr / hs_syvr Protocol:**
- **Request**: `{"C":"sh_syvr","V":1,"B":""}` (send system version request)
- **Response**: `{"C":"hs_syvr","B":{"version":"17.26.1.14","ble":"Mentra_Live_D627","bt":"Mentra_Live_D627","btaddr":"2c:ba:ca:25:d6:27","bleaddr":"2c:ba:ca:25:d6:27"}}`

**Response fields:**
- `version`: BES/MCU firmware version (e.g., `17.26.1.14`)
- `btaddr`: Bluetooth MAC address (e.g., `2c:ba:ca:25:d6:27`)
- `bleaddr`: BLE MAC address (usually same as btaddr)
- `bt`/`ble`: Bluetooth/BLE device names

**Implementation in K900HardwareManager:**

```java
// In K900HardwareManager.initialize() (called early at ASG Client startup)
@Override
public void initialize() {
    super.initialize();

    // ... existing LED/audio init ...

    // Query BES system version immediately - phone won't connect for a while
    // Response (~50ms) will be cached via K900CommandHandler.handleSystemVersionReport()
    requestSystemVersion();
}

private void requestSystemVersion() {
    try {
        JSONObject request = new JSONObject();
        request.put("C", "sh_syvr");
        request.put("V", 1);
        request.put("B", "");

        // Send via ComManager - response handled by K900CommandHandler
        if (bluetoothManager != null) {
            bluetoothManager.sendData(request.toString().getBytes(StandardCharsets.UTF_8));
            Log.d(TAG, "🔧 Sent sh_syvr request for BES version/MAC");
        }
    } catch (JSONException e) {
        Log.e(TAG, "Failed to send sh_syvr request", e);
    }
}
```

**Timing:**
1. Glasses boot → ASG Client starts → `K900HardwareManager.initialize()` → sends `sh_syvr`
2. BES responds with `hs_syvr` (~50ms) → `K900CommandHandler.handleSystemVersionReport()` caches values
3. Phone connects later (seconds/minutes after boot) → sends `phone_ready`
4. Glasses send `glasses_ready` + version info chunks → values are now populated

**Cached values** (in AsgSettings):
- `mcuFirmwareVersion`: "17.26.1.14" (naming is legacy, but it's the BES version)
- `btMacAddress`: "2c:ba:ca:25:d6:27"

**For OTA patch matching**: Use `AsgSettings.getMcuFirmwareVersion()` for BES version string.

#### 1.2 MTK Version - NEEDS TO BE SENT TO PHONE

**Current Implementation**: `SysControl.getSystemCurrentVersion(context)`
- Reads `ro.custom.ota.version` system property
- Returns `YYYYMMDD` format string (e.g., "20241130")
- Already called in `checkAndUpdateMtkFirmware()`

**Problem**: MTK version is NOT currently sent to the phone. For full mobile app integration, the phone needs to know the MTK version to:
1. Determine if an MTK patch is available
2. Show the user what will be updated

**Solution**: Add MTK version to version_info chunks sent to phone. See Phase 4.2 for details.

#### 1.3 Version Summary

| Version | Source | Field Name | Sent in |
|---------|--------|------------|---------|
| MCU FW (BES) | `sh_syvr` query → `hs_syvr` → `AsgSettings.getMcuFirmwareVersion()` | `mcu_fw_version` | `version_info_3` |
| SoC FW (MTK) | `ro.custom.ota.version` → `SysControl.getSystemCurrentVersion()` | `soc_fw_version` | `version_info_3` |
| BT MAC | `sh_syvr` query → `hs_syvr` → cached | `bt_mac_address` | `version_info_3` |
| APK Build | Package manager | `build_number` | `version_info_1` |

**Field naming convention:**
- `mcu_fw_version`: BES chip firmware (the MCU/Bluetooth controller)
- `soc_fw_version`: MTK SoC firmware (the applications processor)
- These names generalize beyond Mentra Live specific chip names

### Phase 2: Schema Parsing Updates

#### 2.1 Update OtaHelper to Parse New Schema

**File**: `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/helpers/OtaHelper.java`

**Changes:**
1. Add method `findMatchingMtkPatch(JSONArray patches, String currentVersion)`
2. Add method `findMatchingBesPatch(JSONArray patches, String currentVersion)`
3. Update `processAppsSequentially()` to check for `mtk_patches` and `bes_patches` arrays
4. Remove old `mtk_firmware`/`bes_firmware` object handling (never deployed, not needed)

**Pseudo-code:**
```java
/**
 * Find a firmware patch matching the current version.
 * @param patches Array of patch objects with start_firmware, end_firmware, url
 * @param currentVersion Current firmware version string (e.g., "20241130" for MTK, "17.26.1.14" for BES)
 * @return Matching patch object, or null if no match or version unknown
 */
private JSONObject findMatchingPatch(JSONArray patches, String currentVersion) {
    if (currentVersion == null || currentVersion.isEmpty()) {
        Log.w(TAG, "Cannot match patch - current version unknown");
        return null;
    }
    for (int i = 0; i < patches.length(); i++) {
        JSONObject patch = patches.getJSONObject(i);
        if (patch.getString("start_firmware").equals(currentVersion)) {
            return patch;
        }
    }
    return null; // No patch available for this version
}

// Usage:
// MTK: findMatchingPatch(mtkPatches, SysControl.getSystemCurrentVersion(context))
// BES: findMatchingPatch(besPatches, AsgSettings.getMcuFirmwareVersion())
```

### Phase 3: Update Priority Logic

#### 3.1 Correct Order: MTK First, Then BES

**Current Code** (OtaHelper.java line 569-574):
```java
// PHASE 3: Update BES firmware (only if no APK update and no MTK update)
else if (!apkUpdateNeeded && !mtkUpdateStarted && rootJson.has("bes_firmware")) {
    Log.i(TAG, "No APK or MTK updates needed - checking BES firmware");
    checkAndUpdateBesFirmware(rootJson.getJSONObject("bes_firmware"), context);
}
```

**Problem**: This skips BES if MTK was started, but we need to apply BOTH if available.

**Solution**: Change logic to:
1. Check for MTK patch first
2. Check for BES patch second
3. If BOTH are available:
   - Download and stage MTK update (don't reboot yet)
   - Download and apply BES update (this triggers reboot)
   - MTK update applies during reboot

**Updated Logic:**
```java
// PHASE 2 & 3: Firmware updates (MTK first, then BES)
if (!apkUpdateNeeded) {
    JSONObject mtkPatch = null;
    JSONObject besPatch = null;

    // Find matching MTK patch
    if (rootJson.has("mtk_patches")) {
        String currentMtkVersion = SysControl.getSystemCurrentVersion(context);
        mtkPatch = findMatchingMtkPatch(rootJson.getJSONArray("mtk_patches"), currentMtkVersion);
    }

    // Find matching BES patch
    // BES version comes from hs_syvr at boot, cached in AsgSettings
    if (rootJson.has("bes_patches")) {
        String currentBesVersion = AsgSettings.getMcuFirmwareVersion(); // e.g., "17.26.1.14"
        besPatch = findMatchingBesPatch(rootJson.getJSONArray("bes_patches"), currentBesVersion);
    }

    // Apply updates in correct order
    if (mtkPatch != null && besPatch != null) {
        // Both available - MTK stages, BES applies and triggers reboot
        Log.i(TAG, "Both MTK and BES patches available - applying MTK first, then BES");
        downloadAndStageMtkFirmware(mtkPatch, context); // Downloads, stages, does NOT reboot
        checkAndUpdateBesFirmware(besPatch, context);   // Downloads, applies, triggers reboot
    } else if (mtkPatch != null) {
        // Only MTK - apply normally (stages, needs reboot)
        checkAndUpdateMtkFirmware(mtkPatch, context);
    } else if (besPatch != null) {
        // Only BES - apply normally (triggers reboot)
        checkAndUpdateBesFirmware(besPatch, context);
    }
}
```

### Phase 4: Mobile App Integration

#### Current Mobile App OTA Flow

The mobile app currently handles OTA as follows:

1. **Update Detection** (`mobile/src/effects/OtaUpdateChecker.tsx`):
   - Fetches `live_version.json` from glasses' `otaVersionUrl`
   - Compares `versionCode` with glasses' `buildNumber`
   - Shows alert if update available (different UX for WiFi connected vs not)

2. **Update Initiation** (`mobile/src/app/ota/progress.tsx`):
   - Sends `ota_start` command to glasses via BLE: `CoreModule.sendOtaStart()`
   - JSON message: `{type: "ota_start", timestamp: <ms>}`

3. **Progress Monitoring**:
   - Glasses send `ota_update_available` message with update info
   - Glasses send `ota_progress` messages during download/install
   - Mobile app watches for `otaProgress` in Zustand store
   - Detects completion via status change or build number increase

#### Mobile App Changes Needed

**4.1 Update `OtaUpdateChecker.tsx`**

Currently only checks `versionCode` for APK. Need to also check for firmware patches.

**Approach: Full Integration**
- Mobile app parses `mtk_patches` and `bes_patches` arrays
- Mobile app receives current MTK/BES versions from glasses (via core_status)
- Mobile app determines which patches are applicable
- Mobile app shows user exactly what will be updated (APK, MTK, BES)
- No half measures.

**4.2 Flexible version_info Parsing (Refactor)**

The current version_info chunking is brittle - hardcoded chunk expectations, waiting for specific chunks before processing. We should refactor to be flexible and future-proof.

**Current Problems:**
1. SGC waits for `version_info_1` + `version_info_2` before sending anything to RN
2. Hardcoded field expectations in SGC and Bridge
3. Adding new fields requires changes at multiple layers
4. MTU issues with `version_info_2` (OTA URL is long, BES MAC not showing)

**Solution: Flexible Parsing with Immediate Updates**

**Key Discovery**: The RN store already supports partial updates:
```typescript
setGlassesInfo: info => set(state => ({...state, ...info}))
```

This means we can send fields 1-by-1 as they arrive, and RN accumulates them automatically.

**New Architecture:**

1. **Glasses (ASG Client)**: Can send any `version_info*` message with any fields
   - Split chunks however makes sense for MTU
   - Add new fields anytime without phone-side changes

2. **SGC Layer (MentraLive.java/swift)**: Flexible parsing
   - Match any message type starting with `version_info`
   - Extract ALL fields from the message (except `type`)
   - Immediately send to RN via `Bridge.sendVersionInfo(fields)`
   - No waiting, no merging, no hardcoded field expectations

3. **Bridge**: Accept generic map instead of hardcoded params
   ```kotlin
   // OLD: sendVersionInfo(appVersion, buildNumber, deviceModel, ...)
   // NEW: sendVersionInfo(fields: Map<String, Any>)
   fun sendVersionInfo(fields: Map<String, Any>) {
       sendTypedMessage("version_info", fields)
   }
   ```

4. **RN (MantleBridge)**: Already works - no changes needed
   - `setGlassesInfo({...state, ...info})` merges partial updates

**SGC Implementation (MentraLive.java):**
```java
// Instead of separate cases for version_info_1, version_info_2, etc:
default:
    if (type.startsWith("version_info")) {
        // Flexible parsing - extract all fields and send immediately
        Map<String, Object> fields = new HashMap<>();
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!key.equals("type")) {
                fields.put(key, json.opt(key));
            }
        }
        Bridge.sendVersionInfo(fields);

        // Also update local SGCManager fields for any we recognize
        if (fields.containsKey("app_version")) glassesAppVersion = (String) fields.get("app_version");
        if (fields.containsKey("build_number")) glassesBuildNumber = (String) fields.get("build_number");
        // ... etc
    }
    break;
```

**New Chunking Strategy (Glasses-side):**

With flexible parsing, we can split chunks optimally for MTU:

```
version_info_1: app_version, build_number, device_model, android_version  (small, ~120 bytes)
version_info_2: ota_version_url                                           (just the long URL - isolated due to size)
version_info_3: mcu_fw_version, soc_fw_version, bt_mac_address            (hardware/firmware info)
```

**Note**: `version_info_2` previously included `firmware_version` and `bt_mac_address`, but these are moving to `version_info_3`. Since we can ensure all users are on the latest mobile app, and the new flexible parsing handles any fields in any chunk, this is a clean break.

Or even send each field separately if needed - the phone handles it.

**Benefits:**
- Future-proof: Add new fields on glasses, phone automatically receives them
- No more MTU issues: Split chunks as small as needed
- Simpler code: No chunk waiting/merging logic in SGC
- Backwards compatible: Old glasses still work (just send fewer fields)

**GlassesInfo Interface Update:**
```typescript
interface GlassesInfo {
  // Existing fields
  appVersion?: string
  buildNumber?: string
  modelName?: string
  androidVersion?: string
  otaVersionUrl?: string
  btMacAddress?: string
  // New generalized firmware version fields
  mcuFwVersion?: string   // MCU/BES firmware version (e.g., "17.26.1.14")
  socFwVersion?: string   // SoC/MTK firmware version (e.g., "20241130")
  // Legacy field (keep for backwards compat with old glasses)
  fwVersion?: string      // Old name for MCU firmware version
}
```

**Field Mapping (glasses → phone):**
- `mcu_fw_version` → `mcuFwVersion`
- `soc_fw_version` → `socFwVersion`
- `firmware_version` → `fwVersion` (legacy, from old glasses)

**Backwards Compatibility:**
- New phone + old glasses: Works - receives `firmware_version`, maps to `fwVersion`
- Old phone + new glasses: Works - old phone ignores unknown fields like `mcu_fw_version`
- New phone + new glasses: Uses `mcuFwVersion` and `socFwVersion` for OTA patch matching

**4.3 Update `OtaUpdateChecker.tsx` to Parse Patches**

```typescript
interface FirmwarePatch {
  start_firmware: string
  end_firmware: string
  url: string
}

interface VersionJson {
  apps?: { [packageName: string]: VersionInfo }
  mtk_patches?: FirmwarePatch[]
  bes_patches?: FirmwarePatch[]
  // Legacy flat format
  versionCode?: number
  apkUrl?: string
  sha256?: string
}

function findMatchingPatch(
  patches: FirmwarePatch[] | undefined,
  currentVersion: string
): FirmwarePatch | null {
  if (!patches || !currentVersion) return null
  return patches.find(p => p.start_firmware === currentVersion) || null
}

// Called with values from GlassesInfo store:
// - currentSocVersion = glassesInfo.socFwVersion (MTK)
// - currentMcuVersion = glassesInfo.mcuFwVersion (BES)
export async function checkForOtaUpdate(
  otaVersionUrl: string,
  currentBuildNumber: string,
  currentSocVersion: string,   // MTK/SoC firmware version
  currentMcuVersion: string,   // BES/MCU firmware version
): Promise<OtaUpdateAvailable> {
  const versionJson = await fetchVersionInfo(otaVersionUrl)

  const apkUpdateAvailable = checkVersionUpdateAvailable(currentBuildNumber, versionJson)
  const mtkPatch = findMatchingPatch(versionJson?.mtk_patches, currentSocVersion)
  const besPatch = findMatchingPatch(versionJson?.bes_patches, currentMcuVersion)

  const updates: string[] = []
  if (apkUpdateAvailable) updates.push("apk")
  if (mtkPatch) updates.push("mtk")
  if (besPatch) updates.push("bes")

  return {
    hasCheckCompleted: true,
    updateAvailable: updates.length > 0,
    updates: updates,
    latestVersionInfo: getLatestVersionInfo(versionJson),
    mtkPatch: mtkPatch,
    besPatch: besPatch,
  }
}
```

**4.4 Update Alert to Show What Will Be Updated**

```typescript
// In OtaUpdateChecker.tsx
const updateList = updates.join(", ").toUpperCase()  // "APK, MTK, BES"
showAlert(
  translate("ota:updateAvailable", {deviceName}),
  `Updates available: ${updateList}\n\n${translate("ota:updateReadyToInstall", {...})}`,
  [...]
)
```

**4.5 Update `OtaUpdateInfo` Type**

```typescript
export interface OtaUpdateInfo {
  available: boolean
  versionCode: number
  versionName: string
  updates: string[]  // ["apk", "mtk", "bes"]
  totalSize: number
  // New fields for firmware patches
  mtkPatch: { start: string, end: string, url: string } | null
  besPatch: { start: string, end: string, url: string } | null
}
```

**4.6 Progress Screen Updates** (`mobile/src/app/ota/progress.tsx`)

Current progress screen tracks:
- `starting` → `downloading` → `installing` → `completed`

**Enhanced states to show what's being updated:**
```typescript
type UpdateComponent = "apk" | "mtk" | "bes"

// Watch otaProgress.current_update to show which component
const currentComponent = otaProgress?.currentUpdate as UpdateComponent

// In renderContent():
if (progressState === "downloading") {
  const componentName = {
    apk: "Software",
    mtk: "System Firmware",
    bes: "Bluetooth Firmware"
  }[currentComponent] || "Update"

  return (
    <Text text={`Downloading ${componentName}...`} />
    <Text text={`${progress}%`} />
  )
}
```

**Update `OtaProgress` type:**
```typescript
export interface OtaProgress {
  stage: OtaStage
  status: OtaStatus
  progress: number
  bytesDownloaded: number
  totalBytes: number
  currentUpdate: "apk" | "mtk" | "bes"  // Which component is being updated
  errorMessage?: string
}
```

**4.7 Glasses → Phone Messages**

Glasses send to phone via `CommunicationManager.sendOtaUpdateAvailable()`:

```json
{
  "type": "ota_update_available",
  "available": true,
  "version_code": 29,
  "version_name": "29.0",
  "updates": ["apk", "mtk", "bes"],
  "total_size": 52428800
}
```

Glasses send progress via `CommunicationManager.sendOtaProgress()`:

```json
{
  "type": "ota_progress",
  "stage": "download",
  "status": "PROGRESS",
  "progress": 45,
  "bytes_downloaded": 23456789,
  "total_bytes": 52428800,
  "current_update": "apk"
}
```

**Enhancement**: Add `current_update` field to indicate which component is being updated (apk, mtk, or bes).

### Phase 5: Server Infrastructure

#### 5.1 OTA Website Updates

**Location**: `asg_client/ota_website/live_version.json`

**Tasks:**
1. Update JSON schema to include `mtk_patches` and `bes_patches` arrays
2. Host firmware files on CDN/storage
3. Add CI/CD to generate SHA256 hashes
4. Version control for firmware binaries

#### 5.2 Naming Convention for Patch Files

```
/ota.mentraglass.com/
├── live_version.json
├── apk/
│   └── asg-client-29.apk
├── mtk/
│   ├── 20241130_to_20250115.zip
│   └── 20250115_to_20250125.zip
└── bes/
    ├── 17.26.1.14_to_17.27.0.0.bin
    └── 17.27.0.0_to_17.28.0.0.bin
```

## Open Questions

### RESOLVED Questions

1. **~~How to reliably get BES/MCU version before OTA?~~**
   - ✅ RESOLVED: Explicitly query `sh_syvr` at boot in `K900HardwareManager.initialize()`
   - BES chip responds with `hs_syvr` containing version + MAC (~50ms response)
   - Cached via `AsgSettings.setMcuFirmwareVersion()`
   - Will be sent to phone as `mcu_fw_version` in `version_info_3`
   - Format: `major.minor.patch.build` (e.g., `17.26.1.14`)
   - Note: BES is *supposed* to auto-send this at boot, but firmware stack is unreliable - explicit query is best practice

### Remaining Questions for Mr. Liu

#### BES Firmware

1. **What BES version ships on Batch 1 units?**
   - Need this to create the first `bes_patches` entry in `live_version.json`

2. **Are there any constraints on when BES OTA can run?**
   - Battery requirements?
   - BLE connection state requirements?

#### MTK Firmware

1. **What MTK version ships on Batch 1 units?**
   - Is `ro.custom.ota.version` always available?
   - Current code fallback is "20241130" - is this correct?

2. **MTK patch file format requirements?**
   - Current code expects .zip file
   - Any specific structure within the zip?
   - Maximum file size?

3. **Can MTK update be staged without immediate reboot?**
   - Need this to apply both MTK and BES in correct order

#### Firmware Patch Files

1. **Do we have the actual firmware patch files ready?**
   - MTK patches (.zip files)
   - BES patches (.bin files)
   - Where should they be hosted?

## Risk Assessment

### High Risk
- ~~**BES version query failure**~~ → RESOLVED: BES version auto-reported via `hs_syvr` at boot
- **Patch mismatch**: Applying wrong patch could brick device
- **MTU issues**: `version_info_2` may already be hitting BLE MTU limits (BES MAC not showing on phone)

### Medium Risk
- **Network failures during dual update**: If MTK succeeds but BES fails
- **Reboot timing**: Ensuring correct order of MTK staging and BES application
- **Backwards compatibility**: New phone + old glasses must gracefully handle missing `version_info_3`

### Low Risk
- **Schema backward compatibility**: Old `live_version.json` format still supported
- **Phone app notification changes**: Additive changes only

## Testing Plan

### Unit Tests
1. Schema parsing with new `mtk_patches`/`bes_patches` arrays
2. Version matching logic for both MTK and BES
3. Correct update order when both available

### Integration Tests
1. BES version query on startup
2. MTK version retrieval
3. Download and verification of patch files
4. Full OTA flow with mock server

### Device Tests (Mentra Live)
1. Single MTK patch application
2. Single BES patch application
3. Combined MTK + BES patch application
4. Rollback/recovery scenarios

## Implementation Phases

| Phase | Description | Complexity | Notes |
|-------|-------------|------------|-------|
| Phase 1 | Version retrieval | Low | BES already available! Only need to send MTK version via `version_info_3` |
| Phase 2 | Schema parsing updates (glasses) | Medium | Add `findMatchingMtkPatch()` and `findMatchingBesPatch()` |
| Phase 3 | Update priority logic (glasses) | Medium | MTK first, then BES (triggers reboot) |
| Phase 4 | Mobile app integration | Medium | Parse patches, receive `version_info_3`, show what's updating |
| Phase 5 | Server infrastructure | Low | Update `live_version.json` schema, host patch files |

## Files to Modify

### ASG Client (Glasses) - Primary Files
1. `asg_client/app/src/main/java/com/mentra/asg_client/io/hardware/managers/K900HardwareManager.java` - send `sh_syvr` on init to query BES version + MAC
2. `asg_client/app/src/main/java/com/mentra/asg_client/service/core/handlers/K900CommandHandler.java` - ensure `handleSystemVersionReport()` caches values properly
3. `asg_client/app/src/main/java/com/mentra/asg_client/service/core/AsgClientService.java` - restructure version_info chunks (v2 = URL only, v3 = firmware info)
4. `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/helpers/OtaHelper.java` - add `findMatchingPatch()`, patch matching logic, update order
5. `asg_client/ota_website/live_version.json` - new schema with `mtk_patches` and `bes_patches` arrays

### Mobile App - RN Layer
1. `mobile/src/effects/OtaUpdateChecker.tsx` - parse patches arrays, match versions using `mcuFwVersion`/`socFwVersion`
2. `mobile/src/stores/glasses.ts` - add `mcuFwVersion`, `socFwVersion` fields, update OtaProgress type
3. `mobile/src/app/ota/progress.tsx` - show current_update component name
4. `mobile/src/bridge/MantleBridge.tsx` - add field mapping for new `mcu_fw_version` → `mcuFwVersion`, `soc_fw_version` → `socFwVersion`

### Mobile App - Native Bridge (flexible version_info parsing)
5. `mobile/modules/core/android/src/main/java/com/mentra/core/sgcs/MentraLive.java` - refactor to flexible `version_info*` parsing (no more chunk waiting)
6. `mobile/modules/core/android/src/main/java/com/mentra/core/Bridge.kt` - change `sendVersionInfo()` to accept generic `Map<String, Any>` instead of hardcoded params
7. `mobile/modules/core/ios/Source/sgcs/MentraLive.swift` - refactor to flexible `version_info*` parsing (no more chunk waiting)
8. `mobile/modules/core/ios/Source/Bridge.swift` - change `emitVersionInfo()` to accept generic `[String: Any]` dictionary instead of hardcoded params

### Secondary Files
1. `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/utils/OtaConstants.java` (if new constants needed)
2. `asg_client/app/src/main/java/com/mentra/asg_client/service/communication/managers/CommunicationManager.java` - update sendOtaProgress to include current_update

### Documentation
1. `asg_client/agents/BES_OTA_README.md` (update schema examples)
2. `asg_client/app/src/main/java/com/mentra/asg_client/io/ota/README.md`

### Files NOT Needing Changes
- `BesOtaManager.java` - BES version comes from `hs_syvr`, not from OTA protocol query

## Complete OTA Flow (After Implementation)

### Happy Path: User Has Batch 1 Glasses, Day 1

1. **User opens mobile app** with glasses connected
2. **Mobile app** fetches `live_version.json` from `otaVersionUrl`
3. **Mobile app** sees `versionCode: 29` > glasses' `buildNumber: 28` → update available
4. **Mobile app** shows alert: "Update Available"
5. **User taps "Install"** → navigates to progress screen
6. **Mobile app** sends `{type: "ota_start"}` to glasses via BLE
7. **Glasses receive `ota_start`** and begin OTA check:
   - Parse `live_version.json`
   - Check APK: server versionCode 29 > current 28 → APK update needed
   - Check MTK: find patch where `start_firmware` == current MTK version → MTK patch found
   - Check BES: query BES version, find patch where `start_firmware` == current BES version → BES patch found
8. **Glasses send `ota_update_available`** to phone:
   ```json
   {"type": "ota_update_available", "updates": ["apk", "mtk", "bes"]}
   ```
9. **Glasses execute updates in order**:
   - Download and install APK (glasses restart with new ASG Client)
   - After restart, check again: APK up-to-date, MTK and BES patches still pending
   - Download and stage MTK firmware (does NOT reboot yet)
   - Download and apply BES firmware (triggers device reboot)
   - MTK update applies during that reboot
10. **Glasses reconnect** with new build number
11. **Mobile app** detects `buildNumber` increased → shows "Update Complete"

### Key Insight: Multi-Reboot Process

The full update process may involve multiple reboots:
1. APK install → app restart
2. BES install → device reboot (MTK applies here too)

The mobile app handles this via:
- Not failing on disconnect during "installing" state
- Watching for `buildNumber` increase to detect success
- Glasses reconnect automatically after reboot

## Summary

### Key Change: Explicit BES Version Query

The BES chip is *supposed* to auto-send `hs_syvr` at boot, but the firmware stack is unreliable. We explicitly query it:
- **Query**: Send `sh_syvr` in `K900HardwareManager.initialize()` at ASG Client startup
- **Response**: BES responds with `hs_syvr` containing version + MAC (~50ms)
- **Cached at**: `AsgSettings.getMcuFirmwareVersion()`
- **Sent to phone**: as `mcu_fw_version` in `version_info_3`
- **Format**: `major.minor.patch.build` (e.g., `17.26.1.14`)

### What Needs to Change

**Server/Schema (`live_version.json`)**:
1. Add `mtk_patches` array with `start_firmware`, `end_firmware`, `url` objects
2. Add `bes_patches` array with `start_firmware`, `end_firmware`, `url` objects
3. Keep backward compat with flat APK schema (current production)
4. Remove unused `mtk_firmware`/`bes_firmware` object handling (never deployed)

**ASG Client (Glasses)**:
1. Add explicit `sh_syvr` query in `K900HardwareManager.initialize()` to ensure BES version is cached
2. Restructure version_info chunks:
   - `version_info_2`: Only `ota_version_url` (isolated due to size)
   - `version_info_3`: `mcu_fw_version`, `soc_fw_version`, `bt_mac_address`
3. Add `findMatchingPatch()` for patch selection logic
4. Update priority logic: when both MTK + BES available, apply MTK first then BES
5. Update `ota_update_available` message to include which updates are available

**Mobile App - SGC Layer Refactor** (flexible version_info parsing):
1. Refactor `MentraLive.java` / `MentraLive.swift` to handle any `version_info*` message flexibly
2. Extract all fields and send to RN immediately (no chunk waiting/merging)
3. Change `Bridge.sendVersionInfo()` / `emitVersionInfo()` to accept generic Map/Dictionary
4. Add field mapping in MantleBridge: `mcu_fw_version` → `mcuFwVersion`, `soc_fw_version` → `socFwVersion`

**Mobile App - OTA Integration**:
5. Add `mcuFwVersion`, `socFwVersion` to `GlassesInfo` interface
6. Update `OtaUpdateChecker.tsx` to parse `mtk_patches` and `bes_patches` arrays
7. Add `findMatchingPatch()` function to match current version with available patches
8. Update UI to show what will be updated (APK, MTK, BES)
9. Update `OtaUpdateInfo` type with patch details
10. Show `current_update` in progress UI (apk/mtk/bes)

### What Already Works

- APK download and install via broadcast
- MTK firmware staging via `SysControl.installOTA()`
- BES firmware application via `BesOtaManager.startFirmwareUpdate()`
- `hs_syvr` parsing in `K900CommandHandler.handleSystemVersionReport()`
- Progress tracking to phone via `sendOtaProgress()`
- Phone app retry logic and disconnect handling
- Mutual exclusion flags preventing concurrent updates

### MTU Solution & Backwards Compatibility

**Issue**: `version_info_2` hitting BLE MTU limits due to long OTA URL - BES MAC not showing on phone.

**Solution - Flexible Parsing + New Chunking**:
- Refactor SGC to handle ANY `version_info*` message and send fields to RN immediately
- Move firmware info out of `version_info_2`, isolate the long URL
- RN accumulates fields via `setGlassesInfo({...state, ...info})`

**New Chunking (Glasses-side)**:
```
version_info_1: app_version, build_number, device_model, android_version
version_info_2: ota_version_url  (isolated - it's the long one)
version_info_3: mcu_fw_version, soc_fw_version, bt_mac_address
```

**Backwards Compatibility Matrix**:

| Phone Client | ASG Client | Result |
|-------------|------------|--------|
| Old | Old | Works (APK only, current behavior) |
| New | Old | Works (APK only, missing fields treated as unknown, uses legacy `fwVersion`) |
| Old | New | Works (old phone ignores new fields like `mcu_fw_version`) |
| New | New | Full functionality (APK + MTK + BES patches) |

**Key Insight**: Flexible parsing means phone accumulates whatever fields it receives - no hardcoded chunk expectations.
