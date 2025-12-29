/**
 * @fileoverview UDP Audio Server for receiving audio packets directly from mobile clients.
 *
 * This replaces the Go bridge UDP listener with a Bun-native implementation.
 * Mobile clients send raw PCM audio over UDP for lowest latency.
 *
 * Packet format:
 * - Bytes 0-3: userIdHash (FNV-1a 32-bit, big-endian)
 * - Bytes 4-5: sequence number (big-endian)
 * - Bytes 6+: PCM audio data (or "PING" for ping packets)
 */

import { logger as rootLogger } from "../logging/pino-logger";
import type { UserSession } from "../session/UserSession";

const UDP_PORT = 8000;
const PING_MAGIC = "PING";
const MIN_PACKET_SIZE = 6; // 4 bytes hash + 2 bytes sequence

export class UdpAudioServer {
  private socket: any = null;
  private sessionMap: Map<number, UserSession> = new Map(); // userIdHash → session
  private logger = rootLogger.child({ service: "UdpAudioServer" });

  // Stats
  private packetsReceived = 0;
  private packetsDropped = 0;
  private pingsReceived = 0;

  /**
   * Start the UDP server on port 8000
   */
  async start(): Promise<void> {
    try {
      this.socket = await Bun.udpSocket({
        port: UDP_PORT,
        socket: {
          data: (_socket: unknown, buf: Buffer, port: number, addr: string) => {
            this.handlePacket(buf, port, addr);
          },
        },
      });

      this.logger.info({ port: UDP_PORT, feature: "udp-audio" }, "UDP Audio Server started");
    } catch (error) {
      this.logger.error({ error, port: UDP_PORT, feature: "udp-audio" }, "Failed to start UDP Audio Server");
      throw error;
    }
  }

  /**
   * Handle incoming UDP packet
   */
  private handlePacket(buf: Buffer, port: number, addr: string): void {
    // Minimum packet size check
    if (buf.length < MIN_PACKET_SIZE) {
      this.packetsDropped++;
      return;
    }

    // Parse header (big-endian)
    const userIdHash = buf.readUInt32BE(0);
    const sequence = buf.readUInt16BE(4);

    // Check for ping packet: "PING" at bytes 6-9
    if (buf.length >= 10 && buf.slice(6, 10).toString() === PING_MAGIC) {
      this.handlePing(userIdHash, addr, port);
      return;
    }

    // Lookup session by userIdHash
    const session = this.sessionMap.get(userIdHash);
    if (!session) {
      this.packetsDropped++;
      return;
    }

    // Extract PCM data (after 6-byte header)
    const pcmData = buf.slice(6);

    // Validate PCM data
    if (pcmData.length === 0) {
      this.packetsDropped++;
      return;
    }

    // PCM16 must be even length (2 bytes per sample)
    // If odd, trim the last byte
    const validPcmData = pcmData.length % 2 === 0 ? pcmData : pcmData.slice(0, pcmData.length - 1);

    if (validPcmData.length === 0) {
      this.packetsDropped++;
      return;
    }

    this.packetsReceived++;

    // Log stats periodically
    if (this.packetsReceived % 1000 === 0) {
      this.logger.info(
        {
          packetsReceived: this.packetsReceived,
          packetsDropped: this.packetsDropped,
          pingsReceived: this.pingsReceived,
          activeSessions: this.sessionMap.size,
          feature: "udp-audio",
        },
        "UDP audio stats",
      );
    }

    // Forward to AudioManager
    // Note: sequence number available for future gap detection if needed
    try {
      session.audioManager.processAudioData(validPcmData);
    } catch (error) {
      this.logger.error(
        {
          error,
          userId: session.userId,
          userIdHash,
          sequence,
          feature: "udp-audio",
        },
        "Error processing UDP audio",
      );
    }
  }

  /**
   * Handle UDP ping packet - send ack via WebSocket
   */
  private handlePing(userIdHash: number, addr: string, port: number): void {
    this.pingsReceived++;

    const session = this.sessionMap.get(userIdHash);
    if (!session) {
      this.logger.debug(
        {
          userIdHash,
          addr,
          port,
          feature: "udp-audio",
        },
        "UDP ping from unknown userIdHash",
      );
      return;
    }

    this.logger.info(
      {
        userId: session.userId,
        userIdHash,
        addr,
        port,
        feature: "udp-audio",
      },
      "UDP ping received, sending ack",
    );

    // Send ack via WebSocket through the UDP audio manager
    session.udpAudioManager.sendPingAck();
  }

  /**
   * Register a session for UDP audio reception
   * Called when mobile sends UDP_REGISTER message
   */
  registerSession(userIdHash: number, session: UserSession): void {
    // Check for existing registration with same hash (collision detection)
    const existing = this.sessionMap.get(userIdHash);
    if (existing && existing !== session) {
      this.logger.warn(
        {
          userIdHash,
          existingUserId: existing.userId,
          newUserId: session.userId,
          feature: "udp-audio",
        },
        "userIdHash collision detected - overwriting existing registration",
      );
    }

    this.sessionMap.set(userIdHash, session);

    this.logger.info(
      {
        userId: session.userId,
        userIdHash,
        activeSessions: this.sessionMap.size,
        feature: "udp-audio",
      },
      "Session registered for UDP audio",
    );
  }

  /**
   * Unregister a session from UDP audio reception
   * Called when mobile sends UDP_UNREGISTER message
   */
  unregisterSession(userIdHash: number): void {
    const session = this.sessionMap.get(userIdHash);
    if (session) {
      this.logger.info(
        {
          userId: session.userId,
          userIdHash,
          feature: "udp-audio",
        },
        "Session unregistered from UDP audio",
      );
    }
    this.sessionMap.delete(userIdHash);
  }

  /**
   * Unregister a session by reference (for cleanup during session disposal)
   * This is useful when we don't have the userIdHash handy
   */
  unregisterBySession(session: UserSession): void {
    for (const [hash, s] of this.sessionMap) {
      if (s === session) {
        this.sessionMap.delete(hash);
        this.logger.info(
          {
            userId: session.userId,
            userIdHash: hash,
            feature: "udp-audio",
          },
          "Session unregistered from UDP audio (by reference)",
        );
        return;
      }
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    received: number;
    dropped: number;
    pings: number;
    sessions: number;
  } {
    return {
      received: this.packetsReceived,
      dropped: this.packetsDropped,
      pings: this.pingsReceived,
      sessions: this.sessionMap.size,
    };
  }

  /**
   * Check if a userIdHash is registered
   */
  isRegistered(userIdHash: number): boolean {
    return this.sessionMap.has(userIdHash);
  }

  /**
   * Stop the UDP server and cleanup
   */
  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const sessionCount = this.sessionMap.size;
    this.sessionMap.clear();

    this.logger.info(
      {
        packetsReceived: this.packetsReceived,
        packetsDropped: this.packetsDropped,
        pingsReceived: this.pingsReceived,
        clearedSessions: sessionCount,
        feature: "udp-audio",
      },
      "UDP Audio Server stopped",
    );
  }
}

// Singleton instance
export const udpAudioServer = new UdpAudioServer();
