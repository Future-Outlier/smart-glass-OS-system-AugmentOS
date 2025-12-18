# Cross-Cloud Session Contamination

When a user switches between cloud environments (e.g., `cloud-dev` → `cloud-debug`), the old cloud instance can kill subscriptions on the new cloud because `sessionId` isn't unique per session instance and apps look up sessions by `userId` instead of `sessionId`.

## Documents

- **001-problem-analysis.md** - Root cause analysis and evidence from logs
- **002-sessionid-implementation-gap.md** - Analysis of sessionId implementation issues in server/SDK
- **003-ownership-release-protocol.md** - OWNERSHIP_RELEASE protocol design (Phase 2)
- **004-implementation-plan.md** - Concrete patch plan for SDK and Cloud

## Quick Context

**Current**: `sessionId = userId + "-" + packageName` is deterministic and reused across environments. When old cloud disposes its session, `onStop` looks up by `userId` and gets the NEW active session on the new cloud.

**Result**: App calls `dispose()` on the wrong session, killing transcription on the active cloud.

## The Bug Flow

```
1. User on cloud-dev, captions app running
2. User switches to cloud-debug (new webhook → new AppSession)
3. SDK overwrites activeSessions[sessionId] (same sessionId!)
4. cloud-dev grace period expires (60s)
5. cloud-dev sends onStop(sessionId, userId, "User session ended")
6. Captions app: UserSession.getUserSession(userId)?.dispose()
7. Gets the NEW session (cloud-debug), not the old one
8. Transcription dies on cloud-debug
```

## Root Cause: sessionId Not Unique

```
sessionId = userId + "-" + packageName
         = "isaiah@mentra.glass-com.mentra.captions.beta"

Same for:
  - Session on cloud-dev
  - Session on cloud-debug
  - Any future session for this user/app
```

## Key Files

| File                                                    | Issue                                   |
| ------------------------------------------------------- | --------------------------------------- |
| `packages/cloud/src/services/session/AppManager.ts`     | Generates deterministic sessionId       |
| `packages/sdk/src/app/server/index.ts`                  | Overwrites sessions with same sessionId |
| `packages/apps/captions/src/app/session/UserSession.ts` | Looks up by userId, not sessionId       |

## Status

- [x] Root cause identified (sessionId not unique, lookup by userId)
- [x] Phase 1a: Derive subscriptions from handlers (SDK) - prevents empty subscription bug
- [x] Phase 1b: Terminated flag to prevent reconnection after session end
- [x] Phase 2: OWNERSHIP_RELEASE protocol implemented
- [x] Phase 4: AppSession class consolidation on Cloud
- [ ] **sessionId uniqueness**: Make sessionId truly unique (UUID) across clouds
- [ ] **Captions app fix**: Guard onStop with sessionId match check
- [ ] **External captions app**: Apply same guards to captions-beta.mentraglass.com
- [ ] Verify fixes in production

## Proposed Fixes

### Short-term: Guard onStop with sessionId check (Captions App)

```typescript
protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
  const userSession = UserSession.getUserSession(userId)
  if (userSession?.appSession?.sessionId === sessionId) {
    userSession.dispose()
  } else {
    console.log(`Ignoring stop for stale session ${sessionId}`)
  }
}
```

### Medium-term: Unique sessionId (Cloud)

```typescript
// In AppManager.triggerAppWebhookInternal()
sessionId: `${this.userSession.userId}-${packageName}-${crypto.randomUUID()}`
```

### Long-term: OWNERSHIP_RELEASE protocol

SDK sends `OWNERSHIP_RELEASE` before intentional disconnect, Cloud skips resurrection.

## Related

- **006-captions-and-apps-stopping** - Parent issue with additional context
- **009-bun-time** - Bun migration work where this was discovered
