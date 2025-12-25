/**
 * AudioWebSocket - Sends audio over WebSocket with UDP-like behavior.
 *
 * Key insight: TCP backpressure only becomes a problem if you keep queuing.
 * By using a ring buffer on the client side, we drop old audio BEFORE it enters
 * the TCP send queue. This gives us:
 * - No backpressure buildup (we never queue more than BUFFER_SIZE packets)
 * - Automatic "drop oldest" behavior when network is slow
 * - Fresh audio always preferred over stale audio
 *
 * The server already handles binary messages as audio in bun-websocket.ts.
 */

import wsManager from "@/services/WebSocketManager"

class AudioWebSocket {
  private static instance: AudioWebSocket

  // Ring buffer for audio packets - stores only the most recent packets
  private ringBuffer: Uint8Array[] = []
  private writeIndex = 0

  // Buffer size: ~1 second of audio at 50 packets/sec
  private readonly BUFFER_SIZE = 50

  // Send interval in ms - how often we flush the buffer
  private readonly SEND_INTERVAL_MS = 20

  private sendTimer: ReturnType<typeof setInterval> | null = null
  private isEnabled = false

  // Telemetry
  private packetsSent = 0
  private packetsDropped = 0
  private lastLogTime = 0

  private constructor() {}

  public static getInstance(): AudioWebSocket {
    if (!AudioWebSocket.instance) {
      AudioWebSocket.instance = new AudioWebSocket()
    }
    return AudioWebSocket.instance
  }

  /**
   * Enable audio streaming over WebSocket
   */
  public enable() {
    if (this.isEnabled) return

    this.isEnabled = true
    this.ringBuffer = []
    this.writeIndex = 0
    this.packetsSent = 0
    this.packetsDropped = 0

    // Start the send loop
    this.sendTimer = setInterval(() => this.flush(), this.SEND_INTERVAL_MS)
    console.log("AudioWebSocket: Enabled")
  }

  /**
   * Disable audio streaming
   */
  public disable() {
    if (!this.isEnabled) return

    this.isEnabled = false

    if (this.sendTimer) {
      clearInterval(this.sendTimer)
      this.sendTimer = null
    }

    // Log final stats
    console.log(
      `AudioWebSocket: Disabled - sent=${this.packetsSent}, dropped=${this.packetsDropped}`
    )

    this.ringBuffer = []
  }

  /**
   * Add PCM audio data to the ring buffer.
   * If buffer is full, oldest packet is automatically overwritten (dropped).
   */
  public addPcm(data: Uint8Array) {
    if (!this.isEnabled) return

    // Track drops - if we're overwriting a non-empty slot
    if (this.ringBuffer.length >= this.BUFFER_SIZE) {
      this.packetsDropped++
    }

    // Write raw PCM to ring buffer (no sequence byte - TCP guarantees order)
    if (this.ringBuffer.length < this.BUFFER_SIZE) {
      this.ringBuffer.push(data)
    } else {
      this.ringBuffer[this.writeIndex] = data
    }
    this.writeIndex = (this.writeIndex + 1) % this.BUFFER_SIZE
  }

  /**
   * Flush buffered packets to WebSocket.
   * Only sends if WebSocket is connected.
   */
  private flush() {
    if (!wsManager.isConnected() || this.ringBuffer.length === 0) {
      return
    }

    // Send all buffered packets in order
    // Calculate read order: from oldest to newest in the ring
    const count = this.ringBuffer.length
    const startIdx =
      count < this.BUFFER_SIZE ? 0 : this.writeIndex

    for (let i = 0; i < count; i++) {
      const idx = (startIdx + i) % this.BUFFER_SIZE
      const packet = this.ringBuffer[idx]
      if (packet) {
        try {
          wsManager.sendBinary(packet)
          this.packetsSent++
        } catch {
          // Ignore send errors - network issues handled by reconnect
        }
      }
    }

    // Clear the buffer after sending
    this.ringBuffer = []
    this.writeIndex = 0

    // Periodic telemetry log
    const now = Date.now()
    if (now - this.lastLogTime > 5000) {
      this.lastLogTime = now
      if (this.packetsDropped > 0 || __DEV__) {
        console.log(
          `AudioWebSocket: sent=${this.packetsSent}, dropped=${this.packetsDropped}`
        )
      }
    }
  }

  /**
   * Check if audio streaming is enabled
   */
  public isStreamingEnabled(): boolean {
    return this.isEnabled
  }
}

const audioWebSocket = AudioWebSocket.getInstance()
export default audioWebSocket
