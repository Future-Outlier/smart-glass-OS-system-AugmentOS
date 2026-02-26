# SDK Audio Output Streaming

Enable SDK apps to stream real-time audio back to the mobile client/glasses for playback — unlocking conversational AI (Gemini Live, OpenAI Realtime), streaming TTS, and live audio processing.

## Documents

- **audio-streaming-spec.md** - Problem, goals, constraints, use cases
- **audio-streaming-architecture.md** - Implementation options, tradeoffs, recommended approach

## Quick Context

**Current**: SDK apps can only play audio via `playAudio(url)` (complete file URL) or `speak(text)` (server-side TTS). No way to stream real-time audio chunks back to the user.

**Proposed**: New SDK API to push audio chunks (MP3 frames) that play on the mobile client/glasses in real-time via an HTTP streaming relay on the cloud.

## Key Decisions

- **Option A selected**: HTTP streaming relay on cloud. Phone plays a chunked HTTP MP3 stream URL via the existing `playAudio()` path. No new native modules needed on mobile.
- **No WebSocket for audio output**: WS audio had too many issues historically — banned for this direction. Audio goes SDK → cloud relay (HTTP/WS push) → phone (HTTP GET stream).
- **SDK-side encoding**: Cloud does zero transcoding (just `pipe()` bytes). If the developer has raw PCM (e.g., Gemini Live), the SDK encodes to MP3 on the developer's server. Most providers (ElevenLabs, OpenAI, Cartesia, Azure) output MP3 natively — no encoding needed.
- **MP3 wire format**: Universal cross-platform support (ExoPlayer + AVPlayer), self-framing (no container needed), streaming-native. Opus ruled out due to iOS container incompatibility.
- **Future transcoding µservice**: If cloud-side encoding is needed later, it runs as a separate container that scales independently and can't affect the main cloud.

## Architecture

```
Current TTS (round-trip):
  SDK --playAudio(ttsUrl)--> Cloud --audio_play_request--> Phone --HTTP GET--> Cloud /api/tts --> ElevenLabs
                                                           Phone <-- MP3 stream <-- Cloud <-- ElevenLabs

Proposed streaming:
  SDK (gets MP3 from ElevenLabs/OpenAI directly, or encodes PCM → MP3 locally)
    |
    └── pushes MP3 frames ──> Cloud relay (dumb pipe, zero CPU) ──> Phone (ExoPlayer plays stream URL)
```

## Status

- [x] Spec written
- [x] Architecture options documented
- [x] Option A selected (HTTP streaming relay, SDK-side encoding)
- [x] Test app created (`cloud/packages/apps/sdk-test`)
- [ ] Phase 1: POC — cloud relay endpoint + SDK createOutputStream + test with ExoPlayer
- [ ] Phase 1: Benchmark ExoPlayer/AVPlayer first-byte latency with chunked MP3
- [ ] Phase 2: Production implementation
- [ ] Phase 3: Polish (backpressure, interruption, metrics)