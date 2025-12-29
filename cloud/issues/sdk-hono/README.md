# SDK Express → Hono Refactor

Migrate `@mentra/sdk` AppServer from Express to Hono with Bun fullstack integration.

## Documents

- **[sdk-hono-spec.md](./sdk-hono-spec.md)** - Problem, goals, constraints
- **[sdk-hono-architecture.md](./sdk-hono-architecture.md)** - Technical design

## Quick Context

**Current**: AppServer wraps Express, requiring two-server architecture for React webviews (Express + Bun). Manual proxy, auth header forwarding, 800+ lines of boilerplate.

**Proposed**: AppServer extends Hono, uses `Bun.serve()` with `routes` for React/HMR and `fetch` for Hono API. Single server, native bundling.

## Key Insight

Bun 1.2.3+ fullstack framework provides:

- `routes`: HTML imports auto-bundled with HMR
- `fetch`: Fallback handler → delegate to Hono

```typescript
Bun.serve({
  routes: {"/*": webview}, // Bun handles React
  fetch: honoApp.fetch, // Hono handles API
  development: {hmr: true},
})
```

This eliminates the two-server pattern entirely.

## Status

- [x] Investigation of SDK Express usage (8 touch points)
- [x] Investigation of LiveCaptionsOnSmartGlasses pain points
- [x] Research Bun fullstack + Hono integration
- [x] Create implementation plan
- [ ] Phase 1: Core SDK refactor (AppServer, middleware, types)
- [ ] Phase 2: AppServer extends Hono
- [ ] Phase 3: Bun.serve() hybrid integration
- [ ] Phase 4: Package updates
- [ ] Test with LiveCaptionsOnSmartGlasses
