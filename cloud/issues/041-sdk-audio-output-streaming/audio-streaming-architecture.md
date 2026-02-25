# Audio Output Streaming — Architecture

## Current System

Audio output from SDK apps follows a one-shot URL-based pattern:

```
SDK App → (WS) → Cloud → (WS) → Phone → (HTTP) → CDN/Origin → Phone → (BLE) → Glasses
```

1. SDK calls `session.audio.playAudio({audioUrl: "https://example.com/audio.mp3"})`
2. Cloud relays `audio_play_request` message to phone via WebSocket (JSON, ~200 bytes)
3. Phone's `AudioPlaybackService` calls `player.replace({uri: audioUrl})` via expo-audio
4. ExoPlayer (Android) / AVPlayer (iOS) fetches the URL, decodes, and plays
5. Audio is routed to glasses speaker via BLE

Key code:
- `packages/sdk/src/app/session/modules/audio.ts` → `playAudio()` sends `AUDIO_PLAY_REQUEST`
- `packages/cloud/src/services/session/handlers/app-message-handler.ts` → `handleAudioPlayRequest()` relays to phone
- `mobile/src/services/AudioPlaybackService.ts` → `play()` → `player.replace({uri})` (L109)
- `mobile/src/services/SocketComms.ts` → `handle_audio_play_request()` bridges WS message to AudioPlaybackService

### What works well

- Simple. Developer provides a URL, everything else is handled.
- ExoPlayer/AVPlayer are battle-tested audio players with buffering, codec support, error recovery.
- The response/callback path (`AUDIO_PLAY_RESPONSE`) already reports success/error/duration back to the SDK app.

### What doesn't work

- No streaming. Must have a complete, downloadable file at a URL before playback starts.
- For conversational AI, the AI generates audio in 20-100ms chunks. Can't wait for the full response.
- `speak(text)` hits a TTS endpoint that generates the whole file server-side before returning the URL.

## Implementation Options

Three fundamentally different approaches. Each has sub-variants.

---

### Option A: HTTP Streaming Relay (cloud-hosted)

Cloud hosts a relay endpoint. SDK pushes audio chunks in, phone pulls a streaming HTTP response out. From the phone's perspective, it's just playing a URL — but the URL is a chunked HTTP response that streams in real-time.

```
SDK App --POST chunks--> Cloud relay --chunked HTTP GET--> Phone (ExoPlayer/AVPlayer)
                         /audio-relay/{streamId}
```

#### How it works

1. SDK calls `session.audio.createOutputStream({sampleRate: 24000})`
2. SDK sends `AUDIO_STREAM_START` message to cloud via WebSocket
3. Cloud creates a relay endpoint: `https://api.mentra.glass/audio-relay/{streamId}`
4. Cloud sends `audio_play_request` to phone with that URL (existing mechanism)
5. Phone's ExoPlayer/AVPlayer opens the URL — cloud holds the response open
6. SDK pushes PCM chunks to cloud (via WS binary frames or HTTP POST)
7. Cloud transcodes PCM → streamable format (MP3 frames or Opus) and writes to the HTTP response
8. Phone plays audio as it arrives (progressive download / streaming)
9. SDK calls `stream.end()` → cloud closes the HTTP response → playback finishes naturally

#### Sub-variant A1: Cloud transcodes PCM → MP3

SDK sends raw PCM. Cloud transcodes to MP3 frames on the fly and serves `Content-Type: audio/mpeg` HTTP stream.

- **Pros**: Simplest SDK API (just push PCM bytes). MP3 streaming is the most battle-tested format for progressive HTTP playback (internet radio). ExoPlayer and AVPlayer both handle it natively with no config.
- **Cons**: Cloud needs an MP3 encoder (lame/libmp3lame). Adds ~26ms latency per MP3 frame (1152 samples / 44100Hz, or smaller at lower sample rates). Cloud CPU cost for transcoding.
- **MP3 frame math**: At 24kHz input, one MP3 frame = 1152 samples = 48ms. At 16kHz = 72ms per frame. This is the minimum granularity — audio can't start playing until at least one complete frame arrives.

#### Sub-variant A2: Cloud transcodes PCM → OGG/Opus

SDK sends raw PCM. Cloud transcodes to Opus in OGG container. Serves `Content-Type: audio/ogg; codecs=opus`.

- **Pros**: Lower latency per frame (Opus supports 2.5ms–60ms frames). Better audio quality at low bitrates. Lower bandwidth.
- **Cons**: ExoPlayer supports OGG/Opus natively. AVPlayer (iOS) has limited OGG support — may need to use `audio/opus` with a raw Opus stream instead. Less battle-tested for HTTP progressive streaming compared to MP3.

#### Sub-variant A3: SDK transcodes, cloud passes through

SDK transcodes PCM → MP3 frames (or Opus) locally before sending. Cloud just pipes bytes to the HTTP response without touching them.

- **Pros**: Zero CPU on cloud for transcoding. Cloud relay is trivial (just a buffer + pipe). SDK developer could even choose their own codec.
- **Cons**: SDK needs an encoder dependency. More complex SDK implementation. Format mismatch risk (SDK sends format that phone can't play).

#### Sub-variant A4: Cloud serves raw PCM as WAV

SDK sends raw PCM. Cloud wraps in a WAV header (44 bytes) with unknown length, then streams PCM data.

- **Pros**: No transcoding at all. WAV is trivially simple.
- **Cons**: ExoPlayer can play WAV but may buffer more aggressively before starting playback (it often waits for Content-Length or a significant buffer). AVPlayer similar. WAV has no framing — player can't seek or recover from dropped bytes. Bandwidth is 5-10x higher than compressed formats. **Likely won't work well for low-latency streaming.**

#### Cloud relay implementation

The relay is essentially a per-stream FIFO buffer with an HTTP reader and writer:

```
Cloud relay internals:

  Map<streamId, {
    buffer: Ring buffer or async queue of encoded audio chunks
    httpResponse: HTTP Response object (held open, chunked transfer encoding)
    metadata: {sampleRate, encoding, createdAt, sessionId}
  }>

  POST /audio-relay/{streamId}/push  ← SDK sends chunks here
    → append to buffer
    → if httpResponse is connected, flush buffer to response

  GET /audio-relay/{streamId}        ← Phone connects here
    → set Content-Type: audio/mpeg
    → set Transfer-Encoding: chunked
    → pipe buffer to response as data arrives
    → close response when stream ends
```

Memory budget: At 128kbps MP3, one minute of buffered audio = ~960KB. A 5-second jitter buffer = ~80KB. Manageable.

#### Latency breakdown (A1: PCM → MP3)

| Hop | Latency |
|---|---|
| SDK → Cloud (WS binary frame) | ~5-50ms (depends on SDK server location) |
| Cloud MP3 encode (one frame) | ~1ms compute + 48ms frame duration (at 24kHz) |
| Cloud → Phone (HTTP chunk) | ~5-50ms |
| ExoPlayer buffer before play | ~100-500ms (configurable, default can be high) |
| Phone → Glasses (BLE) | ~20-50ms |
| **Total first-byte** | **~180-700ms** |

The ExoPlayer buffer is the wildcard. Default `DefaultLoadControl` buffers 2.5s before starting. This can be tuned down to ~100ms with custom `LoadControl` — but requires a mobile code change.

---

### Option B: Chunked Playback (segmented files)

Instead of a continuous stream, break the audio into small segments (200-500ms each) and play them back-to-back using the existing `playAudio(url)` system. Each segment is a complete, downloadable file.

```
SDK App --chunk 1--> Cloud --save as file--> CDN/memory
        --chunk 2-->                     --> CDN/memory
        --chunk 3-->                     --> CDN/memory

Phone: playAudio(chunk1.mp3) → playAudio(chunk2.mp3) → playAudio(chunk3.mp3)
```

#### How it works

1. SDK accumulates PCM data until it has enough for one segment (200-500ms)
2. SDK (or cloud) encodes the segment to a complete MP3 file
3. Cloud stores it at a URL (in-memory, S3, or local file)
4. Cloud sends `audio_play_request` to phone with the segment URL
5. Phone plays segment. When done (`AUDIO_PLAY_RESPONSE`), next segment starts.
6. Repeat until stream ends.

#### Gapless playback sub-variant

Instead of waiting for each segment to finish, queue them:
- Phone receives segment URLs in advance and queues them
- ExoPlayer has playlist/queue support via `ConcatenatingMediaSource`
- Would need a new message type: `AUDIO_QUEUE_REQUEST` (add to playlist) vs `AUDIO_PLAY_REQUEST` (play immediately)

#### Latency analysis

| Parameter | Value |
|---|---|
| Segment duration | 200ms (minimum useful), 500ms (comfortable) |
| Encode time | ~5ms per segment |
| Upload/store time | ~10-50ms |
| Phone download time | ~10-50ms |
| **First-byte latency** | **~230-600ms** (for 200ms segments) |
| **Gap between segments** | **~20-80ms** (download + decode next segment) |

Gaps between segments are the main problem. Even with gapless playback via ExoPlayer playlists, there's usually a small gap at segment boundaries. For music or TTS this might be acceptable. For real-time conversation it's noticeable.

- **Pros**: Zero mobile changes — uses existing `playAudio(url)` exactly as-is. No new endpoints, no streaming HTTP, no custom players. Simple to implement and debug.
- **Cons**: Gaps between segments. Higher first-byte latency (must accumulate a full segment before first playback). More HTTP requests (one per segment). Storage/cleanup of segment files. Not truly real-time — it's "near real-time" with 200-500ms granularity.

---

### Option C: WebSocket Binary Frames to Phone

Add a new binary audio output path on the phone ↔ cloud WebSocket. The phone receives raw PCM frames and plays them using a custom native audio module (bypassing expo-audio).

```
SDK App --WS binary--> Cloud --WS binary--> Phone (custom native AudioTrack/AVAudioEngine)
```

#### How it works

1. SDK calls `session.audio.createOutputStream({sampleRate: 24000})`
2. SDK sends PCM chunks as WS binary frames to cloud
3. Cloud relays binary frames to phone's WebSocket (new message type / binary channel)
4. Phone native module receives PCM bytes, writes to AudioTrack (Android) / AVAudioEngine (iOS)
5. AudioTrack/AVAudioEngine plays immediately with minimal buffering

#### Latency analysis

| Hop | Latency |
|---|---|
| SDK → Cloud (WS binary) | ~5-50ms |
| Cloud → Phone (WS binary) | ~5-50ms |
| AudioTrack/AVAudioEngine buffer | ~20-60ms (configurable) |
| Phone → Glasses (BLE) | ~20-50ms |
| **Total first-byte** | **~50-210ms** |

This is the lowest possible latency. No transcoding, no HTTP buffering, no file downloads.

- **Pros**: Lowest latency. Simplest data path (just relay binary frames). No transcoding needed. No HTTP endpoints to manage. Full control over playback buffer size.
- **Cons**: **Requires a new React Native native module** for streaming PCM playback on both iOS and Android. expo-audio can't do this. The phone ↔ cloud WebSocket currently only carries JSON — need to add binary frame handling (or a parallel connection). Need to handle jitter, out-of-order packets (TCP so ordering is guaranteed, but timing isn't). No built-in codec — raw PCM is ~384kbps at 24kHz/16-bit/mono, which is fine over WiFi but notable over cellular. WebSocket over TCP means head-of-line blocking on packet loss.

---

## Comparison Matrix

| | Option A: HTTP Relay | Option B: Chunked Files | Option C: WS Binary |
|---|---|---|---|
| **First-byte latency** | 180-700ms | 230-600ms | 50-210ms |
| **Gaps/stuttering** | Smooth (continuous stream) | Gaps at segment boundaries | Smooth (continuous) |
| **Mobile changes** | Maybe tune ExoPlayer buffer | None | New native module (both platforms) |
| **Cloud changes** | New relay endpoint + transcoder | Segment storage endpoint | Binary frame relay |
| **SDK changes** | New output stream API | New segment accumulator | New output stream API |
| **Bandwidth** | Low (MP3/Opus compressed) | Low (MP3 compressed) | High (raw PCM, ~384kbps) |
| **Complexity** | Medium | Low | High |
| **Interruption** | Close HTTP response | Stop playing, discard queue | Stop writing to AudioTrack |
| **Works offline/P2P** | No (needs cloud relay) | No (needs cloud) | No (needs cloud) |
| **Concurrent with playAudio()** | Yes (different URL) | Yes (same system) | Needs track management |

## Recommendation

**Start with Option A1 (HTTP streaming relay, cloud transcodes PCM → MP3).**

Rationale:

1. **Minimal mobile changes.** ExoPlayer and AVPlayer already support MP3 streaming over HTTP. The only mobile change is likely tuning the buffer config to reduce initial buffering latency from ~2.5s default down to ~200ms. That's a one-line config change, not a new native module.

2. **Uses existing playback path.** From the phone's perspective, `playAudio(streamUrl)` looks identical to `playAudio(fileUrl)`. The `AudioPlaybackService` doesn't need to know or care that the URL is a stream.

3. **Clean SDK API.** Developer pushes PCM chunks. Cloud handles the encoding complexity. This matches how audio input works (cloud handles decoding/routing).

4. **Upgrade path to C.** If latency testing shows that HTTP buffering is too much for conversational AI, we can add Option C later as a "low-latency mode" behind a flag. The SDK API (`createOutputStream` / `write` / `end` / `flush`) stays the same — only the transport changes.

5. **Option B is a fallback** if A turns out to be harder than expected. Chunked playback is dead simple but the gaps may be unacceptable for voice. Worth prototyping as a quick POC.

### Phased approach

**Phase 1: Prove it works (1-2 days)**
- Cloud: bare-minimum relay endpoint that accepts PCM chunks and serves MP3 stream
- SDK: `createOutputStream()` → `write()` → `end()` with hardcoded cloud relay
- Mobile: test that `playAudio(streamUrl)` works with a chunked HTTP MP3 response
- Benchmark first-byte latency and find ExoPlayer's minimum viable buffer config

**Phase 2: Production implementation (3-5 days)**
- Cloud: proper relay with per-session stream management, cleanup, backpressure
- SDK: full `AudioOutputStream` class with error handling, flush/interrupt, events
- Mobile: ExoPlayer buffer tuning, handle stream interruption gracefully
- Message types: `AUDIO_STREAM_START`, `AUDIO_STREAM_STOP`, or reuse existing `AUDIO_PLAY_REQUEST` with stream URL

**Phase 3: Polish (2-3 days)**
- Backpressure (what happens when SDK pushes faster than phone plays)
- Concurrent streams (track IDs)
- Interruption (user starts talking → flush → silence immediately)
- Metrics (latency, buffer underruns, stream duration)

**If Phase 1 shows >700ms first-byte latency that can't be tuned down:**
- Fall back to Option B for a quick win
- Build Option C for production-quality low-latency streaming

## Open Questions

1. **ExoPlayer minimum buffer config?**
   - Default `DefaultLoadControl`: minBufferMs=2500. Can we set it to 100ms for streaming sources without breaking file playback?
   - Need to test: does ExoPlayer start playback after receiving the first complete MP3 frame (~48ms of audio), or does it wait for a minimum buffer regardless?
   - **Need to benchmark on a real device.**

2. **AVPlayer (iOS) behavior with chunked HTTP MP3?**
   - AVPlayer is known to buffer more aggressively than ExoPlayer
   - May need `AVPlayerItem.preferredForwardBufferDuration` tuning
   - **Need to benchmark on a real device.**

3. **Cloud transcoding library?**
   - Bun/Node options: `@ffmpeg/ffmpeg` (WASM), native `ffmpeg` subprocess, `lame` bindings
   - WASM ffmpeg adds ~10MB to cloud. Subprocess is simpler but has IPC overhead.
   - Pure JS MP3 encoder (`lamejs`) exists but is slow — fine for real-time at 1x but no headroom.
   - **Decision**: Start with subprocess ffmpeg (already available on most cloud hosts), evaluate lamejs for a zero-dependency option.

4. **How does the SDK push chunks to the cloud relay?**
   - **Option 4a**: Send PCM as WS binary frames on the existing app↔cloud WebSocket (tag with streamId header). Cloud demuxes and routes to the relay.
   - **Option 4b**: SDK opens a separate HTTP POST with chunked transfer encoding to the relay endpoint. Keeps audio traffic off the main WebSocket.
   - **Leaning**: 4a (WS binary) is simpler and avoids authentication complexity for a new HTTP endpoint. Audio input already uses WS binary frames — symmetric.

5. **Stream lifecycle if SDK crashes mid-stream?**
   - Cloud needs a timeout: if no chunks arrive for N seconds, close the HTTP response and clean up.
   - Phone handles this naturally — ExoPlayer finishes playing buffered data, then reports completion.
   - **Decision**: 10-second inactivity timeout on the relay. Configurable.

6. **Max concurrent streams per session?**
   - One active output stream per track ID? Or allow multiple?
   - **Start with**: one stream at a time. Starting a new stream auto-ends the previous one (same as `playAudio` with `stopOtherAudio: true`).