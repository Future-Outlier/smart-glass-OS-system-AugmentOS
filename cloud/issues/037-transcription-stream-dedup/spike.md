# Spike: Transcription Stream Duplication & Subscription Routing Bugs

## Overview

**What this doc covers:** Investigation into why `com.mentra.captions.debug` stopped receiving transcriptions after a subscription update, plus related bugs found in stream deduplication, subscription aggregation, and reconnect grace window handling.

**Why this doc exists:** On Feb 14 2026, captions.debug went silent on the dev server despite the user session being fully alive. The root cause is a set of interacting bugs in how `TranscriptionManager` manages streams and how `SubscriptionManager` aggregates subscriptions across apps. These bugs affect all environments.

**Who should read this:** Anyone working on transcription, subscription management, or app session lifecycle in cloud.

---

## Background

### How transcription streams work

```
App subscribes to "transcription:en-US"
  → SubscriptionManager.syncManagers()
    → getTranscriptionSubscriptions() aggregates across all apps
      → TranscriptionManager.updateSubscriptions(["transcription:en-US", "transcription:en-US?hints=ja"])
        → creates one Soniox WebSocket stream per unique subscription string
          → stream produces tokens → relayDataToApps() → SubscriptionManager.getSubscribedApps() → app
```

Key data structures in `TranscriptionManager`:

- `streams: Map<string, StreamInstance>` — keyed by subscription string (e.g., `"transcription:en-US"`)
- `activeSubscriptions: Set<ExtendedStreamType>` — the set of subscriptions passed in via `updateSubscriptions()`

Key data structures in `SubscriptionManager`:

- No caches — queries `AppSession._subscriptions` on demand
- `getTranscriptionSubscriptions()` — iterates all apps, collects all subs containing `"transcription"` (but not `"translation"`)

### How relay works

When a stream produces data, `relayDataToApps(subscription, data)` is called. It:

1. Constructs an `effectiveSubscription` from the data's `transcribeLanguage` field (e.g., `"transcription:en-US"`)
2. Calls `getTargetSubscriptions()` — which just returns `[effectiveSubscription]`
3. Calls `subscriptionManager.getSubscribedApps(effectiveSubscription)` to find which apps want this data
4. Sends to each app

`getSubscribedApps` does language-aware matching: it parses the subscription, strips query params (`?hints=ja`), and matches on base type + language. So an app subscribed to `"transcription:en-US?hints=ja"` will match data from a stream with effective subscription `"transcription:en-US"`.

---

## Incident: captions.debug goes silent (Feb 14 2026, dev)

### Timeline

| Time (UTC)   | Event                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20:02:34     | Dev pod restarts (deploy rollover). Glasses WS opens. Soniox providers initialized.                                                                                                                                    |
| 20:02:35.248 | Dashboard reconnects, sends subscription updates. `syncManagers()` fires repeatedly. Each time: "No active subscriptions - all streams cleaned up" (apps still reconnecting).                                          |
| 20:02:35.269 | captions.debug starts, transitions `stopped → connecting → running`.                                                                                                                                                   |
| 20:02:35.391 | captions.debug connected and authenticated (141ms).                                                                                                                                                                    |
| 20:02:35.418 | captions.debug sends first subscription update.                                                                                                                                                                        |
| 20:02:35.450 | **"Ignoring empty subscription update within reconnect grace window"** — captions.debug's initial empty sub update is dropped by grace window.                                                                         |
| 20:02:35.480 | **Stream A created:** `transcription:en-US` (from recorder's subscription).                                                                                                                                            |
| 20:02:35.525 | captions.debug sends second subscription update (with actual subs).                                                                                                                                                    |
| 20:02:35.539 | captions.debug subscriptions updated successfully.                                                                                                                                                                     |
| 20:02:36.812 | **Stream B created:** `transcription:en-US?hints=ja` (from captions.debug's subscription).                                                                                                                             |
| 20:02:37.929 | "Language subscriptions changed for com.mentra.captions.debug"                                                                                                                                                         |
| 20:02:38+    | **Both streams producing transcriptions simultaneously** for the same audio. Stream A: "Testing, testing, one, two, three." Stream B: "2023, we love testing" (worse quality due to Japanese hints on English speech). |
| 20:03:33.790 | captions.debug sends a subscription update (likely changing language params).                                                                                                                                          |
| 20:03:33.809 | `updateSubscriptions()` runs. **Stream B killed** (`en-US?hints=ja`).                                                                                                                                                  |
| 20:03:33.810 | `ensureStreamsExist()`: "All required streams already exist and are healthy" — Stream A (`en-US`) satisfies the check.                                                                                                 |
| 20:03:33.810 | "Language subscriptions changed for com.mentra.captions.debug"                                                                                                                                                         |
| 20:03:33+    | **captions.debug goes silent.** No more display requests, no more transcription relay.                                                                                                                                 |
| 20:13:19     | Token refresh for captions.debug — app is still "connected" but receiving nothing.                                                                                                                                     |

### What went wrong

Three bugs combined:

---

## Bug 1: Duplicate streams for the same language

**File:** `packages/cloud/src/services/session/transcription/TranscriptionManager.ts`

**What happens:** `getTranscriptionSubscriptions()` collects raw subscription strings from all apps. If recorder subscribes to `"transcription:en-US"` and captions.debug subscribes to `"transcription:en-US?hints=ja"`, these are two different strings. `updateSubscriptions()` does a `Set` comparison on raw strings:

```typescript
// TranscriptionManager.ts L143-144
const desired = new Set(validSubscriptions)
const current = new Set(this.streams.keys())
```

Since `"transcription:en-US"` ≠ `"transcription:en-US?hints=ja"`, both get their own Soniox stream. Two simultaneous WebSocket connections to Soniox, transcribing the same audio, doubling cost and producing conflicting results.

**Impact:**

- 2x Soniox API cost for every user with multiple English-transcription apps
- The `?hints=ja` stream produces worse results for English because the Japanese hints bias the model
- Audio is sent to both streams in `feedAudioToStreams()`, wasting bandwidth

**Root cause:** `getTranscriptionSubscriptions()` doesn't deduplicate by base language. It returns raw subscription strings including query params, and `TranscriptionManager.updateSubscriptions()` treats each unique string as needing its own stream.

---

## Bug 2: Stream killed, app not re-routed

**File:** `packages/cloud/src/services/session/transcription/TranscriptionManager.ts`

**What happens:** When captions.debug's subscription update at 20:03:33 changes its params, `updateSubscriptions()` runs:

```typescript
// TranscriptionManager.ts L156-162
// Stop removed streams
for (const subscription of current) {
  if (!desired.has(subscription)) {
    await this.stopStream(subscription)
  }
}
```

Stream B (`en-US?hints=ja`) is no longer in `desired`, so it's stopped. Then `ensureStreamsExist()` checks if streams exist for all current subscriptions. Stream A (`en-US`) is still alive — "All required streams already exist and are healthy."

But **nobody re-wires captions.debug to receive from Stream A**. The relay logic in `relayDataToApps` calls `getSubscribedApps(effectiveSubscription)` where `effectiveSubscription` is constructed from the stream's data. Stream A produces data with `transcribeLanguage: "en-US"`, so `effectiveSubscription = "transcription:en-US"`.

`getSubscribedApps("transcription:en-US")` then checks each app's subscriptions. **If captions.debug's subscription changed to something that doesn't match `"transcription:en-US"`** (e.g., it changed to a different language, or its subscription was cleared during the update), it won't receive data from Stream A.

Even if the language matches, there's a subtler issue: the `ensureStreamsExist()` check uses `this.activeSubscriptions` which reflects the **deduplicated set of subscription strings**, not per-app routing. A stream can "exist and be healthy" without any particular app being subscribed to it.

**Impact:** App stops receiving transcriptions despite session being alive. User sees captions freeze. Only fix is restarting the app.

---

## Bug 3: Reconnect grace window drops first subscription update

**File:** `packages/cloud/src/services/session/AppSession.ts`

**What happens:** After a pod restart, all apps reconnect. The reconnect flow is:

1. App connects → `State: stopped → connecting → running`
2. App sends initial subscription update (often empty `[]` as a "hello")
3. App sends real subscription update with actual subs

Step 2 hits the grace window:

```typescript
// AppSession.ts L570-576
if (newSubscriptions.length === 0 && timeSinceReconnect <= SUBSCRIPTION_GRACE_MS) {
  this.logger.warn(
    {timeSinceReconnect, graceMs: SUBSCRIPTION_GRACE_MS},
    "Ignoring empty subscription update within reconnect grace window",
  )
  return {applied: false, reason: "Empty subscription ignored during grace window"}
}
```

This is intentional — it prevents apps from accidentally clearing their subs during reconnect. But the timing is tight: at 20:02:35.450, both captions.debug AND recorder hit this warning. If the real subscription update doesn't arrive quickly, the app has stale/empty subscriptions while `syncManagers()` is already creating streams.

**Impact:** During the boot storm after a pod restart, `syncManagers()` gets called multiple times (by dashboard's rapid subscription updates). Each call aggregates subscriptions across apps. If an app's real subscriptions haven't arrived yet (due to grace window timing), `getTranscriptionSubscriptions()` sees incomplete data. Streams get created, destroyed, and recreated as subscriptions trickle in over ~500ms. Race condition central.

**Observed in logs:** `syncManagers()` called 10+ times between 20:02:35.222 and 20:02:35.417 — each time seeing "No active subscriptions - all streams cleaned up" because dashboard was the only app updating, and it doesn't subscribe to transcription.

---

## Bug 4: `getTranscriptionSubscriptions()` returns duplicates

**File:** `packages/cloud/src/services/session/SubscriptionManager.ts`

```typescript
// SubscriptionManager.ts L421-433
private getTranscriptionSubscriptions(): ExtendedStreamType[] {
  const subs: ExtendedStreamType[] = [];
  for (const [, appSession] of this.getAppSessionEntries()) {
    for (const sub of appSession.subscriptions) {
      if (typeof sub === "string" && sub.includes("transcription") && !sub.includes("translation")) {
        subs.push(sub);
      }
    }
  }
  return subs;
}
```

If two apps both subscribe to `"transcription:en-US"`, this returns `["transcription:en-US", "transcription:en-US"]`. `TranscriptionManager.updateSubscriptions()` puts them in a `Set`, so duplicates are harmless for stream creation. But the aggregation doesn't deduplicate by base language either — `"transcription:en-US"` and `"transcription:en-US?hints=ja"` are both returned, leading to Bug 1.

**Impact:** Combined with Bug 1, this is the source of duplicate streams.

---

## Bug 5: `getTargetSubscriptions()` is a no-op

**File:** `packages/cloud/src/services/session/transcription/TranscriptionManager.ts`

```typescript
// TranscriptionManager.ts L1773-1779
private getTargetSubscriptions(
  streamSubscription: ExtendedStreamType,
  effectiveSubscription: ExtendedStreamType,
): ExtendedStreamType[] {
  // Simply return the effective subscription
  return [effectiveSubscription];
}
```

The comment says "Now simplified since there's no optimization mapping." This used to handle routing data from one stream to multiple subscription targets. Now it's a passthrough. The relay only looks up apps subscribed to the `effectiveSubscription` (constructed from the data), not apps subscribed to the `streamSubscription` (what the stream was created for).

This means: if Stream B (`en-US?hints=ja`) produces data, the `effectiveSubscription` is `"transcription:en-US"` (from `data.transcribeLanguage`). Apps subscribed to `"transcription:en-US"` get the data. Apps subscribed to `"transcription:en-US?hints=ja"` also get it (due to `getSubscribedApps` language matching that strips query params). So relay currently works by accident for the `?hints` case.

But if Stream B is killed and only Stream A remains, Stream A's relay correctly constructs `effectiveSubscription = "transcription:en-US"` and finds subscribed apps. **The issue is that after a subscription update that kills a stream, `relayDataToApps` might not find the app if its subscription state changed during the update.**

**Impact:** Fragile routing that works by coincidence in steady state but breaks during subscription transitions.

---

## Summary

| Bug | Severity | File                    | Description                                                                                       |
| --- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | High     | TranscriptionManager.ts | Duplicate Soniox streams for same base language with different query params. 2x cost.             |
| 2   | High     | TranscriptionManager.ts | Stream killed during subscription update, app not re-routed to surviving stream. Captions freeze. |
| 3   | Medium   | AppSession.ts           | Reconnect grace window + rapid syncManagers() calls = stream churn during pod restart boot storm. |
| 4   | Low      | SubscriptionManager.ts  | `getTranscriptionSubscriptions()` doesn't deduplicate by base language. Feeds into Bug 1.         |
| 5   | Low      | TranscriptionManager.ts | `getTargetSubscriptions()` is dead code (passthrough). Relay routing works by accident.           |

---

## Conclusions

The core issue is that **stream identity is coupled to raw subscription strings** when it should be coupled to **base language**. Two apps wanting English transcription with different hint preferences should share one stream, and the hints should be merged or the "best" hint set chosen. The relay layer already does language-aware matching (stripping query params), but the stream creation layer doesn't.

The secondary issue is the **subscription update lifecycle**: killing a stream and checking "do streams exist" is not the same as "are all apps routed to a stream." The `ensureStreamsExist()` check is stream-centric, not app-centric.

The boot storm issue (Bug 3) is a symptom of `syncManagers()` being called too eagerly during reconnection, before all apps have re-established their subscriptions. A debounce or "all apps reconnected" gate would help.

## Next Steps

- Write spec.md with the fix design: stream dedup by base language, subscription-aware relay routing, and boot storm debounce
- Investigate whether the `?hints=` parameter actually improves Soniox quality enough to justify separate streams (it doesn't appear to — the hints=ja stream produced worse English results)
- Check if this same pattern exists in `TranslationManager` (it has similar `ensureStreamsExist()` logic)
