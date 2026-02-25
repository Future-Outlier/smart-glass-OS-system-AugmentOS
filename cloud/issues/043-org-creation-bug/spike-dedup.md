# Spike: Personal Org Dedup + Frontend Creation Removal

## Overview

**What this doc covers:** Remaining race conditions in the org creation flow after the initial fix (slug uniqueness, infinite loop, VersionError), specifically the TOCTOU gap in `createPersonalOrg` and the unnecessary frontend org creation path.

**Why this doc exists:** A PR review flagged that two concurrent `createPersonalOrg` calls can both pass the `findOne` idempotency check, generate different suffixed slugs, and both save successfully — leaving a user with duplicate personal orgs. Investigation also revealed the frontend is creating orgs via a completely separate code path (`createOrg`) that can't be deduplicated by backend guards at all.

**Who should read this:** Anyone working on the cloud console or organization system.

## Background

The initial fix on `cloud/org-bug` addressed:

- Slug uniqueness (`generateSlug` now appends random suffix on collision)
- `createPersonalOrg` idempotency (pre-insert `findOne` check + E11000 catch)
- Frontend infinite retry loop (`useCallback`, ref mutex, single-attempt guard)
- Mongoose VersionError (`user.save()` → atomic `User.updateOne`)
- Frontend recovery (re-list orgs after failed create)

These fixes stop the 7,000-error infinite loop. But two gaps remain.

## Findings

### 1. TOCTOU race in `createPersonalOrg` can still create duplicate orgs

Current code after the initial fix:

```ts
// packages/cloud/src/services/core/organization.service.ts
public static async createPersonalOrg(user: UserI): Promise<Types.ObjectId> {
  // Pre-check
  const existingOrg = await Organization.findOne({ "members.user": user._id }).lean();
  if (existingOrg) return existingOrg._id;

  const slug = await generateSlug(personalOrgName); // appends random suffix if collision
  const org = new Organization({ name, slug, ... });

  try {
    await org.save();
    return org._id;
  } catch (error) {
    if (error.code === 11000) {
      const raceOrg = await Organization.findOne({ "members.user": user._id }).lean();
      if (raceOrg) return raceOrg._id;
    }
    throw error;
  }
}
```

The race:

```
Call A: findOne → null                    (no org yet)
Call B: findOne → null                    (A hasn't saved yet)
Call A: generateSlug → "alex-s-org-abc"   (random suffix)
Call B: generateSlug → "alex-s-org-xyz"   (different random suffix)
Call A: org.save() → ✅                   (slug "alex-s-org-abc")
Call B: org.save() → ✅                   (slug "alex-s-org-xyz", no E11000 — different slug)
Result: user has 2 personal orgs
```

The E11000 catch doesn't fire because the two orgs have different slugs. The pre-check doesn't help because both calls pass it before either saves.

### 2. The frontend creates orgs via a completely separate code path

`OrganizationContext.ensurePersonalOrg` calls:

```ts
// websites/console/src/context/OrganizationContext.tsx
const newOrg = await api.orgs.create(personalOrgName)
```

This hits `POST /api/orgs` → `OrganizationService.createOrg()` — a generic "create organization" function, NOT `createPersonalOrg`. It has no idempotency check, no membership pre-check, and the `personalOrgOwner`-style dedup we add to `createPersonalOrg` would never apply to it.

So even if `createPersonalOrg` were perfectly atomic, the frontend can still race against it via a different code path and create a second org.

### 3. The frontend uses the wrong list endpoint

Two list endpoints exist:

| Endpoint                | What it does                                         | Bootstraps org?                                     |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `GET /api/orgs`         | `User.findOne` → `OrganizationService.listUserOrgs`  | ❌ No                                               |
| `GET /api/console/orgs` | `getOrCreateUserByEmail` → `findOrCreateUser` → list | ✅ Yes (triggers `createPersonalOrg` for new users) |

The frontend `OrganizationContext` uses `api.orgs.list()` which hits `GET /api/orgs` — the endpoint that does NOT bootstrap. So even though the backend is capable of auto-creating the org on the list call, the frontend bypasses that entirely and then tries to create one itself.

### 4. `ensurePersonalOrg` redundantly lists orgs

```ts
// OrganizationContext.tsx
const loadOrganizations = useCallback(async () => {
  const organizations = await api.orgs.list() // List #1
  if (organizations.length === 0) {
    await ensurePersonalOrg() // which does...
    return
  }
  // ...
})

const ensurePersonalOrg = useCallback(async () => {
  const organizations = await api.orgs.list() // List #2 (redundant)
  if (organizations.length > 0) {
    /* set state */ return
  }
  const newOrg = await api.orgs.create(personalOrgName) // Create
  // ...
})
```

On first login: List → 0 → `ensurePersonalOrg` → List again → 0 → Create. Two list calls + one create call, when the backend should be handling this.

### 5. Race between backend bootstrap and frontend list

Even ignoring the frontend create path, there's a timing issue:

```
Browser mounts
  ├─ GET /api/console/account → getConsoleAccount → createPersonalOrg (takes ~200ms)
  └─ GET /api/orgs            → listUserOrgs       → returns [] (account call hasn't committed yet)
                                                     → frontend sees 0 orgs → tries to create
```

The account fetch bootstraps the org, but the list call returns before it commits. The frontend thinks no org exists and tries to create one.

## Conclusions

| Problem                                  | Fix                                                                                | Risk                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| TOCTOU creates duplicate orgs            | Post-save dedup: query all user orgs, keep oldest `_id`, delete extras             | Low — brief duplicate window, deterministic cleanup |
| Frontend creates via separate path       | Remove `api.orgs.create()` from `ensurePersonalOrg` entirely                       | None — backend already handles creation             |
| Frontend uses non-bootstrapping endpoint | Switch to `api.console.orgs.list()` or trigger account fetch first                 | None — console endpoint already exists              |
| Redundant list calls                     | `ensurePersonalOrg` should not re-list; just trigger backend bootstrap + retry     | None — fewer network calls                          |
| Race between account fetch and list      | Frontend waits for account fetch before listing orgs, or retries list with backoff | None — just ordering                                |

### Fix 1: Post-save dedup in `createPersonalOrg`

After a successful `org.save()`, query all orgs where the user is a member. If count > 1, keep the one with the lowest `_id` (ObjectIds are monotonically increasing, so lowest = created first), delete the rest.

```ts
await org.save()

// Dedup: if a concurrent call also created an org for this user,
// deterministically keep the oldest (lowest _id) and delete extras.
const allUserOrgs = await Organization.find({"members.user": user._id}).sort({_id: 1}).lean()

if (allUserOrgs.length > 1) {
  const winner = allUserOrgs[0]
  const losers = allUserOrgs.slice(1)
  await Organization.deleteMany({_id: {$in: losers.map((o) => o._id)}})
  // Also clean up stale references in the user document
  const loserIds = losers.map((o) => o._id)
  await User.updateOne({_id: user._id}, {$pull: {organizations: {$in: loserIds}}})
  return winner._id as Types.ObjectId
}

return org._id
```

Why this is safe:

- **Deterministic winner**: all concurrent callers sort by `_id` ascending and pick the first. They all agree on the winner without coordination.
- **Loser cleanup is idempotent**: `deleteMany` on already-deleted docs is a no-op. `$pull` on already-removed IDs is a no-op.
- **Brief duplicate window**: between `org.save()` and the dedup query (~10ms), the user briefly has 2 orgs. No code path cares about this window — the list endpoints return whatever exists, and the user hasn't even seen the page yet.

Why NOT a schema-level constraint (e.g., `personalOrgOwner` unique index):

- Requires schema migration + backfill for all existing personal orgs
- No existing flag to identify which orgs are "personal" vs. team orgs
- `findOneAndUpdate` with upsert interacts badly with the `slug` unique index (E11000 on wrong index if a different user has the same name)
- Post-save dedup achieves the same result with zero schema changes

### Fix 2: Remove frontend org creation entirely

The frontend should not call `api.orgs.create()` to bootstrap a personal org. The backend already does this in `getConsoleAccount` (called on every page load via `GET /api/console/account`).

Replace `ensurePersonalOrg`:

```
Before:  list → 0 → list again → 0 → api.orgs.create() → set state
After:   api.console.account.get() → list → set state (retry with backoff if empty)
```

The account fetch triggers `getConsoleAccount` → `createPersonalOrg` on the backend. Then the list call finds the org. If there's a timing gap, retry the list 2–3 times with 1s backoff.

This eliminates:

- The race between frontend `createOrg` and backend `createPersonalOrg` (different code paths)
- The redundant second list call inside `ensurePersonalOrg`
- The frontend using `POST /api/orgs` (which has no idempotency check)

### Fix 3: Switch to console list endpoint

Change `loadOrganizations` to use `api.console.orgs.list()` instead of `api.orgs.list()`. The console endpoint goes through `getOrCreateUserByEmail` → `findOrCreateUser`, which bootstraps the org if missing. This means even the list call itself triggers org creation as a side effect — belt and suspenders.

## Next Steps

Implement all three fixes on the existing `cloud/org-bug` branch. Changes:

**Backend** (1 file):

- `organization.service.ts` — add post-save dedup to `createPersonalOrg`

**Frontend** (2 files):

- `OrganizationContext.tsx` — remove `api.orgs.create()`, replace with account-fetch + console list + retry
- `OrganizationContext.tsx` — switch `loadOrganizations` to use `api.console.orgs.list()`
