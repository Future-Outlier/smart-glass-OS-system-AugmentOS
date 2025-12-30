/**
 * @fileoverview UdpAudioManager - Per-session manager for UDP audio handling.
 *
 * Manages UDP audio registration, ping acknowledgments, and cleanup for a user session.
 * Works with the global UdpAudioServer singleton for actual UDP packet handling.
 *
 * Pattern follows other session managers (AudioManager, MicrophoneManager, etc.)
 */

import { Logger } from "pino";

import { UdpRegister, UdpUnregister } from "@mentra/sdk";

import { udpAudioServer } from "../udp/UdpAudioServer";
import { WebSocketReadyState } from "../websocket/types";

import type { UserSession } from "./UserSession";

export class UdpAudioManager {
  private userSession: UserSession;
  private logger: Logger;

  // UDP state
  private _userIdHash?: number;
  private _enabled = false;

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "UdpAudioManager" });
    this.logger.debug("UdpAudioManager initialized");
  }

  /**
   * Whether UDP audio is enabled for this session
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * The userIdHash for this session (FNV-1a hash of userId)
   */
  get userIdHash(): number | undefined {
    return this._userIdHash;
  }

  /**
   * Handle UDP_REGISTER message from mobile client
   * Registers this session with the global UDP server for packet routing
   */
  handleRegister(message: UdpRegister): void {
    const { userIdHash } = message;
    this.logger.info(
      { userIdHash, userId: this.userSession.userId, feature: "udp-audio" },
      "UDP register request received",
    );

    // Store state
    this._userIdHash = userIdHash;
    this._enabled = true;

    // Register with the global UDP audio server
    udpAudioServer.registerSession(userIdHash, this.userSession);

    this.logger.info({ userIdHash, feature: "udp-audio" }, "UDP audio registered successfully");
  }

  /**
   * Handle UDP_UNREGISTER message from mobile client
   * Unregisters this session from UDP audio
   */
  handleUnregister(message: UdpUnregister): void {
    const { userIdHash } = message;
    this.logger.info(
      { userIdHash, userId: this.userSession.userId, feature: "udp-audio" },
      "UDP unregister request received",
    );

    // Unregister from the global UDP audio server
    udpAudioServer.unregisterSession(userIdHash);

    // Clear state
    this._userIdHash = undefined;
    this._enabled = false;

    this.logger.info({ userIdHash, feature: "udp-audio" }, "UDP audio unregistered successfully");
  }

  /**
   * Send UDP ping acknowledgment to mobile client via WebSocket
   * Called by UdpAudioServer when it receives a UDP ping packet for this session
   */
  sendPingAck(): void {
    if (this.userSession.websocket?.readyState !== WebSocketReadyState.OPEN) {
      this.logger.warn({ feature: "udp-audio" }, "Cannot send UDP ping ack - WebSocket not open");
      return;
    }

    try {
      this.userSession.websocket.send(
        JSON.stringify({
          type: "udp_ping_ack",
          timestamp: Date.now(),
        }),
      );
      this.logger.debug({ feature: "udp-audio" }, "UDP ping ack sent");
    } catch (error) {
      this.logger.error({ error, feature: "udp-audio" }, "Error sending UDP ping ack");
    }
  }

  /**
   * Dispose of UDP audio manager and cleanup registrations
   */
  dispose(): void {
    if (this._userIdHash !== undefined) {
      this.logger.info(
        { userIdHash: this._userIdHash, feature: "udp-audio" },
        "Disposing UdpAudioManager, unregistering from UDP server",
      );
      udpAudioServer.unregisterBySession(this.userSession);
      this._userIdHash = undefined;
      this._enabled = false;
    }

    this.logger.debug("UdpAudioManager disposed");
  }
}

export default UdpAudioManager;
