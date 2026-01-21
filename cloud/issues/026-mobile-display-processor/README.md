# Issue 026: Mobile Display Processor

**Status**: Complete ✅  
**Priority**: Medium  
**Related**: @mentra/display-utils, GlassesDisplayMirror

## Problem

Text wrapping logic is duplicated and inconsistent across the codebase:

1. **Cloud SDK** (`@mentra/sdk/display-utils`) - Pixel-accurate wrapping with glyph widths
2. **Native SGC layer** (Kotlin/Swift) - Separate wrapping logic, different results
3. **Mobile preview** (`GlassesDisplayMirror`) - No wrapping, just displays what it receives

This causes:

- Preview doesn't match actual glasses display
- Double-wrapping when cloud and native both wrap
- Inconsistent line breaks between cloud apps and native rendering

## Documents

- **[display-processor-spec.md](./display-processor-spec.md)** - Problem, goals, constraints
- **[display-processor-architecture.md](./display-processor-architecture.md)** - Implementation details, data flow, integration points
- **[026a-head-up-dashboard-disabled-bug.md](./026a-head-up-dashboard-disabled-bug.md)** - Bug fix: head-up view not updating when dashboard disabled

## Quick Context

**Current**: Native SGC has its own wrapping logic → inconsistent with cloud display-utils  
**Proposed**: Add DisplayProcessor in React Native layer using same display-utils logic → single source of truth

## Key Insight

The SDK's `display-utils` is pure TypeScript with no Node.js dependencies:

- `TextMeasurer` - Glyph width lookups
- `TextWrapper` - Line breaking algorithms
- `G1_PROFILE`, `Z100_PROFILE`, `NEX_PROFILE` - Hardware-specific measurements

This is now a shared package `@mentra/display-utils` used by both SDK and mobile.

## Solution Implemented

```
Cloud App → display-utils → pre-wrapped lines → WebSocket
                                                    ↓
Mobile ← DisplayProcessor (display-utils) ← display_event
                    ↓
            Native SGC (render pre-wrapped text)
```

**All display events flow through DisplayProcessor** - both cloud events (via WebSocket) and local/offline events (via `handle_display_event`). There are no code paths that bypass the DisplayProcessor, so native SGC wrapping can be removed entirely without backwards compatibility concerns.

## Implementation Details

### Files Created/Modified

**New Package:**

- `cloud/packages/display-utils/` - Shared `@mentra/display-utils` package
  - `src/index.ts` - Main exports and factory functions
  - `src/profiles/g1.ts` - Even Realities G1 profile
  - `src/profiles/z100.ts` - Vuzix Z100 profile (placeholder values)
  - `src/profiles/nex.ts` - Mentra Nex profile (placeholder values)
  - `src/measurer/` - Text measurement with glyph widths
  - `src/wrapper/` - Text wrapping with multiple break modes
  - `src/helpers/` - Utility functions and ScrollView

**Mobile Files:**

- `mobile/src/services/display/DisplayProcessor.ts` - Main processor class
- `mobile/src/services/display/index.ts` - Service exports

**Modified Files:**

- `mobile/src/services/SocketComms.ts` - Uses DisplayProcessor to process display events before sending to native
- `mobile/src/bridge/MantleBridge.tsx` - Updates DisplayProcessor device model when glasses connect
- `mobile/package.json` - Added `@mentra/display-utils` dependency
- `mobile/tsconfig.json` - Added path mapping for `@mentra/display-utils`
- `mobile/babel.config.cts` - Added alias for `@mentra/display-utils`
- `mobile/metro.config.js` - Added watch folder for display-utils
- `cloud/packages/sdk/package.json` - Added `@mentra/display-utils` as dependency
- `cloud/packages/sdk/src/display-utils.ts` - Now re-exports from shared package
- `cloud/package.json` - Updated build scripts to include display-utils

### Code Sharing Strategy

**Decision**: Create shared `@mentra/display-utils` package (Option B from spec)

**Rationale**:

- Single source of truth - no code duplication
- Both SDK and mobile import from the same package
- Pure TypeScript with zero external dependencies
- Easy to maintain and version
- Clear ownership and separation of concerns

### DisplayProcessor API

```typescript
import {displayProcessor} from "@/services/display"

// When glasses connect (called from MantleBridge)
displayProcessor.setDeviceModel("Even Realities G1")

// Process display events (called from SocketComms)
const processed = displayProcessor.processDisplayEvent(rawEvent)

// Direct text wrapping
const lines = displayProcessor.wrapText("Hello world this is a long text")

// Measure text width
const widthPx = displayProcessor.measureText("Hello")
```

### Supported Layout Types

- ✅ `text_wall` - Full text wrapping with line breaks
- ✅ `text_line` - Same as text_wall
- ✅ `text_rows` - Array of rows, each wrapped independently
- ✅ `reference_card` - Title (1 line) + text (remaining lines)
- ✅ `double_text_wall` - Two columns with pixel-precise space alignment via ColumnComposer
- ✅ `bitmap_view` - Pass through (no text processing)

### Device Profile Support

| Device            | Profile        | Status                                        |
| ----------------- | -------------- | --------------------------------------------- |
| Even Realities G1 | `G1_PROFILE`   | ✅ Full support                               |
| Vuzix Z100        | `Z100_PROFILE` | ✅ Full support (Noto Sans metrics extracted) |
| Mentra Nex        | `NEX_PROFILE`  | ✅ Placeholder (needs actual font metrics)    |
| Mentra Mach1      | `G1_PROFILE`   | 🔄 Uses G1 (needs own profile if has display) |
| Mentra Live       | `G1_PROFILE`   | ℹ️ No display, uses G1 as fallback            |
| Simulated         | `G1_PROFILE`   | ✅ Full support                               |

### Device Model Normalization

The `DisplayProcessor.normalizeModelName()` function maps model strings to profiles:

| Input String                                | Maps To                      |
| ------------------------------------------- | ---------------------------- |
| `"Even Realities G1"`, `"g1"`               | `g1` → `G1_PROFILE`          |
| `"Vuzix Z100"`, `"z100"`, `"vuzix"`         | `z100` → `Z100_PROFILE`      |
| `"Mentra Nex"`, `"nex"`, `"mentra display"` | `nex` → `NEX_PROFILE`        |
| `"Mentra Mach1"`, `"mach1"`, `"mach 1"`     | `mach1` → `G1_PROFILE`       |
| `"Mentra Live"`, `"mentra-live"`            | `mentra-live` → `G1_PROFILE` |
| `"Simulated Glasses"`, `"simulated"`        | `simulated` → `G1_PROFILE`   |

## Completed

### Phase 2: Native SGC Wrapping Removal ✅

Native wrapping logic has been removed/simplified. Text now comes pre-wrapped from DisplayProcessor.

**Android:**

- `G1.java` - `createTextWallChunks()` simplified to just call `chunkTextForTransmission()` without re-wrapping
- `G1Text.kt` - `splitIntoLines()` still exists for legacy `createDoubleTextWallChunks()` but is no longer used for text_wall

**iOS:**

- `G1Text.swift` - `createTextWallChunks()` simplified to just call `chunkTextForTransmission()` without re-wrapping
- `splitIntoLines()` still exists for legacy `createDoubleTextWallChunks()` but is no longer used for text_wall

**Additional fix:** Fixed `displayEvent()` in both iOS and Android to always call `sendCurrentState()` when view state changes. The previous conditional logic was causing display updates to be missed when looking up (head-up position).

### Phase 2.5: ColumnComposer for double_text_wall ✅

Added `ColumnComposer` class to `@mentra/display-utils` for pixel-precise column composition:

- `ColumnComposer.composeDoubleTextWall(left, right)` - wraps both columns and merges with space-padding
- `DisplayProcessor.processDoubleTextWall()` now uses ColumnComposer
- Outputs pre-composed text as `text_wall` layout type
- Native just chunks and sends - no column composition logic needed

**Files created:**

- `cloud/packages/display-utils/src/composer/ColumnComposer.ts`
- `cloud/packages/display-utils/src/composer/index.ts`

**Files modified:**

- `cloud/packages/display-utils/src/index.ts` - exports ColumnComposer
- `mobile/src/services/display/DisplayProcessor.ts` - uses ColumnComposer for double_text_wall
- `mobile/modules/core/ios/Source/utils/G1Text.swift` - simplified createTextWallChunks
- `mobile/modules/core/ios/Source/CoreManager.swift` - fixed displayEvent
- `mobile/modules/core/android/src/main/java/com/mentra/core/sgcs/G1.java` - simplified createTextWallChunks
- `mobile/modules/core/android/src/main/java/com/mentra/core/CoreManager.kt` - fixed displayEvent

### Phase 3: Validation ✅

- App builds and runs successfully
- DisplayProcessor loads without errors
- Display events are processed through DisplayProcessor
- Fallback to raw events works if processing fails

### Future: Profile Updates

When hardware specs become available:

- [ ] Update `Z100_PROFILE` with actual Vuzix Z100 font metrics
- [ ] Update `NEX_PROFILE` with actual Mentra Nex font metrics
- [ ] Add `MACH1_PROFILE` if Mentra Mach1 has a display

## Status Checklist

- [x] Problem identified
- [x] Investigation complete
- [x] Spec written
- [x] Architecture designed
- [x] **Phase 1: DisplayProcessor implementation** ✅
  - [x] Create shared `@mentra/display-utils` package
  - [x] Create DisplayProcessor class
  - [x] Integrate with SocketComms
  - [x] Update device model on glasses connect
  - [x] Add G1, Z100, NEX profiles
- [x] **Phase 2: Native SGC wrapping removal** ✅ (Not needed - native already acts as dumb renderer)
- [x] **Phase 3: Validation** ✅
  - [x] App builds and runs successfully
  - [x] DisplayProcessor integrated and working
  - [x] No runtime errors

## References

- `cloud/packages/display-utils/` - Shared display-utils package
- `cloud/packages/sdk/src/display-utils.ts` - SDK re-export
- `mobile/src/services/display/` - Mobile DisplayProcessor
- `mobile/src/components/mirror/GlassesDisplayMirror.tsx` - Preview component
- `mobile/modules/core/android/src/main/java/com/mentra/core/sgcs/` - Native SGC code
