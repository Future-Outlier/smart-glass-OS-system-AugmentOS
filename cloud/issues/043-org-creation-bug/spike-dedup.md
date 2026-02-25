# Spike: TOCTOU Race in `createPersonalOrg`

## Overview

**What this doc covers:** The remaining TOCTOU race in `createPersonalOrg` where concurrent calls can both pass the idempotency check and create duplicate personal orgs, plus the fix: deterministic slug suffixes derived from the user's `_id`.

**Why this doc exists:** PR review flagged that after the initial org-bug fix, two concurrent `createPersonalOrg` calls can generate different random slug suffixes, bypass the E11000 catch entirely, and both save successfully. This doc evaluates approaches and specifies the chosen fix.

**Who should read this:** Anyone working on the cloud console or organization system.

## Background

The initial fix on `cloud/org-bug` added:

- `generateSlug()` — appends a **random** suffix when the base slug collides
- `createPersonalOrg()` — pre-insert `findOne` idempotency check + E11000 catch
- Frontend — removed `api.orgs.create()` entirely; relies on backend bootstrap + retry

The random suffix is the problem. It closes the slug collision between **different users** with the same name, but it opens a TOCTOU race for the **same user** — concurrent calls get different random suffixes, so neither hits E11000.

## The Race

```
Call A: findOne({ "members.user": user._id }) → null     (no org yet)
Call B: findOne({ "members.user": user._id }) → null     (A hasn't saved yet)
Call A: generateSlug("alex-s-org") → "alex-s-org-r4nd0m"  (random suffix)
Call B: generateSlug("alex-s-org") → "alex-s-org-x7y8z9"  (different random suffix)
Call A: org.save() → ✅
Call B: org.save() → ✅                                    (no E11000 — different slug)
Result: user has 2 personal orgs
```

The E11000 catch never fires because the slugs differ. The pre-check doesn't help because both calls pass it before either commits.

## Options Considered

### Option A: Post-save dedup (query + delete extras)

After `org.save()`, query all orgs for the user, keep the oldest `_id`, delete the rest.

- ❌ Scoping the dedup query is fragile — must avoid deleting legitimate invited/team orgs. We already caught a bug where it would have deleted any org the user belonged to. More edge cases likely lurk (user manually created an org with the same name pattern, etc.)
- ❌ Brief window where 2 orgs exist and can be observed by other code paths
- ❌ Stale references in `user.organizations` if the losing org's ID was already pushed

### Option B: `personalOrgOwner` unique sparse index + `findOneAndUpdate` upsert

Truly atomic — impossible to create duplicates at the DB level.

- ❌ Schema migration + backfill for all existing personal orgs (no existing "personal" flag to identify them)
- ❌ `$setOnInsert` with nested `members` array needs careful testing
- ❌ Slug collision during upsert from a _different_ user triggers E11000 on the slug index, not the personalOrgOwner index — must distinguish which index caused the error
- ❌ Heaviest change for the narrowest race window

### Option C: Deterministic slug suffix from user ID ✅ (chosen)

Instead of a random suffix, derive the suffix from `user._id`. Same user → same suffix → same slug → E11000 fires → existing catch handles it.

- ✅ One-line logic change — replace `Math.random()` with `user._id.toString().slice(-8)`
- ✅ The E11000 catch already exists and works — this just ensures it actually fires for same-user races
- ✅ No schema change, no post-save queries, no cleanup logic
- ✅ Different users still get different suffixes (different ObjectIds) — no new collision risk between users
- ⚠️ Extremely rare edge case: two different users whose ObjectId last-8-chars match AND who have the same name prefix → slug collision. Handled by a random-suffix retry in the E11000 catch.

### Option D: Single backend creation point

Remove `createPersonalOrg` calls from all paths except `getConsoleAccount`.

- ❌ Larger refactor with blast radius — `findOrCreateUser` is called from SDK auth, dev portal, not just console
- ❌ Ordering dependency — if `getConsoleAccount` hasn't run yet when another path needs the org, it's missing

## Chosen Approach: Option C

### How it works

`createPersonalOrg` currently calls `generateSlug(personalOrgName)` which, on collision, appends a random suffix. Instead, `createPersonalOrg` builds the slug itself using a **deterministic suffix** derived from the user's ObjectId:

```
Base slug:   "alex-s-org"           (from org name)
User suffix: "99439011"             (last 8 chars of user._id.toString())
Final slug:  "alex-s-org-99439011"  (deterministic per-user)
```

Now when two concurrent calls race:

```
Call A: findOne → null
Call B: findOne → null
Call A: slug = "alex-s-org-99439011"   (deterministic from user._id)
Call B: slug = "alex-s-org-99439011"   (same user → same slug)
Call A: org.save() → ✅
Call B: org.save() → E11000 duplicate key on slug_1 index
Call B: catch → findOne({ "members.user": user._id }) → finds A's org → returns it ✅
Result: 1 org. Race closed.
```

The existing E11000 catch does the right thing — it just never fired before because random suffixes meant the slugs never collided.

### Edge cases

**Different users, same name prefix:**

Alex A (`_id: ...aaa11111`) and Alex B (`_id: ...bbb22222`) both generate `alex-s-org` as the base slug.

- Alex A gets suffix `aaa11111` → slug `alex-s-org-aaa11111`
- Alex B gets suffix `bbb22222` → slug `alex-s-org-bbb22222`
- Different slugs → both save → ✅ correct, they're different users

**Different users, same name prefix, same ObjectId tail (extremely rare):**

Two users whose last 8 hex chars of `_id` happen to match (1 in 4 billion).

- Both generate the same slug → one saves, the other hits E11000
- E11000 catch: `findOne({ "members.user": user._id })` → no result (the colliding org belongs to someone else)
- Falls through → retry with a random suffix → saves → ✅

**Base slug has no collision:**

If `alex-s-org` doesn't exist at all (first alex user ever), no suffix is appended. Slug is just `alex-s-org`. Same behavior as before.

### What changes

**`organization.service.ts` — `createPersonalOrg` only:**

1. Build slug inline instead of calling `generateSlug()` — need the user's `_id` for the suffix, which `generateSlug` doesn't have access to
2. On base slug collision: append `user._id.toString().slice(-8)` instead of `Math.random().toString(36).slice(2, 8)`
3. In E11000 catch: after the existing same-user lookup fails (meaning it's a different-user hash collision), retry with a random suffix as fallback

No changes to `generateSlug()` itself — it's used by `createOrg` (manual creation) where random suffixes are correct.

No frontend changes needed — the frontend already doesn't create orgs (previous commit).
