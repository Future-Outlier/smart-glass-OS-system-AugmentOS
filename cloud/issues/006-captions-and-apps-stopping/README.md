# Cross-Environment App Subscription Contamination

Apps connected to multiple backend environments can corrupt state when one environment disposes its session. Additionally, SDK reconnection can lose subscription state through an as-yet-unidentified mechanism.

## Documents (Chronological Order)

- **001-captions-stopping-spec.md** - Initial problem analysis, root cause, proposed fixes
- **002-session-lifecycle-bug.md** - Deep dive: wrong session disposed on env switch
- **003-reconnection-system-analysis.md** - Analysis of reconnection/resurrection system and failure modes
- **004-state-and-data-flow.md** - Maps out state locations, data flows, and why naive fixes are dangerous
- **005-sdk-reconnect-empty-subscriptions-bug.md** - SDK sends empty subscriptions on reconnect (symptom documented)
- **006-proposed-architecture-redesign.md** - Proposed architectural changes to fix all issues
- **007-subscription-timing-bug.md** - Ongoing investigation into WHY subscriptions are empty
- **008-system-confusion-points.md** - Catalog of confusing/unintuitive aspects of the system
- **009-architecture-brainstorm.md** - Holistic redesign: AppSession class, OWNERSHIP_RELEASE, coordinated recovery
- **010-subscription-manager-usage-analysis.md** - Analysis of SubscriptionManager usage across codebase
- **011-sdk-subscription-architecture-mismatch.md** - **ROOT CAUSE FOUND**: Dual storage allows handlers/subscriptions to drift

## Quick Context

**Bug 1 (Env Switch)**: When user switches from env A to env B, env A's grace period eventually disposes its session. The `onStop` handler looks up by `userId` but gets the NEW session, disposing the wrong one.

**Bug 2 (SDK Reconnect)**: During SDK reconnection after WebSocket 1006, the SDK sends empty subscriptions to the cloud, killing transcription. **Root cause identified: dual storage of subscription state allows drift (see 011).**

**Result**: App appears running but transcription stops. Mic turns off. User confused.

## Root Cause: Dual Storage Architecture Mismatch (Bug 2)

### The Problem

The SDK stores subscription state in **two separate places**:

1. **`EventManager.handlers`** - Map of stream → handlers (developer's registered callbacks)
2. **`AppSession.subscriptions`** - Set of streams (internal tracking for cloud)

These are supposed to stay in sync, but they can **drift**:

```typescript
// AppSession.disconnect() - CLEARS subscriptions but NOT handlers!
async disconnect(): Promise<void> {
  // ...
  this.subscriptions.clear()  // ← handlers still exist!
}
```

### The Bug

If `this.subscriptions` gets cleared while `handlers` still exist:

- Developer's handlers still exist (they want events!)
- `this.subscriptions` is empty
- On reconnect, `updateSubscriptions()` sends empty array
- Cloud removes subscriptions
- Handlers wait for events that never come

### The Fix

**Derive subscriptions from handlers instead of storing separately:**

```typescript
// Instead of maintaining this.subscriptions Set...
private updateSubscriptions(): void {
  // DERIVE from handlers - single source of truth!
  const subs = this.events.getRegisteredStreams()
  this.send({ type: 'SUBSCRIPTION_UPDATE', subscriptions: subs })
}
```

**Why this works:**

- Subscriptions can NEVER be empty if handlers exist
- No separate Set to drift out of sync
- `disconnect()` can't break subscriptions (nothing to clear)
- Reconnection automatically sends correct subscriptions

## Multiple Failure Modes Identified

1. **Wrong Session Disposed** - Environment switch causes old session's `onStop` to dispose new session (002) ✅ Root cause known
2. **Webhook Unreachable** - Resurrection fails because app server crashed (003)
3. **Subscription Loss Without WS Close** - App loses subscriptions but WebSocket stays open
4. **SDK Empty Subscriptions** - SDK sends `[]` on reconnect ✅ Root cause known: dual storage drift (011)
5. **Orphaned WebSocket Connections** - Old session's WebSocket stays open, causes contamination

## Status

- [x] Root cause identified for env-switch bug (002)
- [x] Root cause identified for SDK reconnect bug (011) - **Dual storage allows drift**
- [x] Reconnection system analyzed (003)
- [x] State/data flow mapped (004)
- [x] System confusion points documented (008)
- [x] Architecture redesign documented (009)
- [ ] Implement SDK fix: Derive subscriptions from handlers
- [ ] Implement Cloud fix: AppSession class + OWNERSHIP_RELEASE
- [ ] Verify fixes

## The Core Problems

### Problem 1: SDK Dual Storage Allows Drift (Bug 005/007) ✅ SOLVED

The SDK has TWO places storing subscription state:

```
EventManager.handlers          AppSession.subscriptions
(developer's callbacks)        (internal Set for cloud)
        │                              │
        │      Should stay in sync     │
        └──────────────────────────────┘
                    BUT
              They can DRIFT!
```

**How they drift:**

```typescript
// disconnect() clears subscriptions but NOT handlers
async disconnect(): Promise<void> {
  this.subscriptions.clear()  // ← Cleared!
  // handlers still exist in EventManager!
}
```

**The fix:** Derive subscriptions from handlers:

```typescript
private updateSubscriptions(): void {
  const subs = this.events.getRegisteredStreams()  // ← Derive from handlers!
  this.send({ type: 'SUBSCRIPTION_UPDATE', subscriptions: subs })
}
```

### Problem 2: sessionId Not Unique

```
sessionId = userId + "-" + packageName
         = "isaiah@mentra.glass-com.mentra.captions.beta"

This is the SAME for:
  - Session on cloud-dev
  - Session on cloud-debug
  - Any future session
```

### Problem 3: State Scattered Across Managers

- AppManager holds: WebSockets, connection states, heartbeats
- SubscriptionManager holds: subscriptions per app
- UserSession holds: runningApps, loadingApps
- No single source of truth for an app's state

## Proposed Fixes

### SDK Fix: Derive Subscriptions from Handlers (Bug 2)

```typescript
// EventManager - add method to expose registered streams
getRegisteredStreams(): ExtendedStreamType[] {
  return Array.from(this.handlers.keys())
}

// AppSession - derive instead of storing
private updateSubscriptions(): void {
  const subs = this.events.getRegisteredStreams()  // Single source of truth!
  this.send({ type: 'SUBSCRIPTION_UPDATE', subscriptions: subs })
}

// disconnect() no longer needs to clear subscriptions
async disconnect(): Promise<void> {
  // Remove: this.subscriptions.clear()
  // Nothing to clear - subscriptions derived from handlers
}
```

### Cloud Fix: AppSession Class + OWNERSHIP_RELEASE (Bug 1)

See **009-architecture-brainstorm.md** for details:

- `AppSession` class consolidates scattered state
- `OWNERSHIP_RELEASE` message coordinates cloud switching
- One AppSession per user on SDK side (enforced)

## Key Files

### SDK (Bug 2 Fix)

| File                                     | Changes Needed                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| `packages/sdk/src/app/session/events.ts` | Add `getRegisteredStreams()` method                             |
| `packages/sdk/src/app/session/index.ts`  | Derive subscriptions from handlers, remove `this.subscriptions` |

### Cloud (Bug 1 Fix)

| File                                                             | Changes Needed                           |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `packages/cloud/src/services/session/AppSession.ts`              | NEW: Consolidated app session state      |
| `packages/cloud/src/services/session/AppManager.ts`              | Use `apps: Map<packageName, AppSession>` |
| `packages/cloud/src/services/websocket/websocket-app.service.ts` | Handle `OWNERSHIP_RELEASE` message       |

### SDK (Bug 1 Fix)

| File                                    | Changes Needed                                 |
| --------------------------------------- | ---------------------------------------------- |
| `packages/sdk/src/app/server/index.ts`  | One session per user, transfer on cloud switch |
| `packages/sdk/src/app/session/index.ts` | Add `transferToCloud()`, `OWNERSHIP_RELEASE`   |

## System Confusion Points

See **008-system-confusion-points.md** for a comprehensive list of:

- Multiple "Session" concepts with same names
- Scattered state across managers
- Two connection paths (JWT vs CONNECTION_INIT)
- Webhook vs Auto-Reconnect creating different state
- Three different grace periods (60s, 5s, 8s)
- Resurrection vs Reconnection competing mechanisms
- And more...

Understanding these confusion points is essential for debugging and avoiding regressions.
