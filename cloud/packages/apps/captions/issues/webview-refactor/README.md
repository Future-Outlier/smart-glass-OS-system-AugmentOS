# Webview Refactor

Build web interface for live captions with transcript history and settings control.

## Documents

- **webview-refactor-spec.md** - Problem, goals, API design
- **webview-refactor-architecture.md** - Implementation details (TODO)

## Quick Context

**Current**: Captions work on glasses (`index.ts`) but no transcript history or web UI
**Proposed**: Webview shows live transcripts + REST API for settings + SSE for real-time updates

## Key Constraint

Don't touch `index.ts` - it's messy but works. Build new system alongside using `UserSession` + `TranscriptsManager`.

## Status

- [ ] SettingsManager with SimpleStorage
- [ ] TranscriptsManager stores transcripts in memory
- [ ] REST API: GET /api/transcripts
- [ ] REST API: GET/POST /api/settings/\*
- [ ] SSE: GET /api/transcripts/stream
- [ ] React webview UI
- [ ] Language picker modal
- [ ] Settings modal
- [ ] Auto-scroll behavior
- [ ] Speaker color coding

## Architecture Overview

```
Browser Webview
    ↓ SSE
/api/transcripts/stream (Bun)
    ↓ x-auth-user-id header
TranscriptsManager (stores transcripts[])
    ↓ listens to events
AppSession.onTranscription()
    ↓
index.ts (unchanged, displays on glasses)
```

Settings via REST → SettingsManager → SimpleStorage (persists)

## Key APIs

```
GET  /api/transcripts              # Load history
GET  /api/transcripts/stream       # SSE for live updates
GET  /api/settings                 # Get all settings
POST /api/settings/language        # Set primary language
POST /api/settings/language-hints  # Set language hints
POST /api/settings/display-lines   # Set glasses display lines
POST /api/settings/display-width   # Set glasses display width
```

## Memory Target

<10MB per session, 100+ transcripts in memory
