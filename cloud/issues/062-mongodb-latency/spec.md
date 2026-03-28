# Spec: MongoDB Latency — Event Loop Gap Detector, Cumulative Metrics, App Cache

## Overview

**What this doc covers:** Three changes to prove MongoDB is the crash cause and fix the worst of it — an event loop gap detector that catches blocking events in real-time, cumulative MongoDB blocking metrics in system vitals, and an in-memory cache for the `apps` collection that eliminates 18 hot-path DB round-trips per session.
**Why this doc exists:** The 062 spike found that France's event loop is blocked by MongoDB for 9% of total time (162s out of 1800s). 18 hot-path DB calls hit the network on every session connect, app start, and subscription update. GC is confirmed NOT the primary cause (54ms probes, 0MB freed). But we haven't proven the final link: that MongoDB blocking is what causes the health check to fail and the pod to die. The first two changes prove it. The third fixes it.
**What you need to know first:** [062 spike](./spike.md) for full audit and data, [061 spec](../061-crash-investigation/spec.md) for existing diagnostics.
**Who should read this:** Anyone reviewing the PR.

## The Problem in 30 Seconds

Every `App.findOne({ packageName })` on a hot path blocks the event loop for 80ms (US Central) to 370ms (East Asia) of pure network round-trip time. The query is indexed and executes in 0ms on the server — it's the network that's slow. With 65 sessions, each triggering multiple app lookups during connect/reconnect, the cumulative blocking can reach seconds per minute. When it coincides with a health check, the probe times out, and after 15 consecutive failures (75 seconds), Kubernetes kills the pod.

We have the aggregate number (9% blocking on France) but not the per-second correlation. This spec adds the instrumentation to get that correlation, and the cache to eliminate the problem.

## Spec

### B1. Event Loop Gap Detector

**File:** `packages/cloud/src/services/metrics/SystemVitalsLogger.ts`

**What:** A `setInterval(1000)` that records `Date.now()` each tick. If the interval between ticks exceeds 2000ms (double the expected 1000ms), something blocked the event loop for the excess duration. Log the gap.

**Why:** This is the missing link. Right now we know "MongoDB query took 520ms" and "the pod crashed at 16:08." We DON'T know "the event loop was blocked for 520ms at 16:08:03 and the health check arrived during that gap." The gap detector provides that.

**Implementation:**

```typescript
private gapDetectorInterval?: NodeJS.Timeout;
private lastGapTick: number = Date.now();

private startGapDetector(): void {
  this.lastGapTick = Date.now();
  this.gapDetectorInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = now - this.lastGapTick;
    this.lastGapTick = now;

    // If more than 2x the expected 1s interval, the event loop was blocked
    if (elapsed > 2000) {
      const gapMs = elapsed - 1000; // subtract the expected 1s
      logger.warn(
        {
          feature: "event-loop-gap",
          gapMs,
          expectedMs: 1000,
          actualMs: elapsed,
          rssMB: Math.round(process.memoryUsage().rss / 1048576),
          activeSessions: UserSession.getAllSessions().length,
        },
        `Event loop gap: ${gapMs}ms (expected 1000ms, actual ${elapsed}ms)`,
      );
    }
  }, 1000);
}
```

**Call in `start()`**, store handle, clear in `stop()`. Same lifecycle pattern as the GC probe.

**Log format:**

```json
{
  "feature": "event-loop-gap",
  "level": "warn",
  "gapMs": 520,
  "expectedMs": 1000,
  "actualMs": 1520,
  "rssMB": 612,
  "activeSessions": 22
}
```

**How to use:** Query BetterStack for `feature: "event-loop-gap"` in the 5 minutes before a crash. If gaps appear and their timestamps match slow-query timestamps, MongoDB caused the gap. If gaps appear but no slow queries are nearby, something else caused them.

**Volume:** Only logs when the gap exceeds 1 second. Under normal operation: 0 logs. During degradation: a few per minute at most.

**Performance impact:** One `Date.now()` call per second. Negligible.

### B2. Cumulative MongoDB Blocking Metric

**File:** `packages/cloud/src/connections/mongodb.connection.ts` (extend existing slow-query plugin)
**File:** `packages/cloud/src/services/metrics/SystemVitalsLogger.ts` (consume the metric)

**What:** The slow-query plugin already times every query exceeding the threshold. Extend it to accumulate three counters that reset every 30 seconds when the vitals logger reads them:

- `mongoQueryCount` — number of queries exceeding threshold in this window
- `mongoTotalBlockingMs` — sum of all slow query durations in this window
- `mongoMaxQueryMs` — slowest single query in this window

**Implementation in mongodb.connection.ts:**

```typescript
// Exported accumulator — SystemVitalsLogger reads and resets every 30s
class MongoQueryStats {
  count = 0
  totalMs = 0
  maxMs = 0

  record(durationMs: number): void {
    this.count++
    this.totalMs += durationMs
    if (durationMs > this.maxMs) this.maxMs = durationMs
  }

  getAndReset(): {count: number; totalMs: number; maxMs: number} {
    const snapshot = {count: this.count, totalMs: this.totalMs, maxMs: this.maxMs}
    this.count = 0
    this.totalMs = 0
    this.maxMs = 0
    return snapshot
  }
}

export const mongoQueryStats = new MongoQueryStats()
```

In the existing `slowQueryPlugin` post hook, after logging the warning, add:

```typescript
mongoQueryStats.record(durationMs)
```

**Note:** Record ALL queries that exceed the threshold, not just the ones we log. The logging has its own threshold (`MONGOOSE_SLOW_QUERY_MS`), but the stats should use the same threshold for consistency.

**Implementation in SystemVitalsLogger.ts:**

Import `mongoQueryStats` and add to the existing vitals log:

```typescript
import { mongoQueryStats } from "../../connections/mongodb.connection";

// Inside logVitals(), before the logger.info call:
const mongoStats = mongoQueryStats.getAndReset();

// Add to the existing logger.info object:
{
  // ... existing fields ...
  mongoQueryCount: mongoStats.count,
  mongoTotalBlockingMs: Math.round(mongoStats.totalMs),
  mongoMaxQueryMs: Math.round(mongoStats.maxMs * 10) / 10,
}
```

**Additional fields in existing `system-vitals` log:**

```json
{
  "feature": "system-vitals",
  "mongoQueryCount": 46,
  "mongoTotalBlockingMs": 5428,
  "mongoMaxQueryMs": 521.3
}
```

**How to use:** If `mongoTotalBlockingMs` is 5,000ms in a 30-second window, MongoDB blocked the event loop for 17% of the time. If this number is consistently high in the minutes before a crash and drops after a restart (reconnect storm settles), MongoDB is the cause.

**Performance impact:** One integer addition per query. Negligible.

### B3. In-Memory App Cache

**File:** `packages/cloud/src/services/core/app-cache.service.ts` (new)

**What:** A singleton cache that loads all `App` documents at boot and serves `getByPackageName()` from memory. Refreshes every 5 minutes. All 18+ hot-path `App.findOne({ packageName })` calls switch to use the cache instead of hitting MongoDB.

**Why:** The `apps` collection is 1,314 documents, 2 MB total. It changes rarely (new apps are published maybe once a day). Every hot-path query against it pays 80-370ms of network RTT for data that's effectively static. Caching it in memory eliminates all of that RTT.

**Implementation:**

```typescript
import {App} from "../../models/app.model"
import type {AppI} from "../../models/app.model"
import {logger as rootLogger} from "../logging/pino-logger"

const logger = rootLogger.child({service: "AppCache"})

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

class AppCacheService {
  private cache: Map<string, AppI> = new Map()
  private allApps: AppI[] = []
  private refreshInterval?: NodeJS.Timeout
  private loaded = false
  private lastRefresh: number = 0

  async initialize(): Promise<void> {
    await this.refresh()
    this.refreshInterval = setInterval(() => {
      this.refresh().catch((err) => logger.error(err, "App cache refresh failed"))
    }, REFRESH_INTERVAL_MS)
    logger.info({count: this.cache.size, refreshMs: REFRESH_INTERVAL_MS}, "App cache initialized")
  }

  async refresh(): Promise<void> {
    const t0 = performance.now()
    const apps = await App.find({}).lean<AppI[]>()
    const elapsed = performance.now() - t0

    this.cache.clear()
    for (const app of apps) {
      if (app.packageName) {
        this.cache.set(app.packageName, app)
      }
    }
    this.allApps = apps
    this.loaded = true
    this.lastRefresh = Date.now()

    logger.info(
      {count: apps.length, refreshMs: Math.round(elapsed), feature: "app-cache"},
      `App cache refreshed: ${apps.length} apps in ${Math.round(elapsed)}ms`,
    )
  }

  getByPackageName(packageName: string): AppI | null {
    if (!this.loaded) {
      logger.warn("App cache not loaded yet — falling back to DB")
      return null // caller should fall back to DB query
    }
    return this.cache.get(packageName) ?? null
  }

  getAll(): AppI[] {
    return this.allApps
  }

  getByPackageNames(packageNames: string[]): AppI[] {
    return packageNames.map((name) => this.cache.get(name)).filter((app): app is AppI => app !== undefined)
  }

  // Force refresh after a write (app created/updated/deleted)
  async invalidate(): Promise<void> {
    await this.refresh()
  }

  isLoaded(): boolean {
    return this.loaded
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = undefined
    }
  }
}

export const appCache = new AppCacheService()
```

**Initialization:** Call `appCache.initialize()` in `index.ts` after MongoDB connects, before the server starts accepting connections. This ensures the cache is warm before any sessions connect.

**Hot-path migration pattern:** Each call site changes from:

```typescript
// Before — blocks event loop for 80-370ms
const app = await App.findOne({packageName})
```

to:

```typescript
// After — instant memory lookup, 0ms
const app = appCache.getByPackageName(packageName)
if (!app) {
  // Cache miss (shouldn't happen for valid apps). Fall back to DB.
  const dbApp = await App.findOne({packageName}).lean()
  // Optionally trigger a cache refresh
}
```

**Call sites to migrate (hot paths only in this spec):**

| #   | File                          | Current Call                                | Notes                                       |
| --- | ----------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1   | `AppManager.ts:L612`          | `App.find()`                                | Change to `appCache.getByPackageNames(...)` |
| 2   | `SubscriptionManager.ts:L269` | `App.findOne({ packageName })`              | Change to `appCache.getByPackageName(...)`  |
| 3   | `app-message-handler.ts:L672` | `App.findOne({ packageName })`              | Change to `appCache.getByPackageName(...)`  |
| 4   | `sdk.auth.service.ts:L108`    | `App.findOne({ packageName }).lean()`       | Change to `appCache.getByPackageName(...)`  |
| 5   | `system-app.api.ts:L143`      | `App.find({ packageName: { $in: [...] } })` | Change to `appCache.getByPackageNames(...)` |
| 6   | `system-app.api.ts:L364`      | `App.find()` + filter                       | Change to `appCache.getAll()` + filter      |
| 7   | `system-app.api.ts:L411`      | `App.findOne({ packageName })`              | Change to `appCache.getByPackageName(...)`  |
| 8   | `system-app.api.ts:L457`      | `App.findOne({ packageName })`              | Change to `appCache.getByPackageName(...)`  |
| 9   | `system-app.api.ts:L561`      | `App.findOne({ packageName })`              | Change to `appCache.getByPackageName(...)`  |

**Cold-path call sites (admin, developer console, store):** Leave as-is for now. They're infrequent and don't contribute to crashes. Migrate in a follow-up if desired.

**Write-through invalidation:** When an app is created, updated, or deleted (cold-path operations in `app.service.ts`, `console.apps.service.ts`, `developer.service.ts`), call `appCache.invalidate()` after the DB write. This ensures the cache reflects the change within seconds, not 5 minutes.

**Cache staleness:** Worst case, a newly published app takes up to 5 minutes to appear for glasses users. In practice, `invalidate()` on writes makes this near-instant. The 5-minute timer is a safety net for writes that bypass the app service (direct DB edits, migrations).

**Memory cost:** 1,314 docs × ~1.5 KB avg = ~2 MB. Negligible compared to the 200-600 MB RSS baseline.

## What This Does NOT Include

| Explicitly out of scope                              | Why                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `.lean()` on all read queries                        | Good cleanup but not crash-critical. Track in tech-debt.md (TD-1).                |
| Atomic `$set` instead of `.save()` on User hot paths | Good fix but needs careful audit of each call site. Track in tech-debt.md (TD-2). |
| N+1 query fixes                                      | Cold paths only. Track in tech-debt.md (TD-3).                                    |
| MongoDB read replicas                                | Expensive, need to prove cache doesn't solve it first.                            |
| Caching User or UserSettings collections             | More complex (per-user data, frequent writes). Evaluate after app cache ships.    |

## Decision Log

| Decision                                               | Alternatives considered                      | Why we chose this                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5-minute refresh interval                              | 1 min, 10 min, event-driven only             | 5 min balances freshness with DB load. With write-through invalidation, the timer is just a safety net. 1 min is too frequent for a near-static collection.                                             |
| Cache returns lean-equivalent objects                  | Cache full Mongoose Documents                | Lean objects use ~50% less memory and CPU. The cache serves read-only lookups — no one needs `.save()` on a cached app.                                                                                 |
| Fallback to DB on cache miss                           | Throw error, return null                     | Graceful degradation. If the cache isn't loaded yet (boot race) or a brand-new app isn't cached, the DB query still works. Just slower.                                                                 |
| Hot paths only in this spec                            | All 262 call sites                           | 18 hot-path calls cause crashes. 220+ cold-path calls don't. Fix what matters, measure the impact, then decide on the rest.                                                                             |
| Gap detector threshold at 2000ms                       | 1500ms, 3000ms, 5000ms                       | The interval is 1000ms. 2000ms means the event loop was blocked for at least 1 full second — that's already past the health check timeout. Lower thresholds would catch more events but increase noise. |
| Record all slow queries in stats, not just logged ones | Only record queries above a higher threshold | Consistency — the threshold for recording matches the threshold for logging (`MONGOOSE_SLOW_QUERY_MS`). If you want to tune them separately, add a second env var later.                                |

## Testing Plan

### On cloud-debug (before PR to main)

1. **Gap detector fires during forced delay** — add a temporary `Bun.sleepSync(2000)` in a test route, hit it, verify `feature: "event-loop-gap"` appears in BetterStack with `gapMs` ~2000.
2. **MongoDB stats appear in vitals** — check `feature: "system-vitals"` logs for `mongoQueryCount`, `mongoTotalBlockingMs`, `mongoMaxQueryMs` fields.
3. **App cache loads** — check BetterStack for `feature: "app-cache"` log at boot showing count and refresh time.
4. **App cache serves hot paths** — connect glasses, start an app. Verify no `slow-query` logs from `apps.findOne({ packageName })` for cached apps.
5. **Cache fallback works** — if cache somehow misses (e.g., brand new app), the DB query still works. Test by querying a packageName that exists in DB but force a cache miss.
6. **Write-through invalidation** — publish a test app via developer console, verify it appears in glasses within seconds (not 5 minutes).

### After PR to main (monitoring cloud-prod)

7. **Correlate gaps with crashes** — query BetterStack: do `event-loop-gap` warnings appear in the 5 minutes before each crash? If yes, what caused them? Cross-reference with `slow-query` timestamps.
8. **MongoDB blocking metric** — does `mongoTotalBlockingMs` drop after the app cache is active? On France, it was 162s/1800s (5,428ms per 30s window). After cache, hot-path queries should be eliminated, dropping this number significantly.
9. **Crash frequency** — does crash rate decrease? Target: France goes from crashing every ~3 hours to stable. US Central goes from ~6-7 crashes/day to <2.
10. **Cache boot time** — how long does the initial `App.find({}).lean()` take? On US Central it should be ~100ms. On East Asia ~700ms. This blocks server startup, not the event loop during operation.

### What "success" looks like

- `event-loop-gap` warnings correlate with crash timing → we now know what blocks the event loop before each crash.
- `mongoTotalBlockingMs` drops 80%+ on hot paths after cache → app queries were the dominant blocker.
- Crash frequency drops meaningfully → MongoDB latency was a primary crash contributor.

If crash frequency doesn't change after the cache: MongoDB was a contributor but not the primary cause, and the event loop gap detector will point us to the real blocker. Either outcome gives us actionable data.

## Rollout

1. **Implement on `cloud/062-mongodb-audit` branch** — all three changes.
2. **Deploy to cloud-debug** — test all 6 items above.
3. **PR to main** — deploys to all prod regions.
4. **Monitor** — one full crash cycle (~3 hours for France, ~2-4 hours for US Central).
5. **If crashes drop** — success. Move to tech debt cleanup (lean, atomic updates).
6. **If crashes persist** — event loop gap detector tells us what's actually blocking. Investigate that.
