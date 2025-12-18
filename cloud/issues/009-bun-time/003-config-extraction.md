# 003: Config Extraction

Move hardcoded values (CORS origins, timeouts, grace periods) to centralized configuration.

## Problem

Configuration is scattered throughout the codebase as magic numbers and hardcoded values:

### CORS Origins (80+ hardcoded URLs)

```typescript
// packages/cloud/src/index.ts:74-160
cors({
  origin: [
    "*",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    // ... 80 more URLs
    "https://api.mentraglass.cn",
  ],
})
```

### Timeouts and Grace Periods

```typescript
// packages/cloud/src/services/websocket/websocket-glasses.service.ts
const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 1; // 1 minute

// packages/cloud/src/services/session/UserSession.ts
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
private readonly PONG_TIMEOUT_MS = 30000; // 30 seconds

// packages/cloud/src/services/session/AppSession.ts
const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const GRACE_PERIOD_MS = 5000; // 5 seconds
const SUBSCRIPTION_GRACE_MS = 8000; // 8 seconds

// packages/cloud/src/services/session/AppManager.ts
const APP_SESSION_TIMEOUT_MS = 5000; // 5 seconds
```

### Feature Flags

```typescript
// packages/cloud/src/services/websocket/websocket-glasses.service.ts
const GRACE_PERIOD_CLEANUP_ENABLED = true;

// packages/cloud/src/services/session/UserSession.ts
private static readonly PONG_TIMEOUT_ENABLED = true;
export const LOG_PING_PONG = false;
```

## Goal

- All configuration in one place (`packages/cloud/src/config/`)
- Environment variables with sensible defaults
- Type-safe config object
- Easy to change without code modifications
- Feature flags for experimental features

## Proposed Structure

```
packages/cloud/src/config/
├── index.ts          # Main config export
├── cors.ts           # CORS configuration
├── websocket.ts      # WebSocket timeouts
├── session.ts        # Session/app timeouts
└── features.ts       # Feature flags
```

## Implementation

### Main Config (`config/index.ts`)

```typescript
import {corsConfig} from "./cors"
import {websocketConfig} from "./websocket"
import {sessionConfig} from "./session"
import {featureFlags} from "./features"

export interface CloudConfig {
  server: {
    port: number
    nodeEnv: string
  }
  cors: typeof corsConfig
  websocket: typeof websocketConfig
  session: typeof sessionConfig
  features: typeof featureFlags
}

export const config: CloudConfig = {
  server: {
    port: parseInt(process.env.PORT || "80"),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  cors: corsConfig,
  websocket: websocketConfig,
  session: sessionConfig,
  features: featureFlags,
}

export default config
```

### CORS Config (`config/cors.ts`)

```typescript
// Load from environment or use defaults
const envOrigins = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim())

// Default origins for development
const devOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]

// Production origins
const prodOrigins = [
  // Main domains
  "https://mentra.glass",
  "https://api.mentra.glass",
  "https://apps.mentra.glass",
  "https://console.mentra.glass",
  "https://store.mentra.glass",
  "https://account.mentra.glass",
  "https://docs.mentra.glass",

  // Dev subdomains
  "https://dev.api.mentra.glass",
  "https://dev.mentra.glass",

  // Regional APIs
  "https://uscentral.api.mentra.glass",
  "https://france.api.mentra.glass",
  "https://asiaeast.api.mentra.glass",

  // Legacy augmentos domains
  "https://cloud.augmentos.org",
  "https://augmentos.org",
  "https://www.augmentos.org",

  // China
  "https://www.mentraglass.cn",
  "https://api.mentraglass.cn",
]

export const corsConfig = {
  origins: envOrigins || (process.env.NODE_ENV === "production" ? prodOrigins : [...devOrigins, ...prodOrigins]),
  credentials: true,
}
```

### WebSocket Config (`config/websocket.ts`)

```typescript
export const websocketConfig = {
  // Glasses heartbeat
  glassesHeartbeatIntervalMs: parseInt(process.env.GLASSES_HEARTBEAT_MS || "10000"), // 10s

  // Pong timeout (how long to wait for pong before considering connection dead)
  pongTimeoutMs: parseInt(process.env.PONG_TIMEOUT_MS || "30000"), // 30s

  // App WebSocket heartbeat
  appHeartbeatIntervalMs: parseInt(process.env.APP_HEARTBEAT_MS || "10000"), // 10s
}
```

### Session Config (`config/session.ts`)

```typescript
export const sessionConfig = {
  // User session grace period (time to wait for reconnection before cleanup)
  userGracePeriodMs: parseInt(process.env.USER_GRACE_PERIOD_MS || "60000"), // 60s

  // App session grace period
  appGracePeriodMs: parseInt(process.env.APP_GRACE_PERIOD_MS || "5000"), // 5s

  // App connection timeout (time to wait for app to connect after webhook)
  appConnectionTimeoutMs: parseInt(process.env.APP_CONNECTION_TIMEOUT_MS || "5000"), // 5s

  // Subscription grace period (ignore empty subscriptions after reconnect)
  subscriptionGraceMs: parseInt(process.env.SUBSCRIPTION_GRACE_MS || "8000"), // 8s
}
```

### Feature Flags (`config/features.ts`)

```typescript
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === "true" || value === "1"
}

export const featureFlags = {
  // Session cleanup
  gracePeriodCleanupEnabled: parseBool(process.env.GRACE_PERIOD_CLEANUP_ENABLED, true),
  pongTimeoutEnabled: parseBool(process.env.PONG_TIMEOUT_ENABLED, true),

  // Logging
  logPingPong: parseBool(process.env.LOG_PING_PONG, false),
  logDebugMessages: parseBool(process.env.LOG_DEBUG_MESSAGES, false),

  // Bun native WebSocket (for gradual rollout)
  useBunWebSocket: parseBool(process.env.USE_BUN_WEBSOCKET, false),
}
```

## Usage

### Before

```typescript
// Scattered magic numbers
const RECONNECT_GRACE_PERIOD_MS = 1000 * 60 * 1

// In some function
setTimeout(() => cleanup(), RECONNECT_GRACE_PERIOD_MS)
```

### After

```typescript
import {config} from "../config"

// In some function
setTimeout(() => cleanup(), config.session.userGracePeriodMs)
```

### In index.ts

```typescript
import {config} from "./config"

app.use(
  cors({
    credentials: config.cors.credentials,
    origin: config.cors.origins,
  }),
)

// ...

server.listen(config.server.port, () => {
  logger.info(`Server running on port ${config.server.port}`)
})
```

## Environment Variables

| Variable                       | Default         | Description             |
| ------------------------------ | --------------- | ----------------------- |
| `PORT`                         | `80`            | Server port             |
| `NODE_ENV`                     | `development`   | Environment             |
| `CORS_ORIGINS`                 | (built-in list) | Comma-separated origins |
| `GLASSES_HEARTBEAT_MS`         | `10000`         | Glasses ping interval   |
| `PONG_TIMEOUT_MS`              | `30000`         | Pong timeout            |
| `APP_HEARTBEAT_MS`             | `10000`         | App ping interval       |
| `USER_GRACE_PERIOD_MS`         | `60000`         | User reconnect grace    |
| `APP_GRACE_PERIOD_MS`          | `5000`          | App reconnect grace     |
| `APP_CONNECTION_TIMEOUT_MS`    | `5000`          | App connect timeout     |
| `SUBSCRIPTION_GRACE_MS`        | `8000`          | Subscription grace      |
| `GRACE_PERIOD_CLEANUP_ENABLED` | `true`          | Enable cleanup          |
| `PONG_TIMEOUT_ENABLED`         | `true`          | Enable pong timeout     |
| `LOG_PING_PONG`                | `false`         | Log heartbeats          |
| `USE_BUN_WEBSOCKET`            | `false`         | Use Bun native WS       |

## Files Changed

| File                           | Change                            |
| ------------------------------ | --------------------------------- |
| `config/index.ts`              | New - main config                 |
| `config/cors.ts`               | New - CORS config                 |
| `config/websocket.ts`          | New - WebSocket config            |
| `config/session.ts`            | New - Session config              |
| `config/features.ts`           | New - Feature flags               |
| `index.ts`                     | Remove hardcoded CORS, use config |
| `websocket-glasses.service.ts` | Use config for timeouts           |
| `websocket-app.service.ts`     | Use config for timeouts           |
| `UserSession.ts`               | Use config for timeouts           |
| `AppSession.ts`                | Use config for timeouts           |
| `AppManager.ts`                | Use config for timeouts           |

## Migration Steps

1. Create config module with all current values as defaults
2. Update `index.ts` to use `config.cors` (biggest visual change)
3. Update WebSocket services to use config
4. Update session classes to use config
5. Add documentation for environment variables
6. Test with different config values in staging

## Testing

1. Verify default values match current hardcoded values
2. Test environment variable overrides work
3. Test with CORS_ORIGINS set to restrict origins
4. Test feature flag toggling
5. Verify no behavior change with defaults

## Success Criteria

- [ ] All magic numbers moved to config
- [ ] CORS origins configurable via environment
- [ ] All timeouts configurable
- [ ] Feature flags work correctly
- [ ] Documentation for all env vars
- [ ] No behavior change with default values

## Open Questions

1. **Config validation?**
   - Should we validate config on startup?
   - Fail fast on invalid values?
   - **Decision**: Yes, validate and fail fast

2. **Config file format?**
   - Option A: Environment only (current approach)
   - Option B: JSON/YAML config file
   - Option C: Both (env overrides file)
   - **Decision**: Start with env only, add file support if needed

3. **CORS wildcard in production?**
   - Currently includes `"*"` which allows all origins
   - Should we remove this in production?
   - **Decision**: Remove `"*"` from production default list
