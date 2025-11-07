# Webview Refactor Spec

## Overview

Build webview UI for live captions app. Displays real-time transcript history to user in browser with language/display settings control.

## Problem

1. Captions work on glasses (`index.ts`) but user can't see transcript history
2. No web interface to change language settings
3. Transcripts not tracked - lost after displayed on glasses
4. No way to review what was said during conversation

## Goals

### Primary

1. Display transcript history (interim + final) in webview
2. Real-time transcript updates via SSE
3. REST API for settings (language, hints, display config)
4. SettingsManager using SimpleStorage for persistence

### Secondary

- Auto-scroll behavior (disable when user scrolls up)
- Speaker color coding (consistent per session)
- Mobile-first UI matching MentraOS style
- Empty state when no transcripts

### Success Metrics

| Metric                      | Target           |
| --------------------------- | ---------------- |
| Transcript update latency   | <100ms           |
| Settings change apply time  | <200ms           |
| Session transcript capacity | 100+ transcripts |
| Memory per session          | <10MB            |

## Non-Goals

- Transcript persistence across sessions (memory-only)
- Export/download transcripts
- Multi-user collaboration
- Translation features
- Audio playback

## Technical Constraints

- Don't modify `index.ts` (messy but works)
- Use `UserSession` + `TranscriptsManager` for new architecture
- Memory-only transcript storage (session lifetime)
- Auth via existing Express → Bun header forwarding
- Settings persistence via SDK SimpleStorage
- Must work with existing glasses transcription flow

## API Design

### REST Endpoints

**Transcripts:**

```
GET /api/transcripts
Response: {
  transcripts: [
    {
      id: string
      speaker: string
      text: string
      timestamp: string | null
      isFinal: boolean
    }
  ]
}
```

**Settings:**

```
GET /api/settings
Response: {
  language: string              // e.g., "en", "es"
  languageHints: string[]       // e.g., ["fr", "de"]
  displayLines: number          // 2-5
  displayWidth: number          // Narrow/Medium/Wide (maps to pixels)
}

POST /api/settings/language
Body: { language: string }
Response: { success: boolean }

POST /api/settings/language-hints
Body: { hints: string[] }
Response: { success: boolean }

POST /api/settings/display-lines
Body: { lines: number }
Response: { success: boolean }

POST /api/settings/display-width
Body: { width: number }
Response: { success: boolean }
```

### SSE Stream

```
GET /api/transcripts/stream
Content-Type: text/event-stream

Events:
data: {"type":"interim","id":"abc123","speaker":"Speaker 1","text":"hello..."}
data: {"type":"final","id":"abc123","speaker":"Speaker 1","text":"hello world","timestamp":"2:30 PM"}
data: {"type":"speaker_change","speaker":"Speaker 2"}
```

## Data Structures

### Transcript Entry

```typescript
interface TranscriptEntry {
  id: string // Unique ID
  speaker: string // "Speaker 1", "Speaker 2", etc.
  text: string // Transcript text
  timestamp: string | null // "2:30 PM" or null for interim
  isFinal: boolean // true = final, false = interim
  receivedAt: number // Unix timestamp for ordering
}
```

### Settings Schema (SimpleStorage)

```typescript
interface CaptionSettings {
  language: string // Primary language code
  languageHints: string[] // Additional language codes
  displayLines: number // 2-5 lines on glasses
  displayWidth: number // Character width on glasses
}
```

## Architecture

### Data Flow

```
Transcription Event (from MentraOS)
    ↓
index.ts (unchanged - displays on glasses)
    ↓
TranscriptsManager.onTranscription()
    ↓
Store in memory: transcripts[]
    ↓
Push via SSE to connected webviews
    ↓
Browser updates UI
```

### Component Structure

```
src/app/session/
  ├── UserSession.ts          # Existing
  ├── TranscriptsManager.ts   # Stores transcripts, manages SSE
  └── SettingsManager.ts      # NEW: SimpleStorage wrapper

src/api/
  ├── routes.ts               # Existing
  ├── transcripts.ts          # NEW: GET /api/transcripts
  ├── transcripts-stream.ts   # NEW: SSE endpoint
  └── settings.ts             # NEW: Settings CRUD

src/webview/
  ├── App.tsx                 # NEW: Main webview UI
  ├── components/
  │   ├── TranscriptList.tsx  # Scrollable transcript display
  │   ├── TranscriptItem.tsx  # Individual transcript entry
  │   ├── LanguageModal.tsx   # Language picker
  │   └── SettingsModal.tsx   # Display settings
  └── hooks/
      ├── useTranscripts.ts   # SSE connection + state
      └── useSettings.ts      # Settings API calls
```

## Implementation Plan

### Phase 1: Backend Foundation

1. Create `SettingsManager` with SimpleStorage
2. Create `TranscriptsManager` to store transcripts in memory
3. Wire `TranscriptsManager` to listen to transcription events

### Phase 2: REST APIs

1. Build `/api/transcripts` endpoint (returns history)
2. Build `/api/settings/*` endpoints (CRUD)
3. Test with curl/Postman

### Phase 3: SSE Stream

1. Build `/api/transcripts/stream` SSE endpoint
2. Push events when new transcripts arrive
3. Handle client disconnects

### Phase 4: Frontend

1. Build basic webview UI (TranscriptList component)
2. Connect to SSE stream
3. Add language picker modal
4. Add settings modal
5. Implement auto-scroll behavior

### Phase 5: Polish

1. Speaker color coding
2. Empty state
3. Mobile responsiveness
4. Error handling

## Open Questions

1. **Speaker normalization**: Does Soniox give us "Speaker 1" format or do we normalize server-side?
   - Need to check transcription event format

2. **Transcript limits**: Max transcripts in memory? 100? 500?
   - Need to test memory usage

3. **SSE reconnection**: How to handle webview disconnect/reconnect?
   - Send full history on reconnect? Or just new transcripts?

4. **Settings apply timing**: Do settings changes need to affect existing transcripts?
   - Probably not - only affect future transcripts

5. **Multiple webview connections**: Can multiple browsers connect for same user?
   - Probably yes - SSE supports multiple clients

## Security Considerations

- All endpoints require auth (via `x-auth-user-id` header)
- SSE connection authenticated via initial HTTP request
- Settings isolated per user (SimpleStorage handles this)
- No XSS risk (React escapes by default)
- No transcript leakage between users

## Testing Strategy

**Unit tests:**

- `TranscriptsManager`: add/get transcripts
- `SettingsManager`: SimpleStorage CRUD

**Integration tests:**

- REST API endpoints with auth
- SSE stream sends events correctly
- Settings changes persist

**Manual testing:**

- Open webview, see transcripts appear live
- Change language, verify applies
- Scroll up, verify auto-scroll disables
- Close/reopen webview, verify settings persist
