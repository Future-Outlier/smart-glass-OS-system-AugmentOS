import WebSocket from "ws";
import { Logger } from "pino";
import UserSession from "./UserSession";

export interface BridgeOptions {
  bridgeUrl?: string; // ws://host:8080/ws
}

/**
 * LiveKitClient (TS) - Thin client that talks to Go livekit-bridge over WebSocket.
 * - Joins a LiveKit room via bridge
 * - Enables subscribe to a target publisher identity
 * - Streams 16 kHz PCM16 frames (10 ms, 320 bytes) back to AudioManager
 */
export class LiveKitClient {
  private readonly logger: Logger;
  private readonly userSession: UserSession;
  private readonly bridgeUrl: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private lastParams: {
    url: string;
    roomName: string;
    token: string;
    targetIdentity?: string;
  } | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manualClose = false;
  private disposed = false;
  // Endianness handling: 'auto' (detect), 'swap' (force swap), 'off' (no action)
  private readonly endianMode: "auto" | "swap" | "off";
  private endianSwapDetermined = false;
  private shouldSwapBytes = false;

  constructor(userSession: UserSession, opts?: BridgeOptions) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "LiveKitClientTS" });
    this.bridgeUrl =
      opts?.bridgeUrl ||
      process.env.LIVEKIT_GO_BRIDGE_URL ||
      "ws://livekit-bridge:8080/ws";
    const mode = (process.env.LIVEKIT_PCM_ENDIAN || "auto").toLowerCase();
    this.endianMode =
      mode === "swap" || mode === "off" ? (mode as "swap" | "off") : "auto";
  }

  async connect(params: {
    url: string;
    roomName: string;
    token: string;
    targetIdentity?: string;
  }): Promise<void> {
    if (this.disposed) {
      throw new Error("LiveKitClientTS is disposed");
    }
    if (this.ws) await this.close();

    const userId = `cloud-agent:${this.userSession.userId}`;
    // Ensure /ws path is present
    const base = this.bridgeUrl.endsWith("/ws")
      ? this.bridgeUrl
      : `${this.bridgeUrl.replace(/\/$/, "")}/ws`;
    const wsUrl = `${base}?userId=${encodeURIComponent(userId)}`;
    this.logger.info(
      { wsUrl, room: params.roomName, target: params.targetIdentity },
      "Connecting to livekit-bridge",
    );

    // Disable permessage-deflate to avoid any proxy/compression shenanigans in prod
    this.ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    this.manualClose = false;
    this.lastParams = params;
    const wsRef = this.ws;

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("bridge ws timeout")), 8000);
      wsRef?.once("open", () => {
        clearTimeout(to);
        // If we were disposed/closed while connecting, abort immediately
        if (this.disposed || this.manualClose || this.ws !== wsRef) {
          try {
            wsRef.close();
          } catch {
            /* noop */
          }
          reject(new Error("bridge ws aborted"));
          return;
        }
        const g = globalThis as unknown as { Bun?: { version?: string } };
        const bunVersion = g.Bun?.version;
        this.logger.debug(
          { feature: "livekit", wsUrl, bun: bunVersion, node: process.version },
          "Bridge WS open (server)",
        );
        resolve();
      });
      wsRef?.once("error", (err: Error) => {
        clearTimeout(to);
        reject(err);
      });
    });

    if (this.disposed || this.manualClose || this.ws !== wsRef) {
      // Safety: connection established but client was disposed in-between
      try {
        wsRef.close();
      } catch {
        /* noop */
      }
      throw new Error("bridge ws aborted (post-open)");
    }
    this.connected = true;
    let frameCount = 0; // TODO(isaiah): clean up after livekit feature implementation.
    const chunkStats = {
      count: 0,
      lastTime: 0,
      gaps: [] as number[],
    };

    // Wire message handler before sending commands
    this.ws.on("message", (data: WebSocket.RawData) => {
      // calculate jitter.

      const now = Date.now();
      chunkStats.count++;

      if (chunkStats.lastTime > 0) {
        const gap = now - chunkStats.lastTime;
        chunkStats.gaps.push(gap);

        // Log same format as your app
        this.logger.debug(
          { feature: "jitter" },
          `${chunkStats.count}: Cloud chunk gap: ${gap}ms`,
        );

        // Every 20 chunks, show stats
        if (chunkStats.count % 20 === 0) {
          const recent = chunkStats.gaps.slice(-20);
          const avg = recent.reduce((a, b) => a + b) / recent.length;
          const min = Math.min(...recent);
          const max = Math.max(...recent);
          this.logger.debug(
            { feature: "jitter" },
            `Cloud stats: avg=${avg.toFixed(1)}ms, min=${min}ms, max=${max}ms`,
          );
        }
      }

      chunkStats.lastTime = now;

      // Rest of logic.
      try {
        // Normalize data to a Node Buffer regardless of how ws delivered it
        let buf: Buffer;
        if (Buffer.isBuffer(data)) {
          buf = data as Buffer;
        } else if (Array.isArray(data)) {
          buf = Buffer.concat(data as Buffer[]);
        } else if (data instanceof ArrayBuffer) {
          buf = Buffer.from(data as ArrayBuffer);
        } else if (ArrayBuffer.isView(data as unknown as ArrayBufferView)) {
          const view = data as unknown as ArrayBufferView;
          buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
        } else {
          // Fallback: attempt to coerce to string then to Buffer
          buf = Buffer.from(String(data));
        }

        // Guard: if an odd-length payload slips through (e.g., stray 1-byte header), drop the first byte
        if ((buf.length & 1) === 1) {
          if (frameCount % 200 === 0) {
            this.logger.warn(
              { feature: "livekit", rawLen: buf.length },
              "Odd-length PCM payload detected; dropping first byte",
            );
          }
          buf = buf.slice(1);
        }

        // Optional endianness handling
        if (this.endianMode !== "off") {
          // Detect once in 'auto' mode using first few samples
          if (
            !this.endianSwapDetermined &&
            this.endianMode === "auto" &&
            buf.length >= 16
          ) {
            let oddAreMostlyFFor00 = 0; // count of LSB being 0xFF or 0x00 if we assume BE input
            let evenAreMostlyFFor00 = 0; // same if we assume LE input
            const pairs = Math.min(16, Math.floor(buf.length / 2));
            for (let i = 0; i < pairs; i++) {
              const b0 = buf[2 * i];
              const b1 = buf[2 * i + 1];
              if (b0 === 0x00 || b0 === 0xff) evenAreMostlyFFor00++;
              if (b1 === 0x00 || b1 === 0xff) oddAreMostlyFFor00++;
            }
            // If upper byte (b1) looks like sign-extension much more often than lower byte,
            // it's likely BE and needs swapping to LE.
            if (oddAreMostlyFFor00 >= evenAreMostlyFFor00 + 6) {
              this.shouldSwapBytes = true;
            } else {
              this.shouldSwapBytes = false;
            }
            this.endianSwapDetermined = true;
            this.logger.info(
              {
                feature: "livekit",
                oddFF00: oddAreMostlyFFor00,
                evenFF00: evenAreMostlyFFor00,
                willSwap: this.shouldSwapBytes,
              },
              "PCM endianness detection result",
            );
          }
          if (this.endianMode === "swap") {
            this.shouldSwapBytes = true;
            this.endianSwapDetermined = true;
          }
          if (this.shouldSwapBytes) {
            // Swap bytes in place for LE format
            for (let i = 0; i + 1 < buf.length; i += 2) {
              const t = buf[i];
              buf[i] = buf[i + 1];
              buf[i + 1] = t;
            }
          }
        }

        // Periodic diagnostics: log first few Int16 samples to confirm endianness/content in prod
        if (frameCount % 500 === 0 && buf.length >= 8) {
          const sampleCount = Math.min(8, Math.floor(buf.length / 2));
          const i16 = new Int16Array(
            buf.buffer,
            buf.byteOffset,
            Math.floor(buf.byteLength / 2),
          );
          const headSamples: number[] = Array.from(i16.slice(0, sampleCount));
          this.logger.debug(
            {
              feature: "livekit",
              bytes: buf.length,
              headBytes: buf.slice(0, 10),
              headI16: headSamples,
            },
            "Received PCM16 frame",
          );
        }

        // Forward to AudioManager (PCM16LE @ 16kHz, mono)
        this.userSession.audioManager.processAudioData(buf, /* isLC3 */ false);
      } catch (err) {
        if (frameCount % 200 === 0) {
          this.logger.warn(err, "Failed to forward PCM16 frame");
        }
      }

      frameCount++;
    });

    // Lifecycle: close/error
    this.ws.on("close", (code: number, reason: Buffer) => {
      this.logger.warn(
        { feature: "livekit", code, reason: reason?.toString() },
        "Bridge WS closed (server)",
      );
      this.connected = false;
      this.scheduleReconnect();
    });
    this.ws.on("error", (err) => {
      this.logger.warn({ feature: "livekit", err }, "Bridge WS error (server)");
      // keep connected flag; close will also trigger in most cases
    });

    // Join room via bridge
    this.logger.debug(
      { feature: "livekit", roomName: params.roomName },
      "Sending join_room to bridge",
    );
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "join_room",
          roomName: params.roomName,
          token: params.token,
          url: params.url,
        }),
      );
    }

    // Enable subscribe to target identity (publisher) if provided
    this.logger.debug(
      { feature: "livekit", targetIdentity: params.targetIdentity || "" },
      "Sending subscribe_enable to bridge",
    );
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "subscribe_enable",
          targetIdentity: params.targetIdentity || "",
        }),
      );
    }

    this.logger.info(
      { feature: "livekit" },
      "LiveKitClientTS connected and subscribe enabled",
    );
  }

  async close(): Promise<void> {
    if (!this.ws) return;
    try {
      try {
        this.ws.send(JSON.stringify({ action: "subscribe_disable" }));
      } catch (error) {
        const _logger = this.logger.child({ feature: "livekit" });
        _logger.warn(error, "Failed to send subscribe_disable");
      }
      this.manualClose = true;
      this.ws.close();
    } catch {}
    this.ws = null;
    this.connected = false;
    this.lastParams = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.connected && !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  enableSubscribe(targetIdentity: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ action: "subscribe_enable", targetIdentity }),
    );
  }

  disableSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "subscribe_disable" }));
  }

  private scheduleReconnect(): void {
    if (this.manualClose || this.disposed) return;
    if (!this.lastParams) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts++));
    this.logger.info(
      { feature: "livekit", delayMs: delay },
      "Scheduling bridge reconnect",
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.lastParams) return;
      this.connect(this.lastParams).catch((err) => {
        const _logger = this.logger.child({ feature: "livekit" });
        _logger.error(err, "Bridge reconnect failed");
        this.scheduleReconnect();
      });
    }, delay);
  }

  public dispose(): void {
    // Ensure we do a full, manual-close teardown to prevent auto-reconnect
    this.disposed = true;
    void this.close();
  }
}

export default LiveKitClient;
