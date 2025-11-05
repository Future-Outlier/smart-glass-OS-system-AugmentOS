# MentraOS CLI Spec

Command-line tool for app developers to manage MentraOS apps and organizations.

## Problem

Developers currently need browser UI for all operations:

- Create/update apps: 3-5 minutes per change
- Copy/paste API keys manually
- No CI/CD support
- App configs not in version control
- Context switching: Terminal → Browser → Editor

**Target:** Same operations in <30 seconds from terminal, CI/CD compatible.

## Goals

### Primary

1. CLI API key authentication (no password prompts)
2. App CRUD + publish, API key regeneration, export/import
3. Organization list/switch (read-only for MVP)
4. Export configs to JSON for git tracking
5. Non-interactive mode for CI/CD

### Non-Goals

- Member management (Phase 2)
- App scaffolding templates (Phase 2)
- Real-time log streaming (Phase 2)
- Replace developer console web UI

## Authentication: CLI API Keys

### Why Not Email/Password Login?

- No password storage risk
- No session expiration
- Granular revocation
- Matches industry patterns (npm, GitHub PATs)

### Token Structure (JWT)

```json
{
  "email": "dev@example.com",
  "type": "cli",
  "keyId": "uuid-v4",
  "name": "My Laptop",
  "iat": 1705320000,
  "exp": 1736856000
}
```

### Database Model: `CLIKey`

```typescript
{
  keyId: string;              // UUID v4, unique
  userId: ObjectId;           // User reference
  email: string;              // Denormalized (future: phone auth)
  name: string;               // User-friendly ("My Laptop")
  hashedToken: string;        // SHA-256(JWT)
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;          // Soft delete
  metadata?: {
    createdFrom?: string;     // IP
    userAgent?: string;
  }
}
```

**Indexes:**

- `keyId` (unique)
- `hashedToken` (unique)
- `userId + isActive`
- `email + isActive`
- `expiresAt + isActive`

### Flow

**Generation (Console UI):**

```
Settings → CLI Keys → Generate
  → Enter name ("My Laptop")
  → Optional expiration
  → Backend: Generate JWT + store SHA-256 hash
  → Show token ONCE
```

**CLI Authentication:**

```bash
$ mentra auth eyJhbGci...
✓ Authenticated as dev@example.com
✓ Credentials saved to ~/.mentraos/credentials.json
```

**Security:**

- Token shown once, never retrievable
- Middleware checks `isActive` on every request
- `lastUsedAt` updated async
- Instant revocation via console UI

## Commands

### Authentication

```bash
mentra auth <token>              # Authenticate, store in ~/.mentraos/credentials.json
mentra logout                    # Clear credentials
mentra whoami                    # Show user, org, key info
```

### Apps

```bash
mentra app list [--org <id>]     # List apps
mentra app create                # Interactive or --flags
mentra app get <pkg>             # JSON output
mentra app update <pkg>          # Interactive or --flags
mentra app delete <pkg>          # Requires confirmation
mentra app publish <pkg>         # Submit to store
mentra app api-key <pkg>         # Regenerate (show once)
mentra app export <pkg> [-o file] # JSON export
mentra app import <file>         # JSON import
```

### Organizations (Read-Only MVP)

```bash
mentra org list                  # List user's orgs
mentra org get [org-id]          # Details (default org if no ID)
mentra org switch <org-id>       # Set default org
```

### Config

```bash
mentra config set <key> <value>
mentra config get <key>
mentra config list
```

### Global Flags

```bash
--json        # JSON output for scripting
--quiet       # Suppress non-essential output
--verbose     # Debug info
--org <id>    # Override default org
--no-color    # Disable colors
```

## Command Examples

### `mentra app create` (Interactive)

```bash
$ mentra app create
? Package name: org.example.myapp
? App name: My App
? Description: ...
? App type: background / standard
? Public URL: https://...

✓ App created: org.example.myapp
🔑 API Key: aos_abc123... (SAVE THIS)
```

### `mentra app create` (Flags)

```bash
$ mentra app create \
  --package-name org.example.myapp \
  --name "My App" \
  --app-type background \
  --public-url https://...
```

### `mentra app export`

```bash
$ mentra app export org.example.myapp
Exported to org.example.myapp.json

# Custom output
$ mentra app export org.example.myapp -o config.json

# Stdout
$ mentra app export org.example.myapp -o -
```

**Export Format:**

```json
{
  "packageName": "org.example.myapp",
  "name": "My App",
  "description": "...",
  "appType": "background",
  "publicUrl": "https://...",
  "logoURL": "https://...",
  "permissions": [
    {"type": "MICROPHONE", "description": "..."}
  ],
  "settings": [...],
  "tools": [],
  "hardwareRequirements": [],
  "version": "1.0.0"
}
```

### `mentra app import`

```bash
$ mentra app import config.json

Changes detected:
  ~ description: "old" → "new"
  + permission: LOCATION

? Apply changes? (Y/n) y
✓ App updated

# Force (CI/CD)
$ mentra app import config.json --force
```

## Configuration Files

### `~/.mentraos/credentials.json` (chmod 600)

```json
{
  "token": "eyJhbGci...",
  "email": "dev@example.com",
  "keyName": "My Laptop",
  "keyId": "uuid",
  "storedAt": "2024-01-15T...",
  "expiresAt": "2025-01-15T..."
}
```

### `~/.mentraos/config.json` (chmod 600)

```json
{
  "api": {
    "url": "https://api.mentra.glass",
    "timeout": 30000
  },
  "output": {
    "format": "table",
    "colors": true
  },
  "default": {
    "org": "org_abc123"
  }
}
```

### `.mentraosrc` (Optional, per-project)

```json
{
  "packageName": "org.example.myapp",
  "org": "org_abc123"
}
```

## API Endpoints

### New: CLI Key Management (Console Auth)

```
POST   /api/console/cli-keys              # Generate key
GET    /api/console/cli-keys              # List keys
GET    /api/console/cli-keys/:keyId       # Get key
PATCH  /api/console/cli-keys/:keyId       # Rename
DELETE /api/console/cli-keys/:keyId       # Revoke
```

### Existing: Reuse Console Routes (CLI Auth)

```
GET    /api/cli/apps                      # → /api/console/apps
POST   /api/cli/apps                      # → /api/console/apps
GET    /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
PUT    /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
DELETE /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
POST   /api/cli/apps/:pkg/publish         # → /api/console/apps/:pkg/publish
POST   /api/cli/apps/:pkg/api-key         # → /api/console/apps/:pkg/api-key

GET    /api/cli/orgs                      # → /api/console/orgs
GET    /api/cli/orgs/:id                  # → /api/console/orgs/:id
```

**Implementation:** Transform `req.cli` → `req.console` to reuse handlers.

## Error Handling

### Exit Codes

```
0   Success
1   General error
2   Invalid arguments
3   Authentication error
4   Permission error
5   Resource not found
6   Network error
7   Validation error
```

### Error Messages

```bash
# Auth error
✗ Unauthorized: CLI API key invalid or revoked
  Generate new key: https://console.mentra.glass/settings/cli-keys

# Permission error
✗ Forbidden: Only admins can delete apps

# Validation error
✗ Invalid package name: must use reverse domain notation
  Example: org.example.myapp

# Network error
✗ Failed to connect to API
  Current: https://api.mentra.glass
```

## Use Cases

### 1. Developer Setup

```bash
npm install -g @mentra/cli
mentra auth <token-from-console>
mentra app create
mentra app export org.example.myapp
git add org.example.myapp.json
```

### 2. Terminal Workflow

```bash
mentra app update org.example.myapp --add-permission LOCATION
mentra app export org.example.myapp
git commit -am "Add location permission"
```

### 3. CI/CD

```yaml
- run: mentra auth ${{ secrets.MENTRA_CLI_TOKEN }}
- run: mentra app import config.json --force
- run: mentra app publish org.example.myapp
```

### 4. Lost Laptop

```
Console → CLI Keys → Revoke "My Laptop"
  → Lost laptop immediately loses access
  → Other keys (desktop, CI) still work
```

### 5. Team Collaboration

```bash
# Lead creates app + exports config
mentra app create
mentra app export org.acme.team -o config.json
git add config.json && git push

# Team member updates via CLI
mentra auth <their-token>
vim config.json  # Edit
mentra app import config.json
git commit -am "Update permissions"
```

## Open Questions

1. **Member management in CLI?** → Phase 2 (low priority, console works)
2. **App scaffolding (`mentra init`)?** → Phase 2 (needs SDK templates)
3. **Exported configs include orgId?** → Yes (optional field, ignored on import)
4. **Update checks?** → Once per day, show notice
5. **Bulk operations?** → Phase 2 (wait for usage data)
6. **Scoped API keys?** → Phase 2 (full access for MVP)

## Phase 1 Scope

**In:**

- CLI tool (`@mentra/cli` package, Bun runtime)
- CLI key system (backend model + console UI + middleware)
- Commands: `auth`, `whoami`, `logout`, `app list/create/get/update/delete/publish/api-key/export/import`, `org list/get/switch`, `config`
- Interactive + non-interactive modes
- JSON export/import
- Error handling

**Out (Phase 2):**

- Member management
- App scaffolding
- Real-time logs
- Scoped keys
- Bulk operations
- Shell completion

## Distribution

**NPM:**

```bash
npm install -g @mentra/cli
# or
bun install -g @mentra/cli
```

**Package:** `@mentra/cli`  
**Binary:** `mentra`  
**Entry:** `packages/cli/src/index.ts`

**Future:** Homebrew, direct download scripts
