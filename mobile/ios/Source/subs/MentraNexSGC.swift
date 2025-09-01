//
//  MentraNexSGC.swift
//  MentraOS_Manager
//
//  Created by Gemini on 2024-07-29.
//

import Combine
import CoreBluetooth
import Foundation
import SwiftProtobuf
import UIKit

// MARK: - Connection State Management

enum MentraNexConnectionState {
    case disconnected
    case connecting
    case connected
}

// Helper extension for debugging
extension Data {
    func toHexString() -> String {
        return map { String(format: "%02x", $0) }.joined(separator: " ")
    }
}

@objc(MentraNexSGC)
class MentraNexSGC: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    @objc static func requiresMainQueueSetup() -> Bool { return true }

    // MARK: - Properties

    private var centralManager: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var _isScanning = false
    private var isConnecting = false
    private var nexReady = false
    private var isDisconnecting = false
    private var reconnectionTimer: Timer?
    private var reconnectionAttempts = 0
    // TODO: change this
    private let maxReconnectionAttempts = -1 // -1 for unlimited
    private let reconnectionInterval: TimeInterval = 5.0 // 5 seconds
    private var peripheralToConnectName: String?

    // Heartbeat tracking (like Java implementation)
    private var heartbeatCount = 0
    private var lastHeartbeatSentTime: TimeInterval = 0
    private var lastHeartbeatReceivedTime: TimeInterval = 0

    // Microphone beat system (like Java implementation)
    private var micBeatTimer: Timer?
    private var micBeatCount = 0
    private let MICBEAT_INTERVAL_MS: TimeInterval = 30 * 60 // 30 minutes like Java
    private var shouldUseGlassesMic = true
    private var microphoneStateBeforeDisconnection = false

    // Whitelist system (like Java implementation)
    private var whiteListedAlready = false
    private let WHITELIST_CMD: UInt8 = 0x04

    // Protobuf version tracking (like Java implementation)
    private var protobufVersionPosted = false

    // Device discovery cache (like MentraLive)
    private var discoveredPeripherals = [String: CBPeripheral]() // name -> peripheral

    // MARK: - Published Properties (G1-compatible)

    @Published var batteryLevel: Int = -1
    @Published var isCharging: Bool = false
    @Published var isHeadUp: Bool = false
    @Published var vadActive: Bool = false
    @Published var deviceReady: Bool = false

    // Audio properties (G1-compatible)
    @Published var compressedVoiceData: Data = .init()
    @Published var aiListening: Bool = false

    // Device info properties
    @Published var deviceFirmwareVersion: String = ""
    @Published var deviceHardwareModel: String = ""

    // IMU data properties
    @Published var accelerometer: [Float] = [0.0, 0.0, 0.0]
    @Published var gyroscope: [Float] = [0.0, 0.0, 0.0]
    @Published var magnetometer: [Float] = [0.0, 0.0, 0.0]

    // Button state properties
    @Published var lastButtonPressed: Int = -1
    @Published var lastButtonState: String = ""

    // Head gesture properties
    @Published var lastHeadGesture: String = ""
    @Published var headUpAngle: Int = 0

    // Enhanced device persistence (from Java implementation)
    private let PREFS_DEVICE_NAME = "MentraNexLastConnectedDeviceName"
    private let PREFS_DEVICE_ADDRESS = "MentraNexLastConnectedDeviceAddress"
    private let PREFS_DEVICE_ID = "SavedNexIdKey"
    private let SHARED_PREFS_NAME = "NexGlassesPrefs"

    // Device state tracking (ported from Java)
    private var savedDeviceName: String?
    private var savedDeviceAddress: String?
    private var preferredDeviceId: String?
    private var isKilled = false
    private var scanOnPowerOn = false

    private let bluetoothQueue = DispatchQueue(label: "MentraNexBluetooth", qos: .userInitiated)

    // Connection State Management (like MentraLive)
    private var _connectionState: MentraNexConnectionState = .disconnected
    var connectionState: MentraNexConnectionState {
        get { return _connectionState }
        set {
            let oldValue = _connectionState
            _connectionState = newValue
            if oldValue != newValue {
                onConnectionStateChanged?()
                Core.log("NEX: 🔄 Connection state changed: \(oldValue) -> \(newValue)")
            }
        }
    }

    var onConnectionStateChanged: (() -> Void)?

    private var peripheralUUID: UUID? {
        get {
            if let uuidString = UserDefaults.standard.string(forKey: "nexPeripheralUUID") {
                return UUID(uuidString: uuidString)
            }
            return nil
        }
        set {
            if let newValue = newValue {
                UserDefaults.standard.set(newValue.uuidString, forKey: "nexPeripheralUUID")
            } else {
                UserDefaults.standard.removeObject(forKey: "nexPeripheralUUID")
            }
        }
    }

    // Custom Bluetooth queue for better performance (like G1)
    private static let _bluetoothQueue = DispatchQueue(label: "com.mentra.nex.bluetooth", qos: .background)

    static var instance: MentraNexSGC?

    // MARK: - Singleton Access

    @objc static func getInstance() -> MentraNexSGC {
        if instance == nil {
            instance = MentraNexSGC()
        }
        return instance!
    }

    // UUIDs from MentraNexSGC.java
    private let MAIN_SERVICE_UUID = CBUUID(string: "00004860-0000-1000-8000-00805f9b34fb")
    private let WRITE_CHAR_UUID = CBUUID(string: "000071FF-0000-1000-8000-00805f9b34fb")
    private let NOTIFY_CHAR_UUID = CBUUID(string: "000070FF-0000-1000-8000-00805f9b34fb")

    // Packet types from MentraNexSGC.java
    private let PACKET_TYPE_JSON: UInt8 = 0x01
    private let PACKET_TYPE_PROTOBUF: UInt8 = 0x02
    private let PACKET_TYPE_AUDIO: UInt8 = 0xA0
    private let PACKET_TYPE_IMAGE: UInt8 = 0xB0

    // MTU Configuration (iOS-optimized)
    private let MTU_MAX_IOS = 185 // iOS maximum (platform limitation)
    private let MTU_DEFAULT = 23 // Default BLE MTU
    private var currentMTU = 23 // Currently negotiated MTU
    private var deviceMaxMTU = 23 // Device's maximum capability
    private var maxChunkSize = 176 // Calculated optimal chunk size
    private var bmpChunkSize = 176 // Image chunk size (iOS-optimized)

    // MARK: - Command Queue (modeled after ERG1Manager)

    private struct BufferedCommand {
        let chunks: [[UInt8]]
        let waitTimeMs: Int
        let chunkDelayMs: Int

        init(chunks: [[UInt8]], waitTimeMs: Int = 0, chunkDelayMs: Int = 8) {
            self.chunks = chunks
            self.waitTimeMs = waitTimeMs
            self.chunkDelayMs = chunkDelayMs
        }
    }

    private actor CommandQueue {
        private var commands: [BufferedCommand] = []
        private var continuations: [CheckedContinuation<BufferedCommand, Never>] = []

        func enqueue(_ command: BufferedCommand) {
            if let continuation = continuations.first {
                continuations.removeFirst()
                continuation.resume(returning: command)
            } else {
                commands.append(command)
            }
        }

        func dequeue() async -> BufferedCommand {
            if let command = commands.first {
                commands.removeFirst()
                return command
            }

            return await withCheckedContinuation { continuation in
                continuations.append(continuation)
            }
        }
    }

    private let commandQueue = CommandQueue()
    private var isQueueWorkerRunning = false

    // MARK: - Initialization

    override private init() {
        super.init()
        Core.log("NEX: 🚀 MentraNexSGC initialization started")

        // Load saved device information (from Java implementation)
        loadSavedDeviceInfo()

        // Using custom Bluetooth queue for better performance (like G1)
        Core.log("NEX: 📱 Creating CBCentralManager with custom Bluetooth queue")
        centralManager = CBCentralManager(delegate: self, queue: MentraNexSGC._bluetoothQueue)

        Core.log("NEX: ✅ MentraNexSGC initialization completed")
        Core.log("NEX: 📱 Central Manager created: \(centralManager != nil ? "YES" : "NO")")
        if let centralManager = centralManager {
            Core.log("NEX: 📱 Initial Bluetooth State: \(centralManager.state.rawValue)")
        }

        Core.log("NEX: 💾 Loaded saved device - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None")")
    }

    private func setupCommandQueue() {
        if isQueueWorkerRunning { return }
        isQueueWorkerRunning = true

        Task.detached { [weak self] in
            guard let self = self else { return }
            while true {
                let command = await self.commandQueue.dequeue()
                await self.processCommand(command)
            }
        }
    }

    private func queueChunks(_ chunks: [[UInt8]], waitTimeMs: Int = 0, chunkDelayMs: Int = 8) {
        let cmd = BufferedCommand(chunks: chunks, waitTimeMs: waitTimeMs, chunkDelayMs: chunkDelayMs)
        Task { [weak self] in
            await self?.commandQueue.enqueue(cmd)
        }
    }

    // Enhanced method that uses MTU-optimized chunking
    private func queueDataWithOptimalChunking(_ data: Data, packetType: UInt8 = 0x02, waitTimeMs: Int = 0) {
        var chunks: [[UInt8]] = []
        let effectiveChunkSize = maxChunkSize - 1 // Reserve 1 byte for packet type

        // Add packet type as first byte
        var packetData = Data([packetType])
        packetData.append(data)

        // Split into MTU-optimized chunks
        var offset = 0
        while offset < packetData.count {
            let chunkSize = min(effectiveChunkSize, packetData.count - offset)
            let chunkData = packetData.subdata(in: offset ..< (offset + chunkSize))
            chunks.append(Array(chunkData))
            offset += chunkSize
        }

        Core.log("NEX: 📦 Created \(chunks.count) MTU-optimized chunks (max size: \(effectiveChunkSize) bytes)")
        queueChunks(chunks, waitTimeMs: waitTimeMs)
    }

    // Helper method for queueing chunks with optional wait time
    private func queueChunks(_ chunks: [[UInt8]], waitTimeMs: Int = 0) {
        let cmd = BufferedCommand(chunks: chunks, waitTimeMs: waitTimeMs, chunkDelayMs: 8)
        Task { [weak self] in
            await self?.commandQueue.enqueue(cmd)
        }
    }

    private func processCommand(_ command: BufferedCommand) async {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            Core.log("NEX: ⚠️ processCommand: peripheral/characteristic not ready")
            return
        }

        // Send each chunk sequentially
        for (index, chunk) in command.chunks.enumerated() {
            let data = Data(chunk)
            Core.log("NEX: 📦 Sending chunk \(index) of \(command.chunks.count) to \(peripheral.name ?? "Unknown")")
            Core.log("NEX: 📦 Chunk data: \(data.toHexString())")
            peripheral.writeValue(data, for: writeCharacteristic, type: .withResponse)

            // Delay between chunks except maybe after the last chunk if waitTime will handle it
            if index < command.chunks.count - 1 {
                try? await Task.sleep(nanoseconds: UInt64(command.chunkDelayMs) * 1_000_000)
            }
        }

        // Optional wait after the command
        if command.waitTimeMs > 0 {
            try? await Task.sleep(nanoseconds: UInt64(command.waitTimeMs) * 1_000_000)
        }
    }

    // MARK: - Device Persistence (ported from Java)

    private func loadSavedDeviceInfo() {
        savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME)
        savedDeviceAddress = UserDefaults.standard.string(forKey: PREFS_DEVICE_ADDRESS)
        preferredDeviceId = UserDefaults.standard.string(forKey: PREFS_DEVICE_ID)

        Core.log("NEX: 💾 Loaded device info - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None"), ID: \(preferredDeviceId ?? "None")")
    }

    private func savePairedDeviceInfo(name: String?, address: String?) {
        if let name = name {
            UserDefaults.standard.set(name, forKey: PREFS_DEVICE_NAME)
            savedDeviceName = name
            Core.log("NEX: 💾 Saved device name: \(name)")
        }

        if let address = address {
            UserDefaults.standard.set(address, forKey: PREFS_DEVICE_ADDRESS)
            savedDeviceAddress = address
            Core.log("NEX: 💾 Saved device address: \(address)")
        }
    }

    @objc func savePreferredDeviceId(_ deviceId: String) {
        UserDefaults.standard.set(deviceId, forKey: PREFS_DEVICE_ID)
        preferredDeviceId = deviceId
        Core.log("NEX: 💾 Saved preferred device ID: \(deviceId)")
    }

    @objc func clearSavedDeviceInfo() {
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_NAME)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ADDRESS)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ID)

        savedDeviceName = nil
        savedDeviceAddress = nil
        preferredDeviceId = nil
        peripheralUUID = nil

        Core.log("NEX: 🗑️ Cleared all saved device information")
    }

    // MARK: - Enhanced Device Filtering (ported from Java)

    private func isCompatibleNexDevice(_ deviceName: String) -> Bool {
        // Enhanced filtering logic from Java implementation
        let compatiblePrefixes = [
            "NexSim",
            // "MENTRA",
            // "NEX",
            // "Nex",
            // "MentraNex",
            // "MENTRA_NEX",
            // "Xy_A", // Legacy support
            // "XyBLE_", // Legacy support
            // "MENTRA_LIVE", // Cross-compatibility
        ]

        for prefix in compatiblePrefixes {
            if deviceName.hasPrefix(prefix) || deviceName.contains(prefix) {
                Core.log("NEX: ✅ Device '\(deviceName)' matches compatible prefix: \(prefix)")
                return true
            }
        }

        return false
    }

    private func extractDeviceId(from deviceName: String) -> String? {
        // Extract device ID pattern similar to Java implementation
        let patterns = [
            "Mentra_([0-9A-Fa-f]+)",
            "NEX_([0-9A-Fa-f]+)",
            "MENTRA_NEX_([0-9A-Fa-f]+)",
        ]

        for pattern in patterns {
            let regex = try? NSRegularExpression(pattern: pattern)
            let range = NSRange(deviceName.startIndex ..< deviceName.endIndex, in: deviceName)
            if let match = regex?.firstMatch(in: deviceName, options: [], range: range),
               let matchRange = Range(match.range(at: 1), in: deviceName)
            {
                let deviceId = String(deviceName[matchRange])
                Core.log("NEX: 🏷️ Extracted device ID: \(deviceId) from \(deviceName)")
                return deviceId
            }
        }

        Core.log("NEX: ⚠️ Could not extract device ID from: \(deviceName)")
        return nil
    }

    // MARK: - Connection Logic (enhanced from G1)

    @objc(connectByName:)
    func connect(name: String) {
        Core.log("NEX-CONN: 🔗 connect(name:) called with \(name)")
        if _isScanning {
            stopScan()
        }
        peripheralToConnectName = name
        startScan()
    }

    private func connectByUUID() -> Bool {
        guard let uuid = peripheralUUID else {
            Core.log("NEX-CONN: 🔵 No stored UUID to connect by.")
            return false
        }

        guard let centralManager = centralManager else {
            Core.log("NEX-CONN: ❌ Central Manager is nil, cannot connect by UUID.")
            return false
        }

        Core.log("NEX-CONN: 🔵 Attempting to retrieve peripheral with stored UUID: \(uuid.uuidString)")
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])

        if let peripheralToConnect = peripherals.first {
            Core.log("NEX-CONN: 🔵 Found peripheral by UUID: \(peripheralToConnect.name ?? "Unknown"). Initiating connection.")
            peripheral = peripheralToConnect
            centralManager.connect(peripheralToConnect, options: nil)
            return true
        } else {
            Core.log("NEX-CONN: 🔵 Could not find peripheral for stored UUID. Will proceed to scan.")
            return false
        }
    }

    private func startReconnectionTimer() {
        Core.log("NEX-CONN: 🔄 Starting reconnection timer...")
        stopReconnectionTimer() // Ensure no existing timer is running
        reconnectionAttempts = 0

        DispatchQueue.main.async {
            self.reconnectionTimer = Timer.scheduledTimer(
                timeInterval: self.reconnectionInterval,
                target: self,
                selector: #selector(self.attemptReconnection),
                userInfo: nil,
                repeats: true
            )
        }
    }

    private func stopReconnectionTimer() {
        if reconnectionTimer != nil {
            Core.log("NEX-CONN: 🛑 Stopping reconnection timer.")
            reconnectionTimer?.invalidate()
            reconnectionTimer = nil
        }
    }

    @objc private func attemptReconnection() {
        if nexReady {
            Core.log("NEX-CONN: ✅ Already connected, stopping reconnection attempts.")
            stopReconnectionTimer()
            return
        }

        if maxReconnectionAttempts != -1, reconnectionAttempts >= maxReconnectionAttempts {
            Core.log("NEX-CONN: ❌ Max reconnection attempts reached.")
            stopReconnectionTimer()
            return
        }

        reconnectionAttempts += 1
        Core.log("NEX-CONN: 🔄 Attempting reconnection (\(reconnectionAttempts))...")
        startScan()
    }

    // MARK: - Public Methods

    private func startScan() {
        Core.log("NEX-CONN: 🔍 startScan called")

        isDisconnecting = false // Reset intentional disconnect flag

        guard let centralManager = centralManager else {
            Core.log("NEX-CONN: ❌ Central Manager is nil!")
            return
        }

        guard centralManager.state == .poweredOn else {
            Core.log("NEX-CONN: ❌ Bluetooth not powered on. State: \(centralManager.state.rawValue)")
            return
        }

        // First, try to reconnect using stored UUID (faster and works in background)
        if connectByUUID() {
            Core.log("NEX-CONN: 🔄 Attempting connection with stored UUID. Halting scan.")
            return
        }

        // If that fails, check for already-connected system devices
        let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [MAIN_SERVICE_UUID])
        if let targetName = peripheralToConnectName, let existingPeripheral = connectedPeripherals.first(where: { $0.name?.contains(targetName) == true }) {
            Core.log("NEX-CONN: 📱 Found already connected peripheral that matches target: \(existingPeripheral.name ?? "Unknown")")
            if peripheral == nil {
                peripheral = existingPeripheral
                centralManager.connect(existingPeripheral, options: nil)
                return
            }
        }

        // Check if we have a saved device name to reconnect to (like MentraLive)
        if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
            Core.log("NEX-CONN: 🔄 Looking for saved device: \(savedDeviceName)")
            // This will be handled in didDiscover when the device is found
        }

        Core.log("NEX-CONN: ✅ Bluetooth is powered on, starting scan...")
        _isScanning = true

        // Scan for ALL devices, not just those with specific services
        // Use same options as G1 scanner for consistency
        let scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false, // Don't allow duplicate advertisements
        ]
        centralManager.scanForPeripherals(withServices: nil, options: scanOptions)

        Core.log("NEX-CONN: 🚀 Scan started successfully")

        // Re-emit already discovered peripherals (like MentraLive)
        for (_, peripheral) in discoveredPeripherals {
            Core.log("NEX-CONN: 📡 (Re-emitting from cache) peripheral: \(peripheral.name ?? "Unknown")")
            if let name = peripheral.name {
                emitDiscoveredDevice(name)
            }
        }

        // No auto-stop timer (like G1) - manual control
        Core.log("NEX-CONN: 💡 To stop scanning manually, call: MentraNexSGC.shared.stopScan()")
    }

    @objc func stopScan() {
        centralManager?.stopScan()
        _isScanning = false
        Core.log("NEX-CONN: 🛑 Stopped scanning.")
    }

    @objc func isScanning() -> Bool {
        return _isScanning
    }

    @objc func isConnected() -> Bool {
        return nexReady && connectionState == .connected
    }

    @objc func getConnectionState() -> String {
        switch connectionState {
        case .disconnected:
            return "disconnected"
        case .connecting:
            return "connecting"
        case .connected:
            return "connected"
        }
    }

    // MARK: - MTU Information Access

    @objc func getCurrentMTU() -> Int {
        return currentMTU
    }

    @objc func getMaxChunkSize() -> Int {
        return maxChunkSize
    }

    @objc func getDeviceMaxMTU() -> Int {
        return deviceMaxMTU
    }

    @objc func getMTUInfo() -> [String: Any] {
        return [
            "current_mtu": currentMTU,
            "device_max_mtu": deviceMaxMTU,
            "max_chunk_size": maxChunkSize,
            "bmp_chunk_size": bmpChunkSize,
            "mtu_negotiated": nexReady,
        ]
    }

    @objc func findCompatibleDevices() {
        Core.log("NEX-DISCOVERY: Finding compatible devices. Clearing connection targets.")

        // Clear any specific device targets to ensure we are only discovering
        peripheralToConnectName = nil
        clearSavedDeviceInfo() // This clears UserDefaults and our in-memory cache of saved/preferred devices.

        Task {
            if centralManager == nil {
                centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
                // wait for the central manager to be fully initialized before we start scanning:
                try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            }

            if centralManager?.state == .poweredOn {
                startScan()
            } else {
                Core.log("NEX-DISCOVERY: Bluetooth not ready, will scan on power on.")
                scanOnPowerOn = true
            }
        }
    }

    func sendTextWall(_ text: String) {
        guard nexReady else {
            Core.log("NEX: Not ready to display text. Device not initialized.")
            return
        }

        Core.log("NEX: Displaying text wall: '\(text)'")

        let displayText = Mentraos_Ble_DisplayText.with {
            $0.text = text
            $0.size = 48
            $0.x = 20
            $0.y = 260
            $0.color = 10000
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.displayText = displayText
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func displayTextLine(_ text: String) {
        sendTextWall(text)
    }

    @objc func displayDoubleTextWall(_ textTop: String, textBottom: String) {
        let combinedText = "\(textTop)\n\n\(textBottom)"
        sendTextWall(combinedText)
    }

    @objc func displayReferenceCardSimple(_ title: String, body: String) {
        let combinedText = "\(title)\n\n\(body)"
        sendTextWall(combinedText)
    }

    @objc func displayRowsCard(_ rowStrings: [String]) {
        let combinedText = rowStrings.joined(separator: "\n")
        sendTextWall(combinedText)
    }

    @objc func displayBulletList(_ title: String, bullets: [String]) {
        var text = title
        if !title.isEmpty {
            text += "\n"
        }
        text += bullets.map { "• \($0)" }.joined(separator: "\n")
        sendTextWall(text)
    }

    @objc func displayScrollingText(_ text: String) {
        guard nexReady else {
            Core.log("NEX: Not ready to display scrolling text. Device not initialized.")
            return
        }

        Core.log("NEX: Displaying scrolling text: '\(text)'")

        let displayScrollingText = Mentraos_Ble_DisplayScrollingText.with {
            $0.text = text
            $0.size = 48
            $0.x = 20
            $0.y = 50
            $0.width = 200
            $0.height = 100
            $0.speed = 50
            $0.pauseMs = 10
            $0.loop = true
            $0.align = .center
            $0.lineSpacing = 2
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.displayScrollingText = displayScrollingText
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    // MARK: - Display Image Commands

    @objc func displayBitmap(_ bitmap: UIImage) {
        guard nexReady else {
            Core.log("NEX: Not ready to display bitmap. Device not initialized.")
            return
        }

        Core.log("NEX: Displaying bitmap image")

        // Convert UIImage to raw bitmap data
        guard let bmpData = convertUIImageToBmpData(bitmap) else {
            Core.log("NEX: Failed to convert UIImage to BMP data")
            return
        }

        displayBitmapData(bmpData, width: Int(bitmap.size.width), height: Int(bitmap.size.height))
    }

    @objc func displayBitmapFromData(_ bmpData: Data, width: Int, height: Int) {
        displayBitmapData(bmpData, width: width, height: height)
    }

    private func displayBitmapData(_ bmpData: Data, width: Int, height: Int) {
        guard nexReady else {
            Core.log("NEX: Not ready to display bitmap data. Device not initialized.")
            return
        }

        Core.log("NEX: Displaying bitmap data (\(bmpData.count) bytes, \(width)x\(height))")

        // Generate stream ID for image transfer
        let streamId = String(format: "%04X", Int.random(in: 0 ... 0xFFFF))
        let totalChunks = Int(ceil(Double(bmpData.count) / Double(bmpChunkSize)))

        // Send display image command first
        let displayImage = Mentraos_Ble_DisplayImage.with {
            $0.streamID = streamId
            $0.totalChunks = UInt32(totalChunks)
            $0.x = 0
            $0.y = 0
            $0.width = UInt32(width)
            $0.height = UInt32(height)
            $0.encoding = "raw"
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.msgID = "img_start_1"
            $0.displayImage = displayImage
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF, waitTimeMs: 100)

        // Send image chunks
        sendImageChunks(streamId: streamId, imageData: bmpData)
    }

    private func sendImageChunks(streamId: String, imageData: Data) {
        let streamIdInt = Int(streamId, radix: 16) ?? 0
        let totalChunks = Int(ceil(Double(imageData.count) / Double(bmpChunkSize)))

        var chunks: [[UInt8]] = []

        for i in 0 ..< totalChunks {
            let start = i * bmpChunkSize
            let end = min(start + bmpChunkSize, imageData.count)
            let chunkData = imageData.subdata(in: start ..< end)

            var header: [UInt8] = [
                PACKET_TYPE_IMAGE, // 0xB0
                UInt8((streamIdInt >> 8) & 0xFF), // Stream ID high byte
                UInt8(streamIdInt & 0xFF), // Stream ID low byte
                UInt8(i & 0xFF), // Chunk index
            ]
            header.append(contentsOf: chunkData)
            chunks.append(header)
        }

        Core.log("NEX: Sending \(chunks.count) image chunks")
        queueChunks(chunks, waitTimeMs: 50)
    }

    private func convertUIImageToBmpData(_ image: UIImage) -> Data? {
        // This is a simplified conversion - in production you'd want proper BMP encoding
        guard let cgImage = image.cgImage else { return nil }

        let width = cgImage.width
        let height = cgImage.height
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let bitsPerComponent = 8

        var pixelData = Data(count: width * height * bytesPerPixel)

        pixelData.withUnsafeMutableBytes { bytes in
            guard let context = CGContext(
                data: bytes.bindMemory(to: UInt8.self).baseAddress,
                width: width,
                height: height,
                bitsPerComponent: bitsPerComponent,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return }

            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }

        return pixelData
    }

    // MARK: - Display Control Commands

    @objc func clearDisplay() {
        guard nexReady else {
            Core.log("NEX: Not ready to clear display. Device not initialized.")
            return
        }

        Core.log("NEX: Clearing display")

        let clearDisplay = Mentraos_Ble_ClearDisplay()

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.msgID = "clear_disp_001"
            $0.clearDisplay_p = clearDisplay
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func blankScreen() {
        clearDisplay()
    }

    @objc func showHomeScreen() {
        Core.log("NEX: Showing home screen")
        clearDisplay()

        // Send a simple home screen text
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.sendTextWall("MentraOS Ready")
        }
    }

    @objc func exitAllFunctions() {
        guard nexReady else {
            Core.log("NEX: Not ready to exit functions. Device not initialized.")
            return
        }

        Core.log("NEX: Exiting all functions")

        // Send exit command (0x18 from Android implementation)
        let exitCommand: [UInt8] = [0x18]
        queueChunks([exitCommand], waitTimeMs: 100)
    }

    // MARK: - Configuration Commands

    @objc func updateGlassesBrightness(_ brightness: Int) {
        guard nexReady else {
            Core.log("NEX: Not ready to update brightness. Device not initialized.")
            return
        }

        // Validate brightness range (0-100)
        let validBrightness = max(0, min(100, brightness))
        Core.log("NEX: Setting brightness to \(validBrightness)%")

        let brightnessConfig = Mentraos_Ble_BrightnessConfig.with {
            $0.value = UInt32(validBrightness)
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.brightness = brightnessConfig
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func updateGlassesAutoBrightness(_ enabled: Bool) {
        guard nexReady else {
            Core.log("NEX: Not ready to update auto brightness. Device not initialized.")
            return
        }

        Core.log("NEX: Setting auto brightness to \(enabled)")

        let autoBrightnessConfig = Mentraos_Ble_AutoBrightnessConfig.with {
            $0.enabled = enabled
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.autoBrightness = autoBrightnessConfig
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func updateGlassesHeadUpAngle(_ angle: Int) {
        guard nexReady else {
            Core.log("NEX: Not ready to update head-up angle. Device not initialized.")
            return
        }

        // Validate angle range (0-60 degrees)
        let validAngle = max(0, min(60, angle))
        Core.log("NEX: Setting head-up angle to \(validAngle) degrees")

        let headUpAngleConfig = Mentraos_Ble_HeadUpAngleConfig.with {
            $0.angle = UInt32(validAngle)
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.headUpAngle = headUpAngleConfig
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func updateGlassesDisplayHeight(_ height: Int) {
        guard nexReady else {
            Core.log("NEX: Not ready to update display height. Device not initialized.")
            return
        }

        // Validate height range (0-8)
        let validHeight = max(0, min(8, height))
        Core.log("NEX: Setting display height to \(validHeight)")

        let displayHeightConfig = Mentraos_Ble_DisplayHeightConfig.with {
            $0.height = UInt32(validHeight)
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.displayHeight = displayHeightConfig
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func setMicrophoneEnabled(_ enabled: Bool) {
        guard nexReady else {
            Core.log("NEX: Not ready to set microphone state. Device not initialized.")
            return
        }

        Core.log("NEX: Setting microphone enabled: \(enabled)")

        let micStateConfig = Mentraos_Ble_MicStateConfig.with {
            $0.enabled = enabled
        }

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.micState = micStateConfig
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)

        // Update aiListening state when microphone state changes (G1-compatible)
        if enabled, !vadActive {
            // Only set aiListening if VAD isn't already controlling it
            aiListening = enabled
        }
    }

    // G1-compatible alias for microphone control
    func setMicEnabled(enabled: Bool) async -> Bool {
        setMicrophoneEnabled(enabled)
        return true
    }

    // MARK: - Status Query Commands

    @objc func queryBatteryStatus() {
        guard nexReady else {
            Core.log("NEX: Not ready to query battery status. Device not initialized.")
            return
        }

        Core.log("NEX: Querying battery status")

        let batteryStateRequest = Mentraos_Ble_BatteryStateRequest()

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.batteryState = batteryStateRequest
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    @objc func queryGlassesInfo() {
        guard nexReady else {
            Core.log("NEX: Not ready to query glasses info. Device not initialized.")
            return
        }

        Core.log("NEX: Querying glasses information")

        let glassesInfoRequest = Mentraos_Ble_GlassesInfoRequest()

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.glassesInfo = glassesInfoRequest
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)
    }

    // MARK: - Utility Methods

    @objc func sendPongResponse() {
        guard nexReady else {
            Core.log("NEX: Not ready to send pong. Device not initialized.")
            return
        }

        let timestamp = Date().timeIntervalSince1970 * 1000
        Core.log("NEX: Sending pong response (Time: \(timestamp))")

        let pongResponse = Mentraos_Ble_PongResponse()

        let phoneToGlasses = Mentraos_Ble_PhoneToGlasses.with {
            $0.pong = pongResponse
        }

        let protobufData = try! phoneToGlasses.serializedData()
        queueDataWithOptimalChunking(protobufData, packetType: PACKET_TYPE_PROTOBUF)

        // Notify about heartbeat sent (pong response)
        notifyHeartbeatSent(timestamp)
    }

    @objc func isDeviceReady() -> Bool {
        return nexReady && connectionState == .connected
    }

    @objc func getDeviceInfo() -> [String: Any] {
        return [
            "device_ready": nexReady,
            "connection_state": getConnectionState(),
            "current_mtu": currentMTU,
            "device_max_mtu": deviceMaxMTU,
            "max_chunk_size": maxChunkSize,
            "bmp_chunk_size": bmpChunkSize,
            "device_name": peripheral?.name ?? "Unknown",
            "device_id": peripheral?.identifier.uuidString ?? "Unknown",
        ]
    }

    // MARK: - Advanced Display Methods

    @objc func displayCustomContent(_ content: String) {
        // For now, treat custom content as regular text
        sendTextWall(content)
    }

    @objc func setUpdatingScreen(_ updating: Bool) {
        Core.log("NEX: Set updating screen: \(updating)")
        // This could be used to prevent display updates during certain operations
        // Implementation depends on specific requirements
    }

    // MARK: - Data Processing and Event Listeners

    private func processReceivedData(_ data: Data) {
        guard data.count > 0 else { return }

        let packetType = data[0]
        Core.log("NEX: Processing packet type: 0x\(String(format: "%02X", packetType))")

        switch packetType {
        case PACKET_TYPE_JSON:
            if data.count > 1 {
                let jsonData = data.subdata(in: 1 ..< data.count)
                processJsonData(jsonData)
            }

        case PACKET_TYPE_PROTOBUF:
            if data.count > 1 {
                let protobufData = data.subdata(in: 1 ..< data.count)
                processProtobufData(protobufData)
            }

        case PACKET_TYPE_AUDIO:
            if data.count > 2 {
                let sequenceNumber = data[1]
                let audioData = data.subdata(in: 2 ..< data.count)
                processAudioData(audioData, sequenceNumber: sequenceNumber)
            }

        case PACKET_TYPE_IMAGE:
            processImageData(data)

        default:
            Core.log("NEX: Unknown packet type: 0x\(String(format: "%02X", packetType))")
        }
    }

    private func processJsonData(_ jsonData: Data) {
        guard let jsonString = String(data: jsonData, encoding: .utf8) else {
            Core.log("NEX: Failed to decode JSON data")
            return
        }

        Core.log("NEX: Processing JSON: \(jsonString)")

        do {
            guard let json = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let type = json["type"] as? String
            else {
                return
            }

            switch type {
            case "battery_status":
                handleBatteryStatusJson(json)
            case "device_info":
                handleDeviceInfoJson(json)
            case "button_event":
                handleButtonEventJson(json)
            case "ping":
                handlePingJson(json)
            case "vad_event":
                handleVadEventJson(json)
            case "imu_data":
                handleImuDataJson(json)
            case "head_gesture":
                handleHeadGestureJson(json)
            default:
                Core.log("NEX: Unhandled JSON type: \(type)")
            }
        } catch {
            Core.log("NEX: Error parsing JSON: \(error)")
        }
    }

    private func processProtobufData(_ protobufData: Data) {
        do {
            let glassesToPhone = try Mentraos_Ble_GlassesToPhone(serializedData: protobufData)
            Core.log("NEX: Processing protobuf payload case: \(glassesToPhone.payload)")

            switch glassesToPhone.payload {
            case let .batteryStatus(batteryStatus):
                handleBatteryStatusProtobuf(batteryStatus)

            case let .chargingState(chargingState):
                handleChargingStateProtobuf(chargingState)

            case let .deviceInfo(deviceInfo):
                handleDeviceInfoProtobuf(deviceInfo)

            case let .headPosition(headPosition):
                handleHeadPositionProtobuf(headPosition)

            case let .headUpAngleSet(headUpAngleResponse):
                handleHeadUpAngleResponseProtobuf(headUpAngleResponse)

            case let .ping(pingRequest):
                handlePingProtobuf(pingRequest)

            case let .vadEvent(vadEvent):
                handleVadEventProtobuf(vadEvent)

            case let .imageTransferComplete(transferComplete):
                handleImageTransferCompleteProtobuf(transferComplete)

            case let .imuData(imuData):
                handleImuDataProtobuf(imuData)

            case let .buttonEvent(buttonEvent):
                handleButtonEventProtobuf(buttonEvent)

            case let .headGesture(headGesture):
                handleHeadGestureProtobuf(headGesture)

            // Note: VersionResponse not available in current protobuf structure

            case .none:
                Core.log("NEX: Protobuf payload not set")

            default:
                Core.log("NEX: Unhandled protobuf payload type")
            }

        } catch {
            Core.log("NEX: Error parsing protobuf data: \(error)")
        }
    }

    private func processAudioData(_ audioData: Data, sequenceNumber: UInt8) {
        Core.log("NEX: Received audio data - sequence: \(sequenceNumber), size: \(audioData.count) bytes")

        // Update @Published property (G1-compatible approach)
        // Create packet with sequence number prefix like G1 expects
        var packetData = Data()
        packetData.append(sequenceNumber)
        packetData.append(audioData)

        compressedVoiceData = packetData
    }

    private func processImageData(_ imageData: Data) {
        Core.log("NEX: Received image data: \(imageData.count) bytes")
        // Image data processing can be implemented based on specific requirements
    }

    // MARK: - Protobuf Event Handlers

    private func handleBatteryStatusProtobuf(_ batteryStatus: Mentraos_Ble_BatteryStatus) {
        let level = Int(batteryStatus.level)
        let charging = batteryStatus.charging

        Core.log("NEX: 🔋 Battery Status - Level: \(level)%, Charging: \(charging)")

        // Update @Published properties (G1-compatible approach)
        batteryLevel = level
        isCharging = charging
    }

    private func handleChargingStateProtobuf(_ chargingState: Mentraos_Ble_ChargingState) {
        let chargingState = chargingState.state == .charging

        Core.log("NEX: 🔌 Charging State: \(chargingState ? "CHARGING" : "NOT_CHARGING")")

        // Update @Published property (G1-compatible approach)
        isCharging = chargingState
    }

    private func handleDeviceInfoProtobuf(_ deviceInfo: Mentraos_Ble_DeviceInfo) {
        Core.log("NEX: 📱 Device Info: \(deviceInfo)")

        // Update @Published properties (G1-compatible approach)
        deviceFirmwareVersion = deviceInfo.fwVersion
        deviceHardwareModel = deviceInfo.hwModel
    }

    private func handleHeadPositionProtobuf(_ headPosition: Mentraos_Ble_HeadPosition) {
        let angle = Int(headPosition.angle)

        Core.log("NEX: 📐 Head Position - Angle: \(angle)°")

        // Update @Published property (G1-compatible approach)
        headUpAngle = angle
    }

    private func handleHeadUpAngleResponseProtobuf(_ response: Mentraos_Ble_HeadUpAngleResponse) {
        let success = response.success

        Core.log("NEX: 📐 Head Up Angle Set Response - Success: \(success)")

        // Emit response event
        let eventBody: [String: Any] = [
            "head_up_angle_set_result": success,
            "device_model": "Mentra Nex",
            "timestamp": Date().timeIntervalSince1970 * 1000,
        ]

        emitEvent("HeadUpAngleResponseEvent", body: eventBody)
    }

    private func handlePingProtobuf(_: Mentraos_Ble_PingRequest) {
        let timestamp = Date().timeIntervalSince1970 * 1000

        Core.log("NEX: 💓 Received PING from glasses (Time: \(timestamp))")

        // Automatically send pong response
        sendPongResponse()

        // Emit heartbeat received event
        let eventBody: [String: Any] = [
            "heartbeat_received": [
                "timestamp": timestamp,
                "device_model": "Mentra Nex",
            ],
        ]

        emitEvent("HeartbeatReceivedEvent", body: eventBody)

        // Query battery status periodically (every 10 pings like Java implementation)
        heartbeatCount += 1
        if heartbeatCount % 10 == 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.queryBatteryStatus()
            }
        }
    }

    private func handleVadEventProtobuf(_ vadEvent: Mentraos_Ble_VadEvent) {
        let vadActiveState = vadEvent.state == .active

        Core.log("NEX: 🎤 VAD Event - Voice Activity: \(vadActiveState)")

        // Update @Published properties (G1-compatible approach)
        vadActive = vadActiveState
        aiListening = vadActiveState // Mirror G1's aiListening behavior
    }

    private func handleImageTransferCompleteProtobuf(_ transferComplete: Mentraos_Ble_ImageTransferComplete) {
        let status = transferComplete.status
        let missingChunks = transferComplete.missingChunks

        Core.log("NEX: 🖼️ Image Transfer Complete - Status: \(status)")

        switch status {
        case .ok:
            Core.log("NEX: Image transfer completed successfully")
            // Clear any pending image chunks

        case .incomplete:
            Core.log("NEX: Image transfer incomplete - Missing chunks: \(missingChunks)")
            // Could implement chunk retransmission here

        default:
            Core.log("NEX: Unknown image transfer status")
        }

        // Emit image transfer complete event
        let eventBody: [String: Any] = [
            "image_transfer_complete": [
                "status": status == .ok ? "success" : "incomplete",
                "missing_chunks": missingChunks,
                "timestamp": Date().timeIntervalSince1970 * 1000,
            ],
        ]

        emitEvent("ImageTransferCompleteEvent", body: eventBody)
    }

    private func handleImuDataProtobuf(_ imuData: Mentraos_Ble_ImuData) {
        Core.log("NEX: 📊 IMU Data: \(imuData)")

        // Update @Published properties (G1-compatible approach)
        accelerometer = [imuData.accel.x, imuData.accel.y, imuData.accel.z]
        gyroscope = [imuData.gyro.x, imuData.gyro.y, imuData.gyro.z]
        magnetometer = [imuData.mag.x, imuData.mag.y, imuData.mag.z]
    }

    private func handleButtonEventProtobuf(_ buttonEvent: Mentraos_Ble_ButtonEvent) {
        let buttonNumber = Int(buttonEvent.button.rawValue)
        let buttonState = buttonEvent.state

        Core.log("NEX: 🔘 Button Event - Button: \(buttonNumber), State: \(buttonState)")

        // Update @Published properties (G1-compatible approach)
        lastButtonPressed = buttonNumber
        lastButtonState = "\(buttonState.rawValue)"
    }

    private func handleHeadGestureProtobuf(_ headGesture: Mentraos_Ble_HeadGesture) {
        let gestureType = headGesture.gesture

        Core.log("NEX: 👤 Head Gesture: \(gestureType)")

        // Update @Published properties (G1-compatible approach)
        switch gestureType {
        case .headUp:
            isHeadUp = true
            lastHeadGesture = "headUp"
        case .nod:
            lastHeadGesture = "nod"
        case .shake:
            lastHeadGesture = "shake"
        default:
            Core.log("NEX: Unknown head gesture type: \(gestureType)")
            lastHeadGesture = "unknown"
        }
    }

    // MARK: - JSON Event Handlers

    private func handleBatteryStatusJson(_ json: [String: Any]) {
        let level = json["level"] as? Int ?? -1
        let charging = json["charging"] as? Bool ?? false

        Core.log("NEX: 🔋 JSON Battery Status - Level: \(level)%, Charging: \(charging)")

        // Update @Published properties (G1-compatible approach)
        batteryLevel = level
        isCharging = charging
    }

    private func handleDeviceInfoJson(_ json: [String: Any]) {
        Core.log("NEX: 📱 JSON Device Info: \(json)")

        let eventBody: [String: Any] = [
            "device_info": json,
            "timestamp": Date().timeIntervalSince1970 * 1000,
        ]

        emitEvent("DeviceInfoEvent", body: eventBody)
    }

    private func handleButtonEventJson(_ json: [String: Any]) {
        let buttonId = json["button_id"] as? String ?? "unknown"
        let pressType = json["press_type"] as? String ?? "short"

        Core.log("NEX: 🔘 JSON Button Event - Button: \(buttonId), Type: \(pressType)")

        let eventBody: [String: Any] = [
            "button_press": [
                "device_model": "Mentra Nex",
                "button_id": buttonId,
                "press_type": pressType,
                "timestamp": Date().timeIntervalSince1970 * 1000,
            ],
        ]

        emitEvent("ButtonPressEvent", body: eventBody)
    }

    private func handlePingJson(_: [String: Any]) {
        let timestamp = Date().timeIntervalSince1970 * 1000

        Core.log("NEX: 💓 JSON PING received (Time: \(timestamp))")

        // Send pong response
        sendPongResponse()

        // Emit heartbeat received event
        let eventBody: [String: Any] = [
            "heartbeat_received": [
                "timestamp": timestamp,
                "device_model": "Mentra Nex",
            ],
        ]

        emitEvent("HeartbeatReceivedEvent", body: eventBody)
    }

    private func handleVadEventJson(_ json: [String: Any]) {
        let vadActiveState = json["vad"] as? Bool ?? false

        Core.log("NEX: 🎤 JSON VAD Event - Voice Activity: \(vadActiveState)")

        // Update @Published properties (G1-compatible approach)
        vadActive = vadActiveState
        aiListening = vadActiveState // Mirror G1's aiListening behavior
    }

    private func handleImuDataJson(_ json: [String: Any]) {
        Core.log("NEX: 📊 JSON IMU Data: \(json)")

        let eventBody: [String: Any] = [
            "imu_data": json,
            "timestamp": Date().timeIntervalSince1970 * 1000,
        ]

        emitEvent("ImuDataEvent", body: eventBody)
    }

    private func handleHeadGestureJson(_ json: [String: Any]) {
        let gesture = json["gesture"] as? String ?? "unknown"

        Core.log("NEX: 👤 JSON Head Gesture: \(gesture)")

        let eventBody: [String: Any] = [
            "head_gesture": [
                "gesture": gesture,
                "timestamp": Date().timeIntervalSince1970 * 1000,
            ],
        ]

        emitEvent("HeadGestureEvent", body: eventBody)
    }

    // MARK: - Event Emission Helper

    private func emitEvent(_ eventName: String, body: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: body, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                // Use CoreMessageEvent like G1 does to avoid unsupported event type errors
                Core.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
                Core.log("NEX: 📡 Emitted \(eventName) via CoreMessageEvent: \(jsonString)")
            }
        } catch {
            Core.log("NEX: ❌ Error emitting \(eventName): \(error)")
        }
    }

    // MARK: - Heartbeat Management

    private func notifyHeartbeatSent(_ timestamp: TimeInterval) {
        lastHeartbeatSentTime = timestamp

        let eventBody: [String: Any] = [
            "heartbeat_sent": [
                "timestamp": timestamp,
                "device_model": "Mentra Nex",
            ],
        ]

        emitEvent("HeartbeatSentEvent", body: eventBody)
    }

    private func notifyHeartbeatReceived(_ timestamp: TimeInterval) {
        lastHeartbeatReceivedTime = timestamp

        let eventBody: [String: Any] = [
            "heartbeat_received": [
                "timestamp": timestamp,
                "device_model": "Mentra Nex",
            ],
        ]

        emitEvent("HeartbeatReceivedEvent", body: eventBody)
    }

    @objc func getLastHeartbeatSentTime() -> TimeInterval {
        return lastHeartbeatSentTime
    }

    @objc func getLastHeartbeatReceivedTime() -> TimeInterval {
        return lastHeartbeatReceivedTime
    }

    // MARK: - Java-Compatible Initialization Methods

    private func startMicBeat() {
        Core.log("NEX: Starting micbeat (30 min interval)")

        if micBeatCount > 0 {
            stopMicBeat()
        }

        // Set mic enabled first (like Java line 1751)
        setMicrophoneEnabled(true)
        micBeatCount += 1

        // Schedule periodic mic beat (like Java lines 1753-1762)
        micBeatTimer = Timer.scheduledTimer(withTimeInterval: MICBEAT_INTERVAL_MS, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            Core.log("NEX: SENDING MIC BEAT")
            self.setMicrophoneEnabled(self.shouldUseGlassesMic)
        }
    }

    private func stopMicBeat() {
        setMicrophoneEnabled(false)
        micBeatTimer?.invalidate()
        micBeatTimer = nil
        micBeatCount = 0
        Core.log("NEX: Stopped mic beat")
    }

    private func sendWhiteListCommand() {
        guard !whiteListedAlready else {
            Core.log("NEX: Whitelist already sent, skipping")
            return
        }
        whiteListedAlready = true

        Core.log("NEX: Sending whitelist command")

        // Create whitelist JSON exactly like Java (lines 2642-2680)
        let whitelistJson = createWhitelistJson()
        let chunks = createWhitelistChunks(json: whitelistJson)

        // Send chunks with delay like Java
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) { // 10ms delay
            self.queueChunks(chunks)
        }
    }

    private func createWhitelistJson() -> String {
        // Exact JSON structure from Java implementation (lines 2653-2680)
        let whitelistDict: [String: Any] = [
            "calendar_enable": false,
            "call_enable": false,
            "msg_enable": false,
            "ios_mail_enable": false,
            "app": [
                "list": [
                    ["id": "com.augment.os", "name": "AugmentOS"],
                ],
                "enable": true,
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: whitelistDict)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Core.log("NEX: Created whitelist JSON: \(jsonString)")
                return jsonString
            }
        } catch {
            Core.log("NEX: Error creating whitelist JSON: \(error)")
        }

        return "{}"
    }

    private func createWhitelistChunks(json: String) -> [[UInt8]] {
        // Exact chunking logic from Java (lines 2703-2728)
        guard let jsonData = json.data(using: .utf8) else { return [] }

        let totalChunks = Int(ceil(Double(jsonData.count) / Double(maxChunkSize)))
        var chunks: [[UInt8]] = []

        for i in 0 ..< totalChunks {
            let start = i * maxChunkSize
            let end = min(start + maxChunkSize, jsonData.count)
            let payloadChunk = jsonData.subdata(in: start ..< end)

            // Create header: [WHITELIST_CMD, total_chunks, chunk_index] (Java lines 2714-2717)
            var header: [UInt8] = [
                WHITELIST_CMD, // Command ID (0x04)
                UInt8(totalChunks), // Total number of chunks
                UInt8(i), // Current chunk index
            ]

            // Combine header and payload (Java lines 2720-2725)
            header.append(contentsOf: payloadChunk)
            chunks.append(header)
        }

        Core.log("NEX: Created \(chunks.count) whitelist chunks")
        return chunks
    }

    private func postProtobufSchemaVersionInfo() {
        guard !protobufVersionPosted else {
            Core.log("NEX: Protobuf version already posted, skipping")
            return
        }
        protobufVersionPosted = true

        Core.log("NEX: 📋 Posting protobuf schema version info")

        // Emit protobuf schema version event like Java (lines 3709-3728)
        let eventBody: [String: Any] = [
            "protobuf_schema_version": [
                "schema_version": 1, // Default version
                "build_info": "Schema v1 | mentraos_ble.proto",
                "device_model": "Mentra Nex",
            ],
        ]

        // emitEvent("ProtobufSchemaVersionEvent", body: eventBody)
    }

    // Save microphone state before disconnection (like Java implementation)
    private func saveMicrophoneStateBeforeDisconnection() {
        UserDefaults.standard.set(shouldUseGlassesMic, forKey: "microphoneStateBeforeDisconnection")
        microphoneStateBeforeDisconnection = shouldUseGlassesMic
        Core.log("NEX: Saved microphone state before disconnection: \(shouldUseGlassesMic)")
    }

    @objc func disconnect() {
        Core.log("NEX: 🔌 User-initiated disconnect")
        if let peripheral = peripheral {
            // Save microphone state before disconnection (like Java implementation)
            saveMicrophoneStateBeforeDisconnection()

            // Stop mic beat system
            stopMicBeat()

            isDisconnecting = true
            connectionState = .disconnected
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        stopReconnectionTimer()
    }

    // MARK: - Lifecycle Management (ported from Java)

    @objc func destroy() {
        Core.log("NEX: 💥 Destroying MentraNexSGC instance")

        isKilled = true
        isDisconnecting = true

        // Stop all timers
        // Save microphone state before destruction (like Java implementation)
        saveMicrophoneStateBeforeDisconnection()

        // Stop mic beat system (like Java implementation)
        stopMicBeat()

        stopReconnectionTimer()

        // Disconnect from peripheral
        if let peripheral = peripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }

        // Stop scanning
        if _isScanning {
            stopScan()
        }

        // Clear all references
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        centralManager?.delegate = nil
        centralManager = nil

        // Clear discovery cache
        discoveredPeripherals.removeAll()

        Core.log("NEX: ✅ MentraNexSGC destroyed successfully")
        // Reset initialization flags
        whiteListedAlready = false
        protobufVersionPosted = false
    }

    @objc func reset() {
        Core.log("NEX: 🔄 Resetting MentraNexSGC to fresh state")

        // Disconnect current connection
        disconnect()

        // Clear all saved device information
        clearSavedDeviceInfo()

        // Clear discovery cache
        discoveredPeripherals.removeAll()

        // Reset internal state
        isKilled = false
        isDisconnecting = false
        nexReady = false
        reconnectionAttempts = 0
        peripheralToConnectName = nil

        Core.log("NEX: ✅ Reset complete - ready for fresh pairing")
        // Reset initialization flags (like Java implementation)
        whiteListedAlready = false
        protobufVersionPosted = false
        heartbeatCount = 0
        micBeatCount = 0
        shouldUseGlassesMic = true
        microphoneStateBeforeDisconnection = false
    }

    // MARK: - Helper Methods (like G1)

    private func getConnectedDevices() -> [CBPeripheral] {
        guard let centralManager = centralManager else { return [] }
        // Retrieve peripherals already connected that expose our main service
        return centralManager.retrieveConnectedPeripherals(withServices: [])
    }

    private func emitDiscoveredDevice(_ name: String) {
        // Emit device discovery event (using MentraLive's format)
        Core.log("NEX: 📡 Emitting discovered device: \(name)")

        let eventBody: [String: Any] = [
            "compatible_glasses_search_result": [
                "model_name": "Mentra Nex",
                "device_name": name,
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Core.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
            }
        } catch {
            Core.log("Error converting to JSON: \(error)")
        }
    }

    @objc func checkBluetoothState() {
        Core.log("NEX: 🔍 Checking Bluetooth State...")
        if let centralManager = centralManager {
            Core.log("NEX: 📱 Central Manager exists: YES")
            Core.log("NEX: 📱 Current Bluetooth State: \(centralManager.state.rawValue)")

            switch centralManager.state {
            case .poweredOn:
                Core.log("NEX: ✅ Bluetooth is ready for scanning")

                if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
                    Core.log("NEX: 🔄 Looking for saved device: \(savedDeviceName)")
                    // This will be handled in didDiscover when the device is found
                    startScan()
                }
            case .poweredOff:
                Core.log("NEX: ❌ Bluetooth is turned off")
            case .resetting:
                Core.log("NEX: 🔄 Bluetooth is resetting")
            case .unauthorized:
                Core.log("NEX: ❌ Bluetooth permission denied")
            case .unsupported:
                Core.log("NEX: ❌ Bluetooth not supported")
            case .unknown:
                Core.log("NEX: ❓ Bluetooth state unknown")
            @unknown default:
                Core.log("NEX: ❓ Unknown Bluetooth state: \(centralManager.state.rawValue)")
            }
        } else {
            Core.log("NEX: ❌ Central Manager is nil!")
        }
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Core.log("NEX: 🔄 Bluetooth state changed to: \(central.state.rawValue)")

        switch central.state {
        case .poweredOn:
            Core.log("NEX: ✅ Bluetooth is On and ready for scanning")
            if scanOnPowerOn {
                Core.log("NEX: 🚀 Triggering scan after power on.")
                scanOnPowerOn = false
                startScan()
            }
        case .poweredOff:
            Core.log("NEX: ❌ Bluetooth is Off - user needs to enable Bluetooth")
            connectionState = .disconnected
        case .resetting:
            Core.log("NEX: 🔄 Bluetooth is resetting - wait for completion")
            connectionState = .disconnected
        case .unauthorized:
            Core.log("NEX: ❌ Bluetooth is unauthorized - check app permissions")
            connectionState = .disconnected
        case .unsupported:
            Core.log("NEX: ❌ Bluetooth is unsupported on this device")
            connectionState = .disconnected
        case .unknown:
            Core.log("NEX: ❓ Bluetooth state is unknown - may be initializing")
        @unknown default:
            Core.log("NEX: ❓ A new Bluetooth state was introduced: \(central.state.rawValue)")
        }
    }

    func centralManager(_: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData _: [String: Any], rssi RSSI: NSNumber) {
        guard let deviceName = peripheral.name else {
            // Core.log("NEX-CONN: 🚫 Ignoring device with no name")
            return
        }

        // guard isCompatibleNexDevice(deviceName) else {
        //     // Core.log("NEX-CONN: 🚫 Ignoring incompatible device: \(deviceName)")
        //     return
        // }

        Core.log("NEX-CONN: 🎯 === Compatible Nex Device Found ===")
        Core.log("NEX-CONN: 📱 Device Name: \(deviceName)")
        Core.log("NEX-CONN: 📶 RSSI: \(RSSI) dBm")

        // Store the peripheral in cache (like MentraLive)
        discoveredPeripherals[deviceName] = peripheral

        // Always emit the discovered device for the UI list
        emitDiscoveredDevice(deviceName)

        // Auto-connect logic based on target or saved device (from Java MentraNexSGC)
        var shouldConnect = false
        var connectionReason = ""

        // Check if this matches our target device name for connection
        if let targetName = peripheralToConnectName, deviceName.contains(targetName) {
            shouldConnect = true
            connectionReason = "Target device name match: \(targetName)"
        }
        // Check if this matches our saved device for reconnection
        else if let savedName = savedDeviceName, deviceName == savedName {
            shouldConnect = true
            connectionReason = "Saved device reconnection: \(savedName)"
        }
        // Check if this matches preferred device ID
        else if let preferredId = preferredDeviceId {
            if let extractedId = extractDeviceId(from: deviceName), extractedId == preferredId {
                shouldConnect = true
                connectionReason = "Preferred device ID match: \(preferredId)"
            }
        }

        if shouldConnect {
            connectToFoundDevice(peripheral, reason: connectionReason)
        }
    }

    // MARK: - Enhanced Connection Helper

    private func connectToFoundDevice(_ peripheral: CBPeripheral, reason: String) {
        guard self.peripheral == nil else {
            Core.log("NEX-CONN: ⚠️ Already connected/connecting to a device, ignoring new connect request for '\(peripheral.name ?? "Unknown")'")
            return
        }

        Core.log("NEX-CONN: 🔗 Connecting to device '\(peripheral.name ?? "Unknown")' - Reason: \(reason)")

        // Stop scanning since we found our target
        if _isScanning {
            stopScan()
        }

        // Store the peripheral and initiate connection
        self.peripheral = peripheral
        isConnecting = true
        connectionState = .connecting

        // Use connection options for better reliability (from Java implementation)
        let connectionOptions: [String: Any] = [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
            CBConnectPeripheralOptionNotifyOnNotificationKey: true,
        ]

        centralManager?.connect(peripheral, options: connectionOptions)

        Core.log("NEX-CONN: 🚀 Connection initiated with enhanced options")
    }

    func centralManager(_: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Core.log("NEX-CONN: ✅ Successfully connected to \(peripheral.name ?? "unknown device").")
        isConnecting = false
        peripheralUUID = peripheral.identifier // Persist UUID
        stopReconnectionTimer() // Successfully connected, stop trying to reconnect.

        // Enhanced device info saving (from Java implementation)
        let deviceName = peripheral.name
        let deviceAddress = peripheral.identifier.uuidString

        // Save all device information for future reconnection
        savePairedDeviceInfo(name: deviceName, address: deviceAddress)

        // Extract and save device ID if possible
        if let deviceName = deviceName, let deviceId = extractDeviceId(from: deviceName) {
            savePreferredDeviceId(deviceId)
        }

        Core.log("NEX-CONN: 💾 Device information saved for reliable reconnection")
        peripheral.delegate = self
        Core.log("NEX-CONN: 🔍 Discovering services...")
        peripheral.discoverServices([MAIN_SERVICE_UUID])

        // Reset any failed connection attempt counters
        reconnectionAttempts = 0
        Core.log("NEX-CONN: 🔄 Reset reconnection attempts counter")
    }

    func centralManager(_: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Core.log("NEX-CONN: ❌ Failed to connect to peripheral \(peripheral.name ?? "Unknown"). Error: \(error?.localizedDescription ?? "unknown")")
        isConnecting = false
        connectionState = .disconnected
        self.peripheral = nil // Reset peripheral on failure to allow reconnection
        // Optionally, start reconnection attempts here
        if !isDisconnecting, !isKilled {
            startReconnectionTimer()
        }
    }

    func centralManager(_: CBCentralManager, didDisconnectPeripheral disconnectedPeripheral: CBPeripheral, error: Error?) {
        Core.log("NEX-CONN: 🔌 Disconnected from peripheral: \(disconnectedPeripheral.name ?? "Unknown")")

        if let error = error {
            Core.log("NEX-CONN: ⚠️ Disconnect error: \(error.localizedDescription)")
        }

        // Reset connection state
        // Save microphone state before disconnection (like Java implementation)
        saveMicrophoneStateBeforeDisconnection()

        // Reset protobuf version posted flag for next connection (like Java implementation)
        protobufVersionPosted = false

        // Stop mic beat system (like Java implementation)
        stopMicBeat()

        nexReady = false
        deviceReady = false
        batteryLevel = -1
        isCharging = false
        isHeadUp = false
        vadActive = false
        compressedVoiceData = .init()
        aiListening = false
        deviceFirmwareVersion = ""
        deviceHardwareModel = ""
        accelerometer = [0.0, 0.0, 0.0]
        gyroscope = [0.0, 0.0, 0.0]
        magnetometer = [0.0, 0.0, 0.0]
        lastButtonPressed = -1
        lastButtonState = ""
        lastHeadGesture = ""
        headUpAngle = 0

        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        connectionState = .disconnected

        // Clear command queue if needed
        if isQueueWorkerRunning {
            Core.log("NEX-CONN: 🧹 Clearing command queue due to disconnection")
        }

        if !isDisconnecting, !isKilled {
            Core.log("NEX-CONN: 🔄 Unintentional disconnect detected. Attempting reconnection...")

            // Enhanced reconnection strategy from Java implementation
            if let savedName = savedDeviceName {
                Core.log("NEX-CONN: 🎯 Will attempt to reconnect to saved device: \(savedName)")
            }

            startReconnectionTimer()
        } else {
            Core.log("NEX-CONN: ✅ Intentional disconnect (isDisconnecting: \(isDisconnecting), isKilled: \(isKilled))")

            if isDisconnecting {
                // Don't clear device info on intentional disconnect - user might reconnect later
                Core.log("NEX-CONN: 💾 Keeping device info for potential future reconnection")
            }
        }
    }

    // MARK: - MTU Negotiation (iOS-specific implementation)

    private func requestOptimalMTU(for peripheral: CBPeripheral) {
        Core.log("NEX-CONN:  negotiating MTU")
        Core.log("NEX: 🔍 iOS MTU Discovery (Platform Limitation: max \(MTU_MAX_IOS) bytes)")
        Core.log("NEX: 🎯 iOS maximum: \(MTU_MAX_IOS) bytes, default: \(MTU_DEFAULT) bytes")

        // iOS MTU is automatically negotiated - we can only discover the current value
        // No manual MTU request available on iOS (platform limitation)

        // Get current MTU capability (iOS-specific approach)
        let maxWriteLength = peripheral.maximumWriteValueLength(for: .withResponse)
        let actualMTU = maxWriteLength + 3 // Add L2CAP header size

        Core.log("NEX: 📊 iOS MTU Discovery Results:")
        Core.log("NEX:    📏 Max write length: \(maxWriteLength) bytes")
        Core.log("NEX:    📡 Effective MTU: \(actualMTU) bytes")

        // Validate against iOS limitations
        let validatedMTU = min(actualMTU, MTU_MAX_IOS)
        if actualMTU > MTU_MAX_IOS {
            Core.log("NEX: 🔧 Clamping MTU from \(actualMTU) to iOS maximum: \(MTU_MAX_IOS)")
        }

        // Process MTU result immediately (iOS doesn't have callback like Android)
        onMTUNegotiated(mtu: validatedMTU, success: true)

        // After MTU is set, start device initialization sequence (from Java implementation)
        initializeNexDevice()
    }

    private func onMTUNegotiated(mtu: Int, success: Bool) {
        Core.log("NEX-CONN: 🔄 MTU Negotiation Result: Success=\(success), Device MTU=\(mtu)")

        if success, mtu > MTU_DEFAULT {
            // Store device capability and calculate actual negotiated MTU
            deviceMaxMTU = mtu
            // iOS limitation: Use actual MTU but cap at iOS maximum
            currentMTU = min(MTU_MAX_IOS, mtu)

            Core.log("NEX: 🎯 iOS MTU Configuration Complete:")
            Core.log("NEX:    🍎 iOS Platform Max: \(MTU_MAX_IOS) bytes")
            Core.log("NEX:    📡 Device Supports: \(deviceMaxMTU) bytes")
            Core.log("NEX:    🤝 Final MTU: \(currentMTU) bytes")

            // Calculate optimal chunk sizes based on iOS MTU constraints
            maxChunkSize = currentMTU - 10 // Reserve 10 bytes for headers
            bmpChunkSize = currentMTU - 6 // Reserve 6 bytes for image headers

            Core.log("NEX: 📦 Optimized Chunk Sizes:")
            Core.log("NEX:    📄 Data Chunk Size: \(maxChunkSize) bytes")
            Core.log("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")

        } else {
            Core.log("NEX: ⚠️ MTU negotiation failed or using minimum, applying iOS defaults")
            currentMTU = MTU_DEFAULT
            deviceMaxMTU = MTU_DEFAULT
            maxChunkSize = 20 // Very conservative for 23-byte MTU
            bmpChunkSize = 20 // Very conservative for 23-byte MTU

            Core.log("NEX: 📋 iOS Fallback Configuration:")
            Core.log("NEX:    📊 Default MTU: \(MTU_DEFAULT) bytes")
            Core.log("NEX:    📦 Data Chunk Size: \(maxChunkSize) bytes")
            Core.log("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")
            Core.log("NEX:    ⚠️ Using minimal chunks due to MTU limitation")
        }

        // Device is now ready for communication
        Core.log("NEX-CONN: ✅ Device initialization complete - ready for communication")
        nexReady = true
        connectionState = .connected

        // Update @Published property for device ready state
        deviceReady = true

        // Initialize command queue worker to process queued commands
        setupCommandQueue()

        // Emit device ready event to React Native
        emitDeviceReady()
    }

    // MARK: - Device Initialization (ported from Java MentraNexSGC)

    private func initializeNexDevice() {
        Core.log("NEX-CONN: 🚀 Starting Nex device initialization (matching Java sequence)")

        // Exact Java initialization sequence from lines 648-691:

        // 1. Do first battery status query (Java line 650)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) { // 10ms delay like Java
            Core.log("NEX: 🔋 Sending first battery status query")
            self.queryBatteryStatus()
        }

        // 2. Restore previous microphone state (Java lines 657-665)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { // 20ms delay
            let shouldRestoreMic = UserDefaults.standard.bool(forKey: "microphoneStateBeforeDisconnection")
            Core.log("NEX: 🎤 Restoring microphone state to: \(shouldRestoreMic)")

            if shouldRestoreMic {
                self.startMicBeat()
            } else {
                self.stopMicBeat()
            }
        }

        // 3. Enable AugmentOS notification key (Java line 668)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { // 30ms delay
            self.sendWhiteListCommand()
        }

        // 4. Show home screen to turn on the NexGlasses display (Java line 673)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { // 50ms delay
            self.showHomeScreen()
        }

        // 5. Post protobuf schema version information (Java lines 684-687)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { // 100ms delay
            self.postProtobufSchemaVersionInfo()
        }

        // 6. Query glasses protobuf version from firmware (Java line 690)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { // 150ms delay
            self.queryGlassesInfo()
        }

        Core.log("NEX-CONN: ✅ Java-compatible initialization sequence started")
    }

    private func emitDeviceReady() {
        let eventBody: [String: Any] = [
            "device_ready": [
                "model_name": "Mentra Nex",
                "mtu_negotiated": currentMTU,
                "max_chunk_size": maxChunkSize,
                "connection_state": "ready",
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Core.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
                Core.log("NEX: 📡 Emitted device ready event with MTU: \(currentMTU)")
            }
        } catch {
            Core.log("NEX: ❌ Error emitting device ready event: \(error)")
        }
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error discovering services: \(error.localizedDescription)")
            return
        }

        guard let services = peripheral.services else {
            Core.log("NEX-CONN: ⚠️ No services found for peripheral.")
            return
        }
        for service in services {
            if service.uuid == MAIN_SERVICE_UUID {
                Core.log("NEX-CONN: ✅ Found main service. Discovering characteristics...")
                peripheral.discoverCharacteristics([WRITE_CHAR_UUID, NOTIFY_CHAR_UUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error discovering characteristics: \(error.localizedDescription)")
            return
        }

        guard let characteristics = service.characteristics else {
            Core.log("NEX-CONN: ⚠️ No characteristics found for service \(service.uuid).")
            return
        }
        for characteristic in characteristics {
            if characteristic.uuid == WRITE_CHAR_UUID {
                Core.log("NEX-CONN: ✅ Found write characteristic.")
                writeCharacteristic = characteristic
            } else if characteristic.uuid == NOTIFY_CHAR_UUID {
                Core.log("NEX-CONN: ✅ Found notify characteristic. Subscribing for notifications.")
                notifyCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }

        if writeCharacteristic != nil, notifyCharacteristic != nil {
            Core.log("NEX-CONN: ✅ All required characteristics discovered. Proceeding to MTU negotiation.")

            // Start MTU negotiation like Java implementation
            requestOptimalMTU(for: peripheral)
        }
    }

    func peripheral(_: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error on updating value: \(error.localizedDescription)")
            return
        }

        guard let data = characteristic.value else {
            Core.log("NEX-CONN: ⚠️ Received notification with no data.")
            return
        }
        Core.log("NEX-CONN: 📥 Received data (\(data.count) bytes): \(data.toHexString())")

        // Process the received data based on packet type
        processReceivedData(data)
    }

    func peripheral(_: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error writing value to \(characteristic.uuid): \(error.localizedDescription)")
            return
        }
        // This log can be very noisy, so it's commented out.
        // Core.log("NEX-CONN: 📤 Successfully wrote value to \(characteristic.uuid).")
    }

    func peripheral(_: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error changing notification state for \(characteristic.uuid): \(error.localizedDescription)")
            return
        }

        if characteristic.isNotifying {
            Core.log("NEX-CONN: ✅ Successfully subscribed to notifications for characteristic \(characteristic.uuid.uuidString).")
        } else {
            Core.log("NEX-CONN:  unsubscribed from notifications for characteristic \(characteristic.uuid.uuidString).")
        }
    }
}
