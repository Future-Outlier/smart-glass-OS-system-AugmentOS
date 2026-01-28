# UDP Audio Encryption

Optional encryption for UDP audio packets to secure audio data in transit.

## Quick Context

**Current**: UDP audio packets are sent unencrypted. The `userIdHash` header is just for routing, not security.
**Proposed**: Client can request encryption via WS URL param. Cloud sends public key in CONNECTION_ACK. Client encrypts audio with that key.

## Key Context

WebSocket traffic is already TLS-encrypted. UDP was added for lower latency audio streaming but UDP doesn't have built-in encryption. This is optional - clients that don't request encryption continue working as before (backwards compatible).

## Implementation

### Crypto Library

Using `tweetnacl` (pure JS, works in Bun):

- **Key exchange**: X25519 (32-byte public keys)
- **Encryption**: XSalsa20-Poly1305 (24-byte nonce, 16-byte auth tag)
- **Total overhead**: 40 bytes per packet (24 nonce + 16 tag)

### Flow

```
1. Client connects: wss://cloud.mentra.glass/glasses-ws?udpEncryption=true

2. Server generates X25519 keypair, sends in CONNECTION_ACK:
   { udpEncryption: { publicKey: "base64...", algorithm: "x25519-xsalsa20-poly1305" } }

3. Client generates own keypair, sends in UDP_REGISTER:
   { userIdHash: 12345, clientPublicKey: "base64..." }

4. Both compute shared key: nacl.box.before(theirPublicKey, ourSecretKey)

5. Client encrypts audio: nacl.box.after(plaintext, nonce, sharedKey)
   Packet: [userIdHash(4)|seq(2)|nonce(24)|ciphertext(audio+16)]

6. Server decrypts: nacl.box.open.after(ciphertext, nonce, sharedKey)
```

### Packet Formats

**Unencrypted** (existing):

```
┌────────────────┬────────────────┬─────────────────────┐
│  userIdHash    │  sequence      │  audio data         │
│  (4 bytes BE)  │  (2 bytes BE)  │  (variable)         │
└────────────────┴────────────────┴─────────────────────┘
```

**Encrypted** (new):

```
┌────────────────┬────────────────┬──────────────────┬─────────────────────┐
│  userIdHash    │  sequence      │  nonce           │  ciphertext + tag   │
│  (4 bytes BE)  │  (2 bytes BE)  │  (24 bytes)      │  (audio + 16 bytes) │
└────────────────┴────────────────┴──────────────────┴─────────────────────┘
```

Header (6 bytes) stays the same for routing. Only payload is encrypted.

### Key Files Changed

| File                                                     | Change                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `packages/sdk/src/types/messages/cloud-to-glasses.ts`    | Added `udpEncryption` field to `ConnectionAck`           |
| `packages/sdk/src/types/messages/glasses-to-cloud.ts`    | Added `clientPublicKey` field to `UdpRegister`           |
| `packages/cloud/src/services/udp/UdpCrypto.ts`           | **NEW** - Crypto utilities (key gen, encrypt, decrypt)   |
| `packages/cloud/src/services/session/UdpAudioManager.ts` | Keypair generation, shared key computation, decryption   |
| `packages/cloud/src/services/udp/UdpAudioServer.ts`      | Decryption of incoming encrypted packets                 |
| `packages/cloud/src/services/websocket/bun-websocket.ts` | Parse `?udpEncryption=true`, include public key in ACK   |
| `packages/cloud/src/services/websocket/types.ts`         | Added `udpEncryptionRequested` to `GlassesWebSocketData` |

### Key Numbers

| Parameter           | Value                                      |
| ------------------- | ------------------------------------------ |
| X25519 public key   | 32 bytes                                   |
| XSalsa20 nonce      | 24 bytes                                   |
| Poly1305 auth tag   | 16 bytes                                   |
| Total overhead      | 40 bytes/packet                            |
| Max UDP payload     | 1024 bytes                                 |
| Max encrypted audio | ~978 bytes (still fits 40ms LC3 at 48kbps) |

## Backwards Compatibility

- Clients without `udpEncryption=true` → no public key in CONNECTION_ACK → raw UDP works as before
- Cloud checks `session.udpAudioManager.encryptionEnabled` before attempting decryption
- No breaking changes to existing clients

## Status

- [x] Investigate crypto libraries for Bun (using tweetnacl)
- [x] Implement cloud-side encryption support
  - [x] UdpCrypto utility module
  - [x] UdpAudioManager keypair/shared key management
  - [x] UdpAudioServer decryption
  - [x] bun-websocket.ts query param parsing + CONNECTION_ACK
  - [x] SDK type updates
- [ ] Implement mobile-side encryption (Android)
- [ ] Implement mobile-side encryption (iOS)
- [ ] Test encrypted path end-to-end
- [ ] Verify backwards compatibility

## Related

- **028-phone-mic-audio-quality** - Audio quality fix discovered during this investigation
