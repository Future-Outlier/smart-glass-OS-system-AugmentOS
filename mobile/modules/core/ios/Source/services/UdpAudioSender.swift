//
//  UdpAudioSender.swift
//  AOS
//
//  UDP Audio Sender for low-latency audio streaming to the cloud.
//

import Foundation
import Network

/// UDP Audio Sender for low-latency audio streaming to the cloud.
///
/// Packet format:
/// - Bytes 0-3: userIdHash (FNV-1a hash of userId, big-endian)
/// - Bytes 4-5: sequence number (big-endian, wraps at 65535)
/// - Bytes 6+: PCM audio data
///
/// Ping packet format:
/// - Bytes 0-3: userIdHash
/// - Bytes 4-5: sequence number (0)
/// - Bytes 6-9: "PING" ASCII
class UdpAudioSender {
    static let shared = UdpAudioSender()

    private static let UDP_PORT: UInt16 = 8000
    private static let HEADER_SIZE = 6 // 4 bytes userIdHash + 2 bytes sequence
    private static let PING_MAGIC = "PING"

    private var connection: NWConnection?
    private var serverHost: String?
    private var serverPort: UInt16 = UDP_PORT
    private var userIdHash: UInt32 = 0
    private var userId: String = ""

    private var sequenceNumber: UInt16 = 0
    private var isConnected = false
    private var isPingPendingFlag = false

    private let queue = DispatchQueue(label: "com.mentra.udp.sender", qos: .userInteractive)
    private let lock = NSLock()

    private init() {}

    /// Compute FNV-1a hash of a string (32-bit)
    static func fnv1aHash(_ str: String) -> UInt32 {
        let FNV_PRIME: UInt32 = 0x0100_0193
        var hash: UInt32 = 0x811C_9DC5

        for byte in str.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* FNV_PRIME
        }

        return hash
    }

    /// Configure the UDP sender with server details and user ID
    ///
    /// - Parameters:
    ///   - host: The UDP server hostname (derived from backend_url)
    ///   - port: The UDP server port (default 8000)
    ///   - userId: The user's ID for identification
    func configure(host: String, port: Int = Int(UDP_PORT), userId: String) {
        lock.lock()
        defer { lock.unlock() }

        self.userId = userId
        userIdHash = UdpAudioSender.fnv1aHash(userId)
        serverHost = host
        serverPort = UInt16(port)

        Bridge.log("UDP: Configured for \(host):\(port), userIdHash=\(userIdHash)")
    }

    /// Start the UDP sender
    func start() -> Bool {
        lock.lock()
        defer { lock.unlock() }

        if isConnected {
            Bridge.log("UDP: Already connected")
            return true
        }

        guard let host = serverHost else {
            Bridge.log("UDP: Cannot start - not configured")
            return false
        }

        let hostEndpoint = NWEndpoint.Host(host)
        let portEndpoint = NWEndpoint.Port(rawValue: serverPort)!

        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true

        connection = NWConnection(host: hostEndpoint, port: portEndpoint, using: params)

        connection?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                Bridge.log("UDP: Connection ready")
                self?.lock.lock()
                self?.isConnected = true
                self?.lock.unlock()
            case let .failed(error):
                Bridge.log("UDP: Connection failed: \(error)")
                self?.lock.lock()
                self?.isConnected = false
                self?.lock.unlock()
            case .cancelled:
                Bridge.log("UDP: Connection cancelled")
                self?.lock.lock()
                self?.isConnected = false
                self?.lock.unlock()
            default:
                break
            }
        }

        connection?.start(queue: queue)
        isConnected = true
        Bridge.log("UDP: Started sender")
        return true
    }

    /// Stop the UDP sender
    func stop() {
        lock.lock()
        defer { lock.unlock() }

        connection?.cancel()
        connection = nil
        isConnected = false
        Bridge.log("UDP: Stopped")
    }

    /// Send audio data via UDP
    ///
    /// - Parameter pcmData: The PCM audio data to send
    func sendAudio(_ pcmData: Data) {
        lock.lock()
        guard isConnected, let connection = connection else {
            lock.unlock()
            return
        }
        let hash = userIdHash
        let seq = sequenceNumber
        sequenceNumber = sequenceNumber &+ 1
        lock.unlock()

        // Create packet: header + pcm data
        var packet = Data(capacity: UdpAudioSender.HEADER_SIZE + pcmData.count)

        // Add userIdHash (big-endian)
        var hashBE = hash.bigEndian
        packet.append(Data(bytes: &hashBE, count: 4))

        // Add sequence number (big-endian)
        var seqBE = seq.bigEndian
        packet.append(Data(bytes: &seqBE, count: 2))

        // Add PCM data
        packet.append(pcmData)

        connection.send(content: packet, completion: .contentProcessed { error in
            if let error = error, self.sequenceNumber % 1000 == 0 {
                Bridge.log("UDP: Send error (sampled): \(error)")
            }
        })
    }

    /// Send a UDP ping to test connectivity
    /// The server will respond via WebSocket if the ping is received
    ///
    /// - Returns: true if ping was queued successfully
    func sendPing() -> Bool {
        lock.lock()

        // Start socket if needed
        if !isConnected {
            lock.unlock()
            if !start() {
                return false
            }
            lock.lock()
        }

        guard let connection = connection else {
            lock.unlock()
            Bridge.log("UDP: Cannot send ping - not connected")
            return false
        }

        let hash = userIdHash
        // Set pending flag before sending so we're ready for the response
        isPingPendingFlag = true
        lock.unlock()

        // Ping packet: userIdHash + seq(0) + "PING"
        var packet = Data(capacity: UdpAudioSender.HEADER_SIZE + 4)

        // Add userIdHash (big-endian)
        var hashBE = hash.bigEndian
        packet.append(Data(bytes: &hashBE, count: 4))

        // Add sequence number 0 (big-endian)
        var seqBE: UInt16 = 0
        packet.append(Data(bytes: &seqBE, count: 2))

        // Add "PING" magic
        packet.append(UdpAudioSender.PING_MAGIC.data(using: .ascii)!)

        Bridge.log("UDP: Sending ping to \(serverHost ?? "?"):\(serverPort)")

        connection.send(content: packet, completion: .contentProcessed { [weak self] error in
            if let error = error {
                Bridge.log("UDP: Failed to send ping: \(error)")
                // Reset pending flag on failure
                self?.lock.lock()
                self?.isPingPendingFlag = false
                self?.lock.unlock()
            }
        })

        return true
    }

    /// Called when ping response is received via WebSocket
    func onPingResponse() {
        lock.lock()
        isPingPendingFlag = false
        lock.unlock()
        Bridge.log("UDP: Ping response received - UDP is working")
    }

    /// Check if a ping is pending
    func isPingPending() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return isPingPendingFlag
    }

    /// Get the current user ID hash
    func getUserIdHash() -> UInt32 {
        lock.lock()
        defer { lock.unlock() }
        return userIdHash
    }

    /// Check if UDP is connected and ready
    func isReady() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return isConnected && serverHost != nil
    }

    /// Clean up resources
    func cleanup() {
        stop()
    }
}
