# Spec: ResourceTracker Disposed Crash Fix

## Overview

**What this doc covers:** Exact specification for fixing the `ResourceTracker.track()` throw that crashes the process with exit code 1 when called on a disposed tracker. One-line fix: return a no-op instead of throwing.
**Why this doc exists:** US Central crashed 3 times in 10 minutes because `SonioxTranslationProvider.connect()` called `resources.track()` after the session was disposed. The throw became an unhandled promise rejection that killed the Bun process. This is a pre-existing race condition exposed by the heap growth fix (issue 067) — the pod now lives long enough for the thundering herd pattern to trigger it.
**What you need to know first:** [068 spike](./spike.md) for the full investigation, stack trace, and cascading crash timeline.
**Who should read this:** Anyone reviewing the hotfix PR.

## The Problem in 30 Seconds

`ResourceTracker.track()` throws `new Error("Cannot track resources on a disposed ResourceTracker")` when called after `dispose()`. This throw is unhandled in `SonioxTranslationProvider.connect()` because it happens inside a `new Promise` constructor — the exception becomes an unhandled promise rejection, and Bun exits with code 1. Every connected user loses their session. The thundering herd reconnect increases the probability of the same race, causing cascading crashes.

## Spec

### A1. Change `ResourceTracker.track()` from throw to no-op

**File:** `packages/cloud/src/utils/resource-tracker.ts`

**Before:**

```typescript
track(cleanup: CleanupFunction): CleanupFunction {
  if (this.isDisposed) {
    throw new Error("Cannot track resources on a disposed ResourceTracker");
  }
  // ...
}
```

**After:**

```typescript
track(cleanup: CleanupFunction): CleanupFunction {
  if (this.isDisposed) {
    // Don't throw — this crashes the entire process (exit code 1).
    // This happens when a translation/transcription stream tries to connect
    // after the UserSession has already been disposed (race condition during
    // disconnect storms). Silently ignore and return a no-op.
    return () => {};
  }
  // ...
}
```

**Why no-op instead of throw:** A disposed ResourceTracker will never run cleanup functions again — `dispose()` already ran them all and set `isDisposed = true`. Registering a new cleanup on a disposed tracker is meaningless but harmless. The cleanup function will simply never execute, which is the correct behavior — the resource it would have cleaned up belongs to a session that's already gone. Throwing serves no purpose other than crashing the process.

**Why not catch in SonioxTranslationProvider instead:** The throw could occur in any code path that calls `track()` after an async gap. Fixing at the source (ResourceTracker) protects all callers, not just the one that happened to crash first. Defense in depth — the caller shouldn't need to know about ResourceTracker's internal state.

### What This Does NOT Include

| Out of scope                                   | Why                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding disposed guards to individual providers | The ResourceTracker fix protects all callers. Individual guards are defense-in-depth for a future PR.                                                                                             |
| Fixing the race condition root cause           | The race (dispose during async connect) is inherent to the session lifecycle. The correct behavior is to silently abandon the operation, which is what the no-op achieves.                        |
| Fixing the SDK's copy of ResourceTracker       | `packages/sdk/src/utils/resource-tracker.ts` has the same throw, but SDK code runs in the developer's process, not in our server. A crash there doesn't kill production. Can be fixed separately. |

## Decision Log

| Decision                    | Alternatives considered                      | Why we chose this                                                                                                                                           |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Return no-op from `track()` | Catch in SonioxTranslationProvider.connect() | Fixes all callers, not just one. The throw can occur from any async code path.                                                                              |
| Silent return (no log)      | Log a warning on every disposed track() call | During thundering herd, hundreds of disposed track() calls would fire. Logging each one creates noise and event loop pressure at the worst possible moment. |
| No-op cleanup function      | Run the cleanup immediately                  | The cleanup function references resources that may no longer exist (the session is disposed). Running it could cause secondary errors.                      |

## Testing

### Verify locally

1. Start cloud server
2. Connect a phone
3. Disconnect the phone (airplane mode)
4. Wait for grace period (60s) — session disposes
5. Verify no crash in the console
6. Previously this would throw if a translation stream was mid-connect during dispose

### Verify in production

After deploying:

- US Central should stop crashing with exit code 1
- Uptime should exceed the previous ~5 minute crash cycle
- BetterStack uptime monitor should stay green
- No `Cannot track resources on a disposed ResourceTracker` errors in logs (the code path is silently handled)

## Rollout

1. Deploy to `cloud-debug` (already configured to deploy this branch)
2. Verify no crashes
3. Merge to main → deploys to all regions
4. Monitor US Central uptime — should remain stable
