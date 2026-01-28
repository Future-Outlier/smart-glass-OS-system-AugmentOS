/**
 * @fileoverview UDP Crypto utility for encrypted audio packets.
 *
 * Uses tweetnacl (X25519 + XSalsa20-Poly1305) for key exchange and authenticated encryption.
 *
 * Key exchange flow:
 * 1. Server generates ephemeral X25519 keypair on session start
 * 2. Server sends public key to client in CONNECTION_ACK
 * 3. Client generates its own keypair and sends public key in UDP_REGISTER
 * 4. Both sides compute shared key using box.before()
 * 5. All subsequent packets encrypted with box.after() using shared key
 *
 * Encrypted packet format:
 * [userIdHash(4)|seq(2)|nonce(24)|ciphertext(audio + 16 bytes tag)]
 *
 * Overhead: 24 bytes nonce + 16 bytes auth tag = 40 bytes per packet
 */

import nacl from "tweetnacl";

/** Nonce size for XSalsa20-Poly1305 (24 bytes) */
export const NONCE_SIZE = nacl.box.nonceLength; // 24

/** Auth tag size for Poly1305 (16 bytes) */
export const TAG_SIZE = nacl.box.overheadLength; // 16

/** Public key size for X25519 (32 bytes) */
export const PUBLIC_KEY_SIZE = nacl.box.publicKeyLength; // 32

/** Total overhead per encrypted packet */
export const ENCRYPTION_OVERHEAD = NONCE_SIZE + TAG_SIZE; // 40 bytes

/**
 * Keypair for X25519 key exchange
 */
export interface UdpKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generate a new X25519 keypair for a session
 */
export function generateKeyPair(): UdpKeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  };
}

/**
 * Compute shared key from our secret key and peer's public key.
 * This is computed once per session and reused for all packets.
 *
 * @param ourSecretKey Our X25519 secret key
 * @param theirPublicKey Peer's X25519 public key
 * @returns 32-byte shared key for symmetric encryption
 */
export function computeSharedKey(ourSecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return nacl.box.before(theirPublicKey, ourSecretKey);
}

/**
 * Encrypt audio data using precomputed shared key.
 * Returns nonce + ciphertext (which includes 16-byte auth tag).
 *
 * @param plaintext Audio data to encrypt
 * @param sharedKey Precomputed shared key from computeSharedKey()
 * @returns Buffer containing [nonce(24)|ciphertext(plaintext.length + 16)]
 */
export function encrypt(plaintext: Uint8Array, sharedKey: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(NONCE_SIZE);
  const ciphertext = nacl.box.after(plaintext, nonce, sharedKey);

  // Combine nonce + ciphertext
  const result = new Uint8Array(NONCE_SIZE + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, NONCE_SIZE);

  return result;
}

/**
 * Decrypt audio data using precomputed shared key.
 * Input should be [nonce(24)|ciphertext(...)].
 *
 * @param encryptedData Buffer containing [nonce(24)|ciphertext]
 * @param sharedKey Precomputed shared key from computeSharedKey()
 * @returns Decrypted audio data, or null if decryption fails (tampered/wrong key)
 */
export function decrypt(encryptedData: Uint8Array, sharedKey: Uint8Array): Uint8Array | null {
  if (encryptedData.length < NONCE_SIZE + TAG_SIZE) {
    return null; // Too short to contain nonce + tag
  }

  const nonce = encryptedData.slice(0, NONCE_SIZE);
  const ciphertext = encryptedData.slice(NONCE_SIZE);

  return nacl.box.open.after(ciphertext, nonce, sharedKey);
}

/**
 * Encode public key to base64 for transmission in JSON messages
 */
export function encodePublicKey(publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString("base64");
}

/**
 * Decode base64 public key from JSON messages
 * @returns Public key bytes, or null if invalid
 */
export function decodePublicKey(base64Key: string): Uint8Array | null {
  try {
    const bytes = Buffer.from(base64Key, "base64");
    if (bytes.length !== PUBLIC_KEY_SIZE) {
      return null;
    }
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

/**
 * Session encryption state - stored in UdpAudioManager
 */
export interface UdpEncryptionState {
  /** Whether encryption is enabled for this session */
  enabled: boolean;
  /** Server's keypair (generated on session start) */
  serverKeyPair: UdpKeyPair;
  /** Client's public key (received in UDP_REGISTER) */
  clientPublicKey?: Uint8Array;
  /** Precomputed shared key (computed after receiving client's public key) */
  sharedKey?: Uint8Array;
}

/**
 * Create initial encryption state for a session that requested encryption
 */
export function createEncryptionState(): UdpEncryptionState {
  return {
    enabled: true,
    serverKeyPair: generateKeyPair(),
  };
}

/**
 * Complete encryption setup by adding client's public key and computing shared key
 */
export function completeEncryptionSetup(
  state: UdpEncryptionState,
  clientPublicKeyBase64: string,
): { success: boolean; error?: string } {
  const clientPublicKey = decodePublicKey(clientPublicKeyBase64);
  if (!clientPublicKey) {
    return { success: false, error: "Invalid client public key" };
  }

  state.clientPublicKey = clientPublicKey;
  state.sharedKey = computeSharedKey(state.serverKeyPair.secretKey, clientPublicKey);

  return { success: true };
}
