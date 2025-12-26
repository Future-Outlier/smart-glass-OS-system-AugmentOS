package com.mentra.core.services

import android.util.Log
import com.mentra.core.Bridge
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.*

/**
 * UDP Audio Sender for low-latency audio streaming to the cloud.
 *
 * Packet format:
 * - Bytes 0-3: userIdHash (FNV-1a hash of userId, big-endian)
 * - Bytes 4-5: sequence number (big-endian, wraps at 65535)
 * - Bytes 6+: PCM audio data
 *
 * Ping packet format:
 * - Bytes 0-3: userIdHash
 * - Bytes 4-5: sequence number (0)
 * - Bytes 6-9: "PING" ASCII
 */
class UdpAudioSender private constructor() {

    companion object {
        private const val TAG = "UdpAudioSender"
        private const val UDP_PORT = 8000
        private const val HEADER_SIZE = 6 // 4 bytes userIdHash + 2 bytes sequence
        private const val PING_MAGIC = "PING"

        @Volatile
        private var instance: UdpAudioSender? = null

        fun getInstance(): UdpAudioSender {
            return instance ?: synchronized(this) {
                instance ?: UdpAudioSender().also { instance = it }
            }
        }

        /**
         * Compute FNV-1a hash of a string (32-bit)
         */
        fun fnv1aHash(str: String): Int {
            val FNV_PRIME = 0x01000193
            var hash = 0x811c9dc5.toInt()

            for (byte in str.toByteArray(Charsets.UTF_8)) {
                hash = hash xor (byte.toInt() and 0xff)
                hash *= FNV_PRIME
            }

            return hash
        }
    }

    private var socket: DatagramSocket? = null
    private var serverAddress: InetAddress? = null
    private var serverPort: Int = UDP_PORT
    private var userIdHash: Int = 0
    private var userId: String = ""

    private val sequenceNumber = AtomicInteger(0)
    private val isConnected = AtomicBoolean(false)
    private val isPingPending = AtomicBoolean(false)

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Configure the UDP sender with server details and user ID
     *
     * @param host The UDP server hostname (derived from backend_url)
     * @param port The UDP server port (default 8000)
     * @param userId The user's ID for identification
     */
    fun configure(host: String, port: Int = UDP_PORT, userId: String) {
        this.userId = userId
        this.userIdHash = fnv1aHash(userId)
        this.serverPort = port

        scope.launch {
            try {
                serverAddress = InetAddress.getByName(host)
                Bridge.log("UDP: Configured for $host:$port, userIdHash=${userIdHash.toUInt()}")
            } catch (e: Exception) {
                Bridge.log("UDP: Failed to resolve host $host: ${e.message}")
            }
        }
    }

    /**
     * Start the UDP sender
     */
    fun start(): Boolean {
        if (isConnected.get()) {
            Bridge.log("UDP: Already connected")
            return true
        }

        if (serverAddress == null) {
            Bridge.log("UDP: Cannot start - not configured")
            return false
        }

        return try {
            socket = DatagramSocket()
            socket?.soTimeout = 5000 // 5 second timeout for receives
            isConnected.set(true)
            Bridge.log("UDP: Started sender")
            true
        } catch (e: Exception) {
            Bridge.log("UDP: Failed to start: ${e.message}")
            false
        }
    }

    /**
     * Stop the UDP sender
     */
    fun stop() {
        isConnected.set(false)
        try {
            socket?.close()
        } catch (e: Exception) {
            // Ignore
        }
        socket = null
        Bridge.log("UDP: Stopped")
    }

    /**
     * Send audio data via UDP
     *
     * @param pcmData The PCM audio data to send
     */
    fun sendAudio(pcmData: ByteArray) {
        if (!isConnected.get() || socket == null || serverAddress == null) {
            return
        }

        scope.launch {
            try {
                val seq = sequenceNumber.getAndIncrement() and 0xFFFF

                // Create packet: header + pcm data
                val packet = ByteBuffer.allocate(HEADER_SIZE + pcmData.size)
                    .order(ByteOrder.BIG_ENDIAN)
                    .putInt(userIdHash)
                    .putShort(seq.toShort())
                    .put(pcmData)
                    .array()

                val datagramPacket = DatagramPacket(
                    packet,
                    packet.size,
                    serverAddress,
                    serverPort
                )

                socket?.send(datagramPacket)
            } catch (e: Exception) {
                // UDP sends can fail silently - don't log every failure
                if (sequenceNumber.get() % 1000 == 0) {
                    Bridge.log("UDP: Send error (sampled): ${e.message}")
                }
            }
        }
    }

    /**
     * Send a UDP ping to test connectivity
     * The server will respond via WebSocket if the ping is received
     *
     * @return true if ping was sent successfully
     */
    fun sendPing(): Boolean {
        if (socket == null || serverAddress == null) {
            Bridge.log("UDP: Cannot send ping - not configured")
            return false
        }

        // Start socket if needed
        if (!isConnected.get()) {
            if (!start()) {
                return false
            }
        }

        return try {
            // Ping packet: userIdHash + seq(0) + "PING"
            val pingMagic = PING_MAGIC.toByteArray(Charsets.US_ASCII)
            val packet = ByteBuffer.allocate(HEADER_SIZE + pingMagic.size)
                .order(ByteOrder.BIG_ENDIAN)
                .putInt(userIdHash)
                .putShort(0) // Sequence 0 for ping
                .put(pingMagic)
                .array()

            val datagramPacket = DatagramPacket(
                packet,
                packet.size,
                serverAddress,
                serverPort
            )

            socket?.send(datagramPacket)
            isPingPending.set(true)
            Bridge.log("UDP: Ping sent to ${serverAddress?.hostAddress}:$serverPort")
            true
        } catch (e: Exception) {
            Bridge.log("UDP: Failed to send ping: ${e.message}")
            false
        }
    }

    /**
     * Called when ping response is received via WebSocket
     */
    fun onPingResponse() {
        isPingPending.set(false)
        Bridge.log("UDP: Ping response received - UDP is working")
    }

    /**
     * Check if a ping is pending
     */
    fun isPingPending(): Boolean = isPingPending.get()

    /**
     * Get the current user ID hash
     */
    fun getUserIdHash(): Int = userIdHash

    /**
     * Check if UDP is connected and ready
     */
    fun isReady(): Boolean = isConnected.get() && serverAddress != null

    /**
     * Clean up resources
     */
    fun cleanup() {
        stop()
        scope.cancel()
        instance = null
    }
}
