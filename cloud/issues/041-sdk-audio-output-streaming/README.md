# SDK Audio Output Streaming

Enable SDK apps to stream real-time audio back to the mobile client/glasses for playback — unlocking conversational AI (Gemini Live, OpenAI Realtime), streaming TTS, and live audio processing.

## Documents

- **audio-streaming-spec.md** - Problem, goals, constraints, use cases
- **audio-streaming-architecture.md** - Implementation options, tradeoffs, recommended approach

## Quick Context

**Current**: SDK apps can only play audio via `playAudio(url)` (complete file URL) or `speak(text)` (server-side TTS). No way to stream real-time audio chunks back to the user.

**Proposed**: New SDK API to push PCM audio chunks that play on the mobile client/glasses in real-time, enabling conversational AI and streaming TTS use cases.

## Key Context

Audio **input** streaming already works — glasses mic sends PCM chunks through cloud to SDK apps via WebSocket binary frames. The **output** direction (SDK app → glasses speaker) has no streaming path. The mobile client uses `expo-audio`'s `AudioPlayer.replace({uri})` which accepts URLs but not raw PCM streams. Any solution needs to either work within that constraint or extend the mobile audio player.

## Architecture

```
Current (one-shot):
  SDK App --playAudio(url)--> Cloud --audio_play_request--> Phone --HTTP GET--> CDN/Server
                                                            Phone --BLE--> Glasses Speaker

Missing (streaming):
  SDK App --PCM chunks--> ??? --> Phone --> Glasses Speaker
```

## Status

- [x] Spec written
- [x] Architecture options documented
- [ ] Option selected
- [ ] Implementation
- [ ] Mobile client changes (if needed)
- [ ] End-to-end test with Gemini Live