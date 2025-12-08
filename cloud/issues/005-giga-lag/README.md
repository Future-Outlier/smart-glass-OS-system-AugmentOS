# Giga Lag - Transcription Latency Detection Bug

False positive lag alerts + missing real lag detection in Soniox transcription streams.

## Documents

- **giga-lag-spec.md** - Problem analysis, root cause, fix proposal

## Quick Context

**Current**: Lag detection uses wall-clock time vs transcript position, causing false alarms when VAD gaps exist
**Proposed**: Use `processingDeficitMs` (audio sent vs transcribed) as the true lag metric

## Key Context

We discovered this investigating a user report of 30+ second caption delays. Initial logs showed "19 minute lag" but deeper analysis revealed Soniox was actually processing within 600-800ms for most users. The bug: our lag calculation compares wall-clock stream age against transcript position, but doesn't account for silence/VAD gaps where no audio is sent.

However, for the specific user reporting issues, there WAS real lag (~2 minutes) that affected only their stream while other users were healthy. This points to a secondary issue with per-stream backlog handling.

## Status

- [x] Root cause identified
- [x] Logs analyzed with correct metric
- [ ] Fix lag detection to use `processingDeficitMs`
- [ ] Add backlog recovery mechanism
- [ ] Deploy and validate
