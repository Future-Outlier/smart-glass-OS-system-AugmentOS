# 006: Hono Migration

Replace Express with Hono for native Bun HTTP handling.

## Status: 🔄 PLANNED

## Problem

The current Express-to-Bun bridge is causing issues:

- `TypeError: Cannot access property of undefined or null` in body-parser with Bun streams
- Multiple `@types/express-serve-static-core` version conflicts (4.19.6 vs 4.19.7)
- `pino-http` logger type mismatch with Pino multistream
- Fragile compatibility layer between Bun's `fetch` API and Express's Node.js streams

This is tech debt that will continue to cause problems.

## Why Hono?

| Feature        | Express            | Hono          |
| -------------- | ------------------ | ------------- |
| Bundle size    | ~200kb             | ~14kb         |
| Bun native     | ❌ Needs bridge    | ✅ Native     |
| TypeScript     | Bolted on          | First-class   |
| Type safety    | Version conflicts  | Built-in      |
| WebSocket      | Via ws package     | Via Bun.serve |
| Middleware API | `(req, res, next)` | `(c, next)`   |
| Performance    | Good               | Excellent     |

Hono is designed for Bun, Cloudflare Workers, and Deno. No bridge needed.

## Migration Scope

**Files to migrate: 52** (all files importing from 'express')

### Categories

1. **Entry point** (1 file)
   - `src/index.ts` - Main server setup

2. **Route files** (15 files)
   - `src/routes/*.routes.ts`

3. **API handlers** (20 files)
   - `src/api/client/*.api.ts`
   - `src/api/console/*.api.ts`
   - `src/api/sdk/*.api.ts`
   - `src/api/public/*.ts`

4. **Middleware** (12 files)
   - `src/middleware/*.ts`
   - `src/api/middleware/*.ts`

5. **API registration** (1 file)
   - `src/api/index.ts`

6. **Tests** (3 files)
   - `src/api/middleware/__tests__/*.ts`

## API Translation Guide

### Router Creation

```typescript
// Express
import { Router } from "express";
const router = Router();

// Hono
import { Hono } from "hono";
const router = new Hono();
```

### Route Handlers

```typescript
// Express
router.get("/users/:id", (req, res) => {
  const id = req.params.id;
  const query = req.query.filter;
  res.json({ id, query });
});

// Hono
router.get("/users/:id", (c) => {
  const id = c.req.param("id");
  const query = c.req.query("filter");
  return c.json({ id, query });
});
```

### Request Body

```typescript
// Express
router.post("/users", (req, res) => {
  const body = req.body;
  res.json(body);
});

// Hono
router.post("/users", async (c) => {
  const body = await c.req.json();
  return c.json(body);
});
```

### Middleware

```typescript
// Express
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = decodeToken(token);
  next();
};

// Hono
const authMiddleware = async (c, next) => {
  const token = c.req.header("authorization");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", decodeToken(token));
  await next();
};
```

### Accessing Middleware Data

```typescript
// Express
app.get("/profile", authMiddleware, (req, res) => {
  res.json(req.user);
});

// Hono
app.get("/profile", authMiddleware, (c) => {
  return c.json(c.get("user"));
});
```

### Error Handling

```typescript
// Express
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

// Hono
import { HTTPException } from "hono/http-exception";

app.onError((err, c) => {
  console.error(err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: "Internal error" }, 500);
});
```

### File Uploads (Multer → Hono)

```typescript
// Express + Multer
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  res.json({ filename: file.originalname });
});

// Hono (native multipart)
router.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"] as File;
  return c.json({ filename: file.name });
});
```

### Static Files

```typescript
// Express
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Hono
import { serveStatic } from "hono/bun";

app.use("/*", serveStatic({ root: "./public" }));
app.use("/uploads/*", serveStatic({ root: "./uploads" }));
```

### CORS

```typescript
// Express
import cors from "cors";
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));

// Hono
import { cors } from "hono/cors";
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
```

### Helmet (Security Headers)

```typescript
// Express
import helmet from "helmet";
app.use(helmet());

// Hono
import { secureHeaders } from "hono/secure-headers";
app.use(secureHeaders());
```

### Cookie Parser

```typescript
// Express
import cookieParser from "cookie-parser";
app.use(cookieParser());
// Access: req.cookies.token

// Hono
import { getCookie, setCookie } from "hono/cookie";
// Access: getCookie(c, "token")
```

## Migration Strategy

### Phase 1: Setup (Day 1)

- [ ] Add Hono dependency: `bun add hono`
- [ ] Create `src/hono-app.ts` alongside existing Express app
- [ ] Create type definitions for context variables (user, email, etc.)
- [ ] Set up CORS, security headers, cookie handling

### Phase 2: Migrate Middleware (Day 2)

- [ ] `src/api/middleware/client.middleware.ts`
- [ ] `src/api/middleware/console.middleware.ts`
- [ ] `src/api/middleware/sdk.middleware.ts`
- [ ] `src/api/middleware/cli.middleware.ts`
- [ ] `src/middleware/admin-auth.middleware.ts`
- [ ] `src/middleware/supabaseMiddleware.ts`
- [ ] `src/middleware/validateApiKey.ts`
- [ ] `src/middleware/glasses-auth.middleware.ts`

### Phase 3: Migrate API Routes (Days 3-4)

- [ ] `src/api/client/*.api.ts` (11 files)
- [ ] `src/api/console/*.api.ts` (4 files)
- [ ] `src/api/sdk/*.api.ts` (2 files)
- [ ] `src/api/public/*.ts` (1 file)

### Phase 4: Migrate Legacy Routes (Days 5-6)

- [ ] `src/routes/account.routes.ts`
- [ ] `src/routes/admin.routes.ts`
- [ ] `src/routes/apps.routes.ts`
- [ ] `src/routes/developer.routes.ts`
- [ ] `src/routes/photos.routes.ts`
- [ ] Other route files

### Phase 5: Entry Point & Cleanup (Day 7)

- [ ] Update `src/index.ts` to use Hono
- [ ] Remove Express-to-Bun bridge code
- [ ] Update `src/api/index.ts` route registration
- [ ] Remove Express, helmet, cors, cookie-parser dependencies
- [ ] Update tests

## New Entry Point Structure

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger as pinoLogger } from "./services/logging/pino-logger";
import { CORS_ORIGINS } from "./config/cors";
import { registerRoutes } from "./api";
import { handleUpgrade, websocketHandlers } from "./services/websocket/bun-websocket";

const app = new Hono();

// Middleware
app.use(secureHeaders());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));

// Request logging
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  pinoLogger.info({ method: c.req.method, path: c.req.path, status: c.res.status, duration });
});

// Register all routes
registerRoutes(app);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Start server with WebSocket support
const server = Bun.serve({
  port: process.env.PORT || 80,
  fetch: app.fetch,
  websocket: websocketHandlers,
});

export default server;
```

## Type Definitions

```typescript
// src/types/hono.ts
import type { Context } from "hono";

// Variables available in context after middleware
export interface AppVariables {
  // Client auth
  email?: string;
  user?: User;
  userSession?: UserSession;

  // Console auth
  console?: { email: string };

  // SDK auth
  sdk?: { packageName: string; apiKey: string };

  // CLI auth
  cli?: { id: string; email: string; orgId: string };
}

export type AppContext = Context<{ Variables: AppVariables }>;
```

## Dependencies to Remove

After migration:

- `express`
- `@types/express`
- `@types/express-serve-static-core`
- `helmet`
- `@types/helmet`
- `cors`
- `@types/cors`
- `cookie-parser`
- `@types/cookie-parser`
- `multer`
- `@types/multer`
- `pino-http` (replace with custom middleware)

## Dependencies to Add

- `hono`

## Risks & Mitigations

### Risk: Large migration surface

**Mitigation**: Can run Express and Hono in parallel during migration. Mount Express at a path prefix temporarily.

### Risk: Multer replacement for complex uploads

**Mitigation**: Hono's native `parseBody()` handles multipart. For complex cases, can use `@hono/multipart-parser`.

### Risk: Breaking existing clients

**Mitigation**: API signatures don't change - only internal implementation. Run comprehensive API tests.

### Risk: pino-http replacement

**Mitigation**: Simple custom middleware is actually cleaner than pino-http config.

## Success Criteria

- [ ] All API endpoints work identically
- [ ] No Express-related type errors
- [ ] No bridge code in index.ts
- [ ] Build passes cleanly
- [ ] Reduced dependency count
- [ ] Improved startup time

## References

- [Hono Documentation](https://hono.dev/)
- [Hono + Bun Guide](https://hono.dev/getting-started/bun)
- [Hono Middleware](https://hono.dev/middleware/builtin/cors)
- [Express to Hono Migration](https://hono.dev/guides/migration)
