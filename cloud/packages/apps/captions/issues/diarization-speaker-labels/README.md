# Diarization Speaker Labels on Glasses Display

Show speaker change indicators on glasses and preview when different speakers are detected, helping deaf and hard of hearing users follow multi-person conversations.

## Documents

- **speaker-labels-spec.md** - Technical specification and implementation plan

## Quick Context

**Current**: The glasses display shows a continuous stream of text without indicating who is speaking. Diarization data (`speakerId`) is available from Soniox but only used in the transcript list UI.

**Proposed**: Add speaker labels like `[1]:` or `[2]:` at the start of each speaker's turn in the glasses display and preview, making it clear when the speaker changes.

## User Need

Deaf and hard of hearing users have specifically requested this feature. In multi-person conversations, it's difficult to follow who is speaking without visual speaker indicators. This is especially important for:
- Meetings with multiple participants
- Conversations at restaurants/social settings
- Any scenario with 2+ speakers

## Example Output

**Current display:**
```
Hello, how are you today? I'm doing
great thanks. Did you see the news
about the product launch? Yes I did,
it looks amazing.
```

**Proposed display with speaker labels:**
```
[1]: Hello, how are you today?
[2]: I'm doing great thanks. Did you
see the news about the product launch?
[1]: Yes I did, it looks amazing.
```

## Dependencies

- **Should fix first**: [transcript-list-correction-bug](../transcript-list-correction-bug) - The same utteranceId/speaker correlation issues affect both the transcript list and this feature

## Status

- [x] Feature request documented
- [ ] Fix transcript-list-correction-bug first
- [ ] Design speaker label format ([1], [S1], [Speaker 1], etc.)
- [ ] Implement in TranscriptProcessor
- [ ] Update DisplayManager to pass speakerId
- [ ] Test with multi-speaker scenarios
- [ ] Gather user feedback on label format