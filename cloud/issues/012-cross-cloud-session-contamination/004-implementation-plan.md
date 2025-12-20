# Implementation Plan: Cross-Cloud Session Contamination Fix

## Overview

This document provides the concrete implementation steps to fix the cross-cloud session contamination bug where an old cloud instance can kill subscriptions on a new cloud when users switch environments.

## Prerequisites

The following have already been implemented (from issue 006):

- [x] Phase 1a: Derive subscriptions from handlers (SDK)
- [x] Phase 1b: Terminated flag to prevent reconnection after session end
- [x] Phase 2: OWNERSHIP_RELEASE protocol
- [x] Phase 4: AppSession class consolidation on Cloud

## Remaining Work

### Priority 1: sessionId-aware disposal in Captions App (Short-term)

This is the immediate fix that prevents cross-cloud contamination without changing the sessionId format.

#### Step 1.1: Update UserSession to store and expose sessionId

**File**: `packages/apps/captions/src/app/session/UserSession.ts`

```typescript
export class UserSession {
  public readonly userId: string
  public readonly sessionId: string // ADD: Store sessionId from AppSession

  constructor(appSession: AppSession) {
    this.userId = appSession.userId
    this.sessionId = appSession.sessionId // ADD: Capture sessionId
    // ... existing constructor code
  }

  // ADD: Helper method for sessionId-aware lookup
  static getUserSessionIfMatches(userId: string, sessionId: string): UserSession | undefined {
    const session = UserSession.userSessions.get(userId)
    if (session && session.sessionId === sessionId) {
      return session
    }
    return undefined
  }
}
```

#### Step 1.2: Update onStop to check sessionId before disposing

**File**: `packages/apps/captions/src/app/index.ts`

```typescript
protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
  // Use sessionId-aware lookup to prevent cross-cloud contamination
  const userSession = UserSession.getUserSessionIfMatches(userId, sessionId)

  if (userSession) {
    this.logger.info(
      { sessionId, userId, reason },
      `Disposing session: ${reason}`
    )
    userSession.dispose()
  } else {
    // This happens when old cloud sends onStop for stale session
    // Log but don't dispose - the current session belongs to a different cloud
    this.logger.info(
      { sessionId, userId, reason },
      `Ignoring stop for non-matching session (likely stale cross-cloud stop)`
    )
  }
}
```

#### Step 1.3: Verify AppSession exposes sessionId

**File**: `packages/sdk/src/app/session/index.ts`

Verify that `sessionId` is accessible:

```typescript
export class AppSession {
  public readonly sessionId: string // Should already be public/accessible
  // ...
}
```

### Priority 2: Apply same fix to external Captions app

The production Captions app at `captions-beta.mentraglass.com` needs the same sessionId-aware disposal guard.

**Action**: Apply Step 1.1 and Step 1.2 to the external captions app codebase.

### Priority 3: Generate unique sessionIds (Medium-term)

This makes the system more robust by ensuring sessionIds are truly unique per session instance.

#### Step 3.1: Update Cloud to generate UUID-based sessionId

**File**: `packages/cloud/src/services/session/AppManager.ts`

```typescript
import { randomUUID } from 'crypto'

// In triggerAppWebhookInternal()
async triggerAppWebhookInternal(packageName: string, appInfo: AppInfo) {
  // Generate unique sessionId for this session instance
  const sessionId = randomUUID()

  const webhookPayload = {
    type: 'SESSION_REQUEST',
    sessionId,
    userId: this.userSession.userId,
    packageName,
    mentraOSWebsocketUrl: this.getWebsocketUrl(),
    // ... rest of payload
  }

  // Log with context for debugging
  this.logger.info(
    { sessionId, userId: this.userSession.userId, packageName },
    `Triggering webhook with unique sessionId`
  )

  // ... rest of method
}
```

#### Step 3.2: Update any code that parses sessionId

Search for any code that assumes `sessionId = userId + "-" + packageName` format:

```bash
grep -r "sessionId.*split\|sessionId.*indexOf\|sessionId.*-" packages/
```

Update any parsing logic to extract userId/packageName from separate fields instead of parsing sessionId.

### Priority 4: Add sessionId to persistence (Future)

If session restoration on cloud restart requires sessionId:

**File**: `packages/cloud/src/models/User.ts`

```typescript
interface RunningApp {
  packageName: string
  sessionId: string  // ADD: Persist sessionId for restoration
  startedAt: Date
}

// Update runningApps field
runningApps: RunningApp[]  // Change from string[] to RunningApp[]
```

This allows cloud restart to restore sessions with their original sessionIds.

---

## Testing Plan

### Unit Tests

#### Test 1: sessionId-aware disposal

```typescript
describe("UserSession.getUserSessionIfMatches", () => {
  it("should return session when sessionId matches", () => {
    const appSession = createMockAppSession({sessionId: "session-123", userId: "user-1"})
    const userSession = new UserSession(appSession)

    const result = UserSession.getUserSessionIfMatches("user-1", "session-123")
    expect(result).toBe(userSession)
  })

  it("should return undefined when sessionId does not match", () => {
    const appSession = createMockAppSession({sessionId: "session-123", userId: "user-1"})
    new UserSession(appSession)

    const result = UserSession.getUserSessionIfMatches("user-1", "different-session")
    expect(result).toBeUndefined()
  })

  it("should return undefined when userId does not exist", () => {
    const result = UserSession.getUserSessionIfMatches("nonexistent", "any-session")
    expect(result).toBeUndefined()
  })
})
```

#### Test 2: onStop ignores stale sessions

```typescript
describe("LiveCaptionsApp.onStop", () => {
  it("should dispose session when sessionId matches", async () => {
    const app = new LiveCaptionsApp()
    const session = createUserSession({sessionId: "session-123", userId: "user-1"})
    const disposeSpy = jest.spyOn(session, "dispose")

    await app.onStop("session-123", "user-1", "User session ended")

    expect(disposeSpy).toHaveBeenCalled()
  })

  it("should NOT dispose session when sessionId does not match", async () => {
    const app = new LiveCaptionsApp()
    const session = createUserSession({sessionId: "session-123", userId: "user-1"})
    const disposeSpy = jest.spyOn(session, "dispose")

    await app.onStop("different-session", "user-1", "User session ended")

    expect(disposeSpy).not.toHaveBeenCalled()
  })
})
```

### Integration Tests

#### Test 3: Cross-cloud switch simulation

```typescript
describe("Cross-cloud session handling", () => {
  it("should not kill new session when old cloud sends onStop", async () => {
    // 1. Start session on cloud-dev
    const sessionDev = await startSession("cloud-dev", "user-1")
    expect(sessionDev.sessionId).toBeTruthy()

    // 2. Start session on cloud-debug (simulates user switch)
    const sessionDebug = await startSession("cloud-debug", "user-1")
    expect(sessionDebug.sessionId).not.toBe(sessionDev.sessionId)

    // 3. Simulate cloud-dev sending onStop for old session
    await app.onStop(sessionDev.sessionId, "user-1", "User session ended")

    // 4. Verify cloud-debug session is still active
    const activeSession = UserSession.getUserSession("user-1")
    expect(activeSession.sessionId).toBe(sessionDebug.sessionId)
    expect(activeSession.isActive()).toBe(true)
  })
})
```

---

## Rollback Plan

### If Priority 1 causes issues:

Remove the sessionId check and revert to userId-only lookup:

```typescript
protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
  // ROLLBACK: Revert to userId-only lookup
  const userSession = UserSession.getUserSession(userId)
  if (userSession) {
    userSession.dispose()
  }
}
```

### If Priority 3 causes issues:

Revert to deterministic sessionId generation:

```typescript
// ROLLBACK: Revert to deterministic sessionId
const sessionId = `${this.userSession.userId}-${packageName}`
```

---

## Risk Assessment

| Change                    | Risk   | Mitigation                                    |
| ------------------------- | ------ | --------------------------------------------- |
| sessionId check in onStop | Low    | Only adds a guard, doesn't change happy path  |
| UUID sessionId generation | Medium | Might break code that parses sessionId format |
| sessionId persistence     | Medium | Requires DB migration, needs careful rollout  |

---

## Timeline Estimate

| Task                           | Estimate      | Priority |
| ------------------------------ | ------------- | -------- |
| Step 1.1-1.3: Captions app fix | 2 hours       | P1       |
| Step 2: External captions app  | 1 hour        | P1       |
| Step 3: UUID sessionId         | 4 hours       | P2       |
| Testing                        | 3 hours       | P1       |
| **Total**                      | **~10 hours** |          |

---

## Success Metrics

1. **No cross-cloud contamination**: When user switches clouds, old session's onStop doesn't kill new session
2. **Transcription continues**: Switching environments doesn't stop transcription
3. **No regressions**: Normal single-environment usage unaffected
4. **Observable**: Logs clearly show when stale onStop is ignored

---

## Checklist

- [ ] Update `UserSession.ts` to store sessionId (Step 1.1)
- [ ] Add `getUserSessionIfMatches` helper (Step 1.1)
- [ ] Update `onStop` to use sessionId check (Step 1.2)
- [ ] Verify `AppSession.sessionId` is accessible (Step 1.3)
- [ ] Write unit tests (Test 1, Test 2)
- [ ] Write integration test (Test 3)
- [ ] Apply fix to external captions app (Step 2)
- [ ] Test cross-cloud scenario manually
- [ ] Deploy and verify in staging
- [ ] Monitor production for stale onStop logs
