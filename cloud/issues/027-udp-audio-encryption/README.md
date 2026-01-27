# UDP Audio Encryption

Optional encryption for UDP audio packets to secure audio data in transit.

## Documents

- **udp-encryption-spec.md** - Problem, goals, constraints (TODO)
- **udp-encryption-architecture.md** - Technical design (TODO)

## Quick Context

**Current**: UDP audio packets are sent unencrypted. The `userIdHash` header is just for routing, not security.
**Proposed**: Client can request encryption via WS URL param. Cloud sends public key in CONNECTION_ACK. Client encrypts audio with that key.

## Key Context

WebSocket traffic is already TLS-encrypted. UDP was added for lower latency audio streaming but UDP doesn't have built-in encryption. This is optional - clients that don't request encryption continue working as before (backwards compatible).

## Current System

```
Mobile → WS (TLS encrypted)
       ├── CONNECTION_INIT
       ├── UDP_REGISTER {userIdHash}
       └── ...

Mobile → UDP (UNENCRYPTED) → LoadBalancer:8000 → UdpAudioServer
       └── [userIdHash(4)|seq(2)|raw audio]
```

### Current Packet Format

```
┌────────────────┬────────────────┬─────────────────────┐
│  userIdHash    │  sequence      │  PCM/LC3 audio      │
│  (4 bytes BE)  │  (2 bytes BE)  │  (variable)         │
└────────────────┴────────────────┴─────────────────────┘
```

### Key Files

| File                                                     | Purpose                            |
| -------------------------------------------------------- | ---------------------------------- |
| `packages/cloud/src/services/udp/UdpAudioServer.ts`      | UDP packet handling                |
| `packages/cloud/src/services/websocket/bun-websocket.ts` | CONNECTION_ACK response (L374-415) |
| `packages/cloud/src/services/session/UdpAudioManager.ts` | Per-session UDP state              |
| `packages/sdk/src/types/messages/cloud-to-glasses.ts`    | ConnectionAck interface            |
| `packages/sdk/src/types/messages/glasses-to-cloud.ts`    | UdpRegister interface              |

## Proposed System

```
Mobile → WS: wss://cloud.mentra.glass/glasses-ws?udpEncryption=true
       ← CONNECTION_ACK { udpHost, udpPort, udpEncryption: { publicKey } }

Mobile → UDP → Cloud
       └── [userIdHash(4)|seq(2)|nonce(12)|encrypted(audio + tag)]
                                          └── decrypted with session private key
```

### Encrypted Packet Format

```
┌────────────────┬────────────────┬──────────────────┬─────────────────────┐
│  userIdHash    │  sequence      │  nonce           │  ciphertext + tag   │
│  (4 bytes BE)  │  (2 bytes BE)  │  (12 bytes)      │  (audio + 16 bytes) │
└────────────────┴────────────────┴──────────────────┴─────────────────────┘
```

Header (6 bytes) stays the same for routing. Only payload is encrypted.

### Key Exchange Flow

1. Client connects with `?udpEncryption=true` in WS URL
2. Cloud generates ephemeral X25519 keypair for this session
3. Cloud stores private key in `UdpAudioManager` (memory only)
4. Cloud sends public key in CONNECTION_ACK
5. Client uses public key to encrypt audio (X25519 + ChaCha20-Poly1305 or AES-256-GCM)
6. Cloud decrypts with stored private key
7. Keys are garbage collected when session ends

### Overhead

- Nonce: 12 bytes per packet
- Auth tag: 16 bytes per packet
- Total: 28 bytes overhead

Current MTU limit: 1472 bytes → Max encrypted audio: ~1438 bytes (still fits 40ms chunks at 1286 bytes)

## Implementation Plan

### Phase 1: Cloud Changes

1. Parse `udpEncryption` param from WS URL in `bun-websocket.ts`
2. Generate keypair in `UdpAudioManager.handleRegister()` when encryption requested
3. Add `udpEncryption: { publicKey }` to CONNECTION_ACK
4. Store `encryptionEnabled` flag and private key in `UdpAudioManager`
5. In `UdpAudioServer.handlePacket()`, check if session has encryption enabled
6. If encrypted: extract nonce, decrypt payload, then process as normal
7. If not encrypted: process raw audio as before (backwards compat)

### Phase 2: SDK/Mobile Changes

1. Add `udpEncryption` option to connection config
2. Parse public key from CONNECTION_ACK
3. Encrypt audio payload before sending UDP packets
4. Include nonce in packet

## Crypto Choice

| Algorithm                      | Notes                                                    |
| ------------------------------ | -------------------------------------------------------- |
| **X25519 + ChaCha20-Poly1305** | Fast, modern, streaming-friendly. Recommended.           |
| X25519 + AES-256-GCM           | Also fine, maybe better hardware support on some devices |

Libraries:

- Cloud (Bun/TS): `tweetnacl` or `libsodium` bindings
- Mobile: Platform crypto APIs

## Backwards Compatibility

- Clients without `udpEncryption=true` → no public key in CONNECTION_ACK → raw UDP works as before
- Cloud checks `session.udpEncrypted` flag before attempting decryption
- No breaking changes to existing clients

## Status

- [ ] Investigate crypto libraries for Bun
- [ ] Spec out detailed message formats
- [ ] Implement cloud-side encryption support
- [ ] Implement mobile-side encryption
- [ ] Test encrypted path
- [ ] Verify backwards compatibility

---

## Separate Issue: Audio Quality Investigation

**Problem observed:** Audio sounds degraded/broken when switching from glasses mic to phone mic.

### Potential Causes

1. **Audio format mismatch** - Phone sends different format than glasses, but cloud expects the same
2. **LC3 decoder state corruption** - Decoder initialized for one stream, then receives different stream
3. **Missing `/api/client/audio/configure` call** - Phone mic path may not reconfigure audio format
4. **Frame size mismatch** - Phone may encode with different `frameSizeBytes` than cloud expects

### Current Audio Flow

```
Mobile calls POST /api/client/audio/configure
  → AudioManager.setAudioFormat(format, lc3Config)
  → If LC3: initializeLc3Decoder()

UDP packet arrives
  → UdpAudioServer routes to session
  → AudioManager.processAudioData()
  → If audioFormat == "lc3": lc3Service.decodeAudioChunk()
  → Else: use raw PCM
```

### Key Question

When user switches from glasses mic to phone mic:

- Does mobile call `/api/client/audio/configure` again with new format?
- Does the LC3 decoder get reinitialized with correct `frameSizeBytes`?
- Is there a race condition where audio arrives before format is reconfigured?

### Investigation Steps

1. Add logging to `/api/client/audio/configure` to see when/if it's called on mic switch
2. Add logging to `AudioManager.processAudioData()` to track format mismatches
3. Check mobile code for mic switch handling
4. Verify `frameSizeBytes` matches between mobile encoder and cloud decoder

This should be tracked as a separate issue (028) if confirmed.
