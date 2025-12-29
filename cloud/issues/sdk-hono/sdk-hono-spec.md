# SDK Hono Refactor Spec

## Overview

Replace Express with Hono in `@mentra/sdk` AppServer, integrating with Bun's fullstack framework to unify React webviews and API routes in a single server.

## Problem

Technical issues with current Express-based SDK:

1. **Two-server architecture** required for React webviews
   - Express on :3333 proxies to Bun on :3334
   - Manual proxy implementation (~50 lines)
   - Auth header forwarding complexity
   - SSE routes need special handling to bypass proxy

2. **Express baggage** slows Bun development
   - cookie-parser, multer dependencies
   - Node.js-style middleware patterns
   - No native TypeScript inference
   - `@types/express` devDependency

3. **Poor DX for custom routes**
   - `getExpressApp()` returns untyped Express instance
   - No middleware type safety
   - Verbose `(req, res) => { res.json(...) }` pattern

### Evidence

From `Apps/LiveCaptionsOnSmartGlasses/src/index.ts`:

```typescript
// Two servers, manual proxy, auth forwarding...
const BUN_PORT = PORT + 1; // 3334
const bunServer = serve({ port: BUN_PORT, routes: {...} })
expressApp.all("*", async (req, res) => {
  const bunUrl = `http://localhost:${BUN_PORT}${req.originalUrl}`
  proxyHeaders["x-auth-user-id"] = authReq.authUserId
  // ...50 lines of proxy code
})
```

### Constraints

- **Breaking change for apps using `getExpressApp()`** - migration guide needed
- **Bun 1.2.3+ required** for fullstack framework
- **Must maintain all SDK endpoints** - webhook, tool, health, settings, photo-upload, mentra-auth

## Goals

1. **Single server architecture** - No more Express+Bun proxy pattern
2. **Native Bun integration** - `Bun.serve()` with routes for React, fetch for API
3. **Hono for API layer** - Modern, typed, fast
4. **AppServer extends Hono** - Developers use `.get()`, `.post()` directly
5. **Zero proxy code** - Auth handled by Hono middleware

## Non-Goals

- SSR for React (client-side rendering only)
- Cloudflare Workers deployment (Bun-specific for now)
- Backward compatibility shim for Express apps

## Open Questions

1. **multer replacement for photo uploads?**
   - Option: Hono's built-in body parsing for multipart
   - Option: Bun-native file handling
   - **Need to test**

2. **Cookie handling migration?**
   - Express: `cookie-parser` + `res.cookie()`
   - Hono: `getCookie()` / `setCookie()` from `hono/cookie`
   - **Straightforward migration**

3. **Static file serving for apps without webview?**
   - Hono's `serveStatic` from `hono/bun`
   - Or just omit routes in `Bun.serve()`
   - **Decision**: Support both patterns
