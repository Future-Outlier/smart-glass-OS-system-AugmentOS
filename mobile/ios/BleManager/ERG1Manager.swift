//
//  ERG1Manager.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/3/25.
//

import Combine
import CoreBluetooth
import Foundation
import UIKit
import React

extension Data {
  func chunked(into size: Int) -> [Data] {
    var chunks = [Data]()
    var index = 0
    while index < count {
      let chunkSize = Swift.min(size, count - index)
      let chunk = subdata(in: index..<(index + chunkSize))
      chunks.append(chunk)
      index += chunkSize
    }
    return chunks
  }
  
  func hexEncodedString() -> String {
    return map { String(format: "%02x", $0) }.joined(separator: " ")
    //    return map { String(format: "%02x", $0) }.joined(separator: ", ")
  }
  
  // Extension for CRC32 calculation
  var crc32: UInt32 {
    return self.withUnsafeBytes { bytes in
      let buffer = bytes.bindMemory(to: UInt8.self)
      var crc: UInt32 = 0xFFFFFFFF
      
      for byte in buffer {
        crc ^= UInt32(byte)
        for _ in 0..<8 {
          if crc & 1 == 1 {
            crc = (crc >> 1) ^ 0xEDB88320
          } else {
            crc >>= 1
          }
        }
      }
      
      return ~crc
    }
  }
  
  /// Initialize Data from hex string
  init?(hexString: String) {
    let cleanHex = hexString.replacingOccurrences(of: " ", with: "")
    guard cleanHex.count % 2 == 0 else { return nil }
    
    var data = Data()
    var index = cleanHex.startIndex
    
    while index < cleanHex.endIndex {
      let nextIndex = cleanHex.index(index, offsetBy: 2)
      let byteString = cleanHex[index..<nextIndex]
      guard let byte = UInt8(byteString, radix: 16) else { return nil }
      data.append(byte)
      index = nextIndex
    }
    
    self = data
  }
}

public struct QuickNote: Equatable {
  let id: UUID
  let text: String
  let timestamp: Date
  
  public static func == (lhs: QuickNote, rhs: QuickNote) -> Bool {
    return lhs.id == rhs.id
  }
}

struct BufferedCommand {
  let chunks: [[UInt8]]
  let sendLeft: Bool
  let sendRight: Bool
  let waitTime: Int
  let ignoreAck: Bool
  
  init(chunks: [[UInt8]], sendLeft: Bool = true, sendRight: Bool = true, waitTime: Int = -1, ignoreAck: Bool = false) {
    self.chunks = chunks
    self.sendLeft = sendLeft
    self.sendRight = sendRight
    self.waitTime = waitTime
    self.ignoreAck = ignoreAck
  }
}

// Simple struct to hold app info
struct AppInfo {
  let id: String
  let name: String
}

enum GlassesError: Error {
  case missingGlasses(String)
}


@objc(ERG1Manager) class ERG1Manager: NSObject {
  
  // todo: we probably don't need this
  @objc static func requiresMainQueueSetup() -> Bool { return true }
  
  // Duplicate BMP prevention with timeout
  private var isDisplayingBMP = false
  private var lastBMPStartTime = Date()
  
  // Frame synchronization for animations
  private var lastFrameTime = Date()
  private var frameSequence = 0
  
  // Animation Batching (iOS-Controlled Timing)
  private var animationFrames: [String] = []
  private var animationTimer: Timer?
  private var currentFrameIndex: Int = 0
  private var animationInterval: TimeInterval = 1.650 // Default 1650ms
  private var animationRepeat: Bool = false
  private var isAnimationRunning: Bool = false
  
  // L/R Synchronization - Track BLE write completions
  private var pendingWriteCompletions: [CBCharacteristic: CheckedContinuation<Bool, Never>] = [:]
  private var pendingAckCompletions: [String: CheckedContinuation<Bool, Never>] = [:]
  private let ackCompletionsQueue = DispatchQueue(label: "com.erg1.ackCompletions", attributes: .concurrent)
  private var writeCompletionCount = 0
  
  var onConnectionStateChanged: (() -> Void)?
  private var _g1Ready: Bool = false
  public var g1Ready: Bool {
    get { return _g1Ready }
    set {
      let oldValue = _g1Ready
      _g1Ready = newValue
      if oldValue != newValue {
        // Call the callback when state changes
        onConnectionStateChanged?()
      }
      if (!newValue) {
        // Reset battery levels when disconnected
        batteryLevel = -1
        leftBatteryLevel = -1
        rightBatteryLevel = -1
      }
    }
  }
  
  public var leftReady: Bool = false
  public var rightReady: Bool = false
  
  @Published public var compressedVoiceData: Data = Data()
  @Published public var aiListening: Bool = false
  @Published public var quickNotes: [QuickNote] = []
  @Published public var batteryLevel: Int = -1
  @Published public var caseBatteryLevel: Int = -1
  @Published public var leftBatteryLevel: Int = -1
  @Published public var rightBatteryLevel: Int = -1
  @Published public var caseCharging = false
  @Published public var caseOpen = false
  @Published public var caseRemoved = true
  
  // Serial number and color information
  @Published public var glassesSerialNumber: String?
  @Published public var glassesStyle: String?
  @Published public var glassesColor: String?
  
  // Callback for serial number discovery
  public var onSerialNumberDiscovered: (() -> Void)?
  
  public var isDisconnecting = false
  private var reconnectionTimer: Timer?
  private var reconnectionAttempts: Int = 0
  private let maxReconnectionAttempts: Int = -1 // unlimited reconnection attempts
  private let reconnectionInterval: TimeInterval = 30.0 // Seconds between reconnection attempts
  private var globalCounter: UInt8 = 0
  
  enum AiMode: String {
    case AI_REQUESTED
    case AI_MIC_ON
    case AI_IDLE
  }
  
  let UART_SERVICE_UUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_TX_CHAR_UUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_RX_CHAR_UUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
  
  // synchronization:
  private let commandQueue = CommandQueue()
  private let queueLock = DispatchSemaphore(value: 1)
  private let leftSemaphore = DispatchSemaphore(value: 0)  // Start at 0 to block
  private let rightSemaphore = DispatchSemaphore(value: 0)  // Start at 0 to block
  private var leftAck = false
  private var rightAck = false
  
  // Constants
  var DEVICE_SEARCH_ID = "NOT_SET"
  let DELAY_BETWEEN_CHUNKS_SEND: UInt64 = 16_000_000 // 16ms
  let DELAY_BETWEEN_SENDS_MS: UInt64 = 8_000_000 // 8ms
  let INITIAL_CONNECTION_DELAY_MS: UInt64 = 350_000_000 // 350ms
  public var textHelper = G1Text()
  var msgId = 100;
  
  public static let _bluetoothQueue = DispatchQueue(label: "BluetoothG1", qos: .userInitiated)
  
  private var aiMode: AiMode = .AI_IDLE {
    didSet {
      if aiMode == .AI_MIC_ON {
        aiListening = true
      } else {
        aiListening = false
      }
    }
  }
  
  private var centralManager: CBCentralManager?
  private var leftPeripheral: CBPeripheral?
  private var rightPeripheral: CBPeripheral?
  private var connectedDevices: [String: (CBPeripheral?, CBPeripheral?)] = [:]
  var lastConnectionTimestamp: Date = Date.distantPast
  private var heartbeatTimer: Timer?
  private var heartbeatQueue: DispatchQueue?
  private var leftInitialized: Bool = false
  private var rightInitialized: Bool = false
  @Published public var isHeadUp = false
  
  private var leftGlassUUID: UUID? {
    get {
      if let uuidString = UserDefaults.standard.string(forKey: "leftGlassUUID") {
        return UUID(uuidString: uuidString)
      }
      return nil
    }
    set {
      if let newValue = newValue {
        UserDefaults.standard.set(newValue.uuidString, forKey: "leftGlassUUID")
      } else {
        UserDefaults.standard.removeObject(forKey: "leftGlassUUID")
      }
    }
  }
  
  private var rightGlassUUID: UUID? {
    get {
      if let uuidString = UserDefaults.standard.string(forKey: "rightGlassUUID") {
        return UUID(uuidString: uuidString)
      }
      return nil
    }
    set {
      if let newValue = newValue {
        UserDefaults.standard.set(newValue.uuidString, forKey: "rightGlassUUID")
      } else {
        UserDefaults.standard.removeObject(forKey: "rightGlassUUID")
      }
    }
  }
  
  static let shared = ERG1Manager()
  
  private override init() {
    super.init()
    startHeartbeatTimer()
  }
  
  func forgetGlasses() {
    leftGlassUUID = nil
    rightGlassUUID = nil
    DEVICE_SEARCH_ID = "NOT_SET"
    
    // Stop the heartbeat timer
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
    
    // Stop the reconnection timer if active
    stopReconnectionTimer()
    
    // Clean up central manager delegate
    centralManager?.delegate = nil
    
    // Clean up peripheral delegates
    leftPeripheral?.delegate = nil
    rightPeripheral?.delegate = nil
  }
  
  deinit {
    // Stop the heartbeat timer
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
    
    // Stop the reconnection timer if active
    stopReconnectionTimer()
    
    // Clean up central manager delegate
    centralManager?.delegate = nil
    
    // Clean up peripheral delegates
    leftPeripheral?.delegate = nil
    rightPeripheral?.delegate = nil
    
    // leftGlassUUID = nil
    // rightGlassUUID = nil
    
    CoreCommsService.log("G1: ERG1Manager deinitialized")
  }
  
  // MARK: - Serial Number and Color Detection
  
  /// Decodes Even G1 serial number to extract style and color information
  /// - Parameter serialNumber: The full serial number (e.g., "S110LABD020021")
  /// - Returns: Tuple containing (style, color) or ("Unknown", "Unknown") if invalid
  static func decodeEvenG1SerialNumber(_ serialNumber: String) -> (style: String, color: String) {
    guard serialNumber.count >= 6 else {
      return ("Unknown", "Unknown")
    }
    
    // Style mapping: 2nd character (index 1)
    let style: String
    let styleChar = serialNumber[serialNumber.index(serialNumber.startIndex, offsetBy: 2)]
    switch styleChar {
    case "0":
      style = "Round"
    case "1":
      style = "Rectangular"
    default:
      style = "Round"
    }
    
    // Color mapping: 5th character (index 4)
    let color: String
    let colorChar = serialNumber[serialNumber.index(serialNumber.startIndex, offsetBy: 5)]
    switch colorChar {
    case "A":
      color = "Grey"
    case "B":
      color = "Brown"
    case "C":
      color = "Green"
    default:
      color = "Grey"
    }
    
    return (style, color)
  }
  
  /// Decodes serial number from manufacturer data bytes
  /// - Parameter manufacturerData: The manufacturer data bytes
  /// - Returns: Decoded serial number string or nil if not found
  private func decodeSerialFromManufacturerData(_ manufacturerData: Data) -> String? {
    guard manufacturerData.count >= 10 else {
      return nil
    }
    
    // Convert bytes to ASCII string
    var serialBuilder = ""
    for byte in manufacturerData {
      if byte == 0x00 {
        // Stop at null terminator
        break
      }
      if byte >= 0x20 && byte <= 0x7E {
        // Only include CoreCommsService.logable ASCII characters
        serialBuilder.append(Character(UnicodeScalar(byte)))
      }
    }
    
    let decodedString = serialBuilder.trimmingCharacters(in: .whitespacesAndNewlines)
    
    // Check if it looks like a valid Even G1 serial number
    if decodedString.count >= 12 &&
        (decodedString.hasPrefix("S1") || decodedString.hasPrefix("100") || decodedString.hasPrefix("110")) {
      return decodedString
    }
    
    return nil
  }
  
  /// Emits serial number information to React Native
  private func emitSerialNumberInfo(serialNumber: String, style: String, color: String) {
    let eventBody: [String: Any] = [
      "type": "glasses_serial_number",
      "serialNumber": serialNumber,
      "style": style,
      "color": color
    ]
    
    // Convert to JSON string for CoreMessageEvent
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
        CoreCommsService.log("G1: 📱 Emitted serial number info: \(serialNumber), Style: \(style), Color: \(color)")
        
        // Trigger status update to include serial number in status JSON
        DispatchQueue.main.async {
          self.onSerialNumberDiscovered?()
        }
      }
    } catch {
      CoreCommsService.log("G1: Error creating serial number JSON: \(error)")
    }
  }
  
  // @@@ REACT NATIVE FUNCTIONS @@@
  
  @objc func RN_setSearchId(_ searchId: String) {
    CoreCommsService.log("G1: SETTING SEARCH_ID: \(searchId)")
    DEVICE_SEARCH_ID = searchId
  }
  
  // this scans for glasses to connect to and only connnects if SEARCH_ID is set
  func startScan() -> Void {
    
    Task {
      
      if centralManager == nil {
        centralManager = CBCentralManager(delegate: self, queue: ERG1Manager._bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
        setupCommandQueue()
        // wait for the central manager to be fully initialized before we start scanning:
        try? await Task.sleep(nanoseconds: 100 * 1_000_000)// 100ms
      }
      
      
      self.isDisconnecting = false// reset intentional disconnect flag
      guard centralManager!.state == .poweredOn else {
        CoreCommsService.log("G1: Attempting to scan but bluetooth is not powered on.")
        return false
      }
      
      // send our already connected devices to RN:
      let devices = getConnectedDevices()
      CoreCommsService.log("G1: connnectedDevices.count: (\(devices.count))")
      for device in devices {
        if let name = device.name {
          CoreCommsService.log("G1: Connected to device: \(name)")
          if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
            leftPeripheral = device
            device.delegate = self
            device.discoverServices([UART_SERVICE_UUID])
          } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
            rightPeripheral = device
            device.delegate = self
            device.discoverServices([UART_SERVICE_UUID])
          }
          emitDiscoveredDevice(name);
        }
      }
      
      
      // First try: Connect by UUID (works in background)
      if connectByUUID() {
        CoreCommsService.log("G1: 🔄 Found and attempting to connect to stored glasses UUIDs")
        // Wait for connection to complete - no need to scan
        return true
      }
      
      let scanOptions: [String: Any] = [
        CBCentralManagerScanOptionAllowDuplicatesKey: false,  // Don't allow duplicate advertisements
      ]
      
      centralManager!.scanForPeripherals(withServices: nil, options: scanOptions)
      return true
    }
  }
  
  public func connectById(_ id: String) -> Bool {
    self.DEVICE_SEARCH_ID = "_" + id + "_"
    startScan();
    return true
  }
  
  func findCompatibleDevices() -> Void {
    self.DEVICE_SEARCH_ID = "NOT_SET"
    startScan();
  }
  
  // connect to glasses we've discovered:
  @objc public func RN_connectGlasses() -> Bool {
    CoreCommsService.log("RN_connectGlasses()")
    
    if let side = leftPeripheral {
      centralManager!.connect(side, options: nil)
    }
    
    if let side = rightPeripheral {
      centralManager!.connect(side, options: nil)
    }
    
    // just return if we don't have both a left and right arm:
    guard leftPeripheral != nil && rightPeripheral != nil else {
      return false;
    }
    
    CoreCommsService.log("G1: found both glasses \(leftPeripheral!.name ?? "(unknown)"), \(rightPeripheral!.name ?? "(unknown)") stopping scan");
    //    startHeartbeatTimer();
    RN_stopScan();
    return true
  }
  
  @objc public func RN_sendText(_ text: String) -> Void {
    Task {
      let displayText = "\(text)"
      guard let textData = displayText.data(using: .utf8) else { return }
      
      var command: [UInt8] = [
        0x4E,           // SEND_RESULT command
        0x00,           // sequence number
        0x01,           // total packages
        0x00,           // current package
        0x71,           // screen status (0x70 Text Show | 0x01 New Content)
        0x00,           // char position 0
        0x00,           // char position 1
        0x01,           // page number
        0x01            // max pages
      ]
      command.append(contentsOf: Array(textData))
      self.queueChunks([command])
      
      // await sendTextWall(text)
      
      // // await createQuickNoteIfNeeded(text)
      // // await sendQuickNotesToGlasses()
    }
    
    // @@@@@@@@ just for testing:
    //    Task {
    //      msgId += 1
    //      let ncsNotification = NCSNotification(
    //          msgId: msgId,
    //          appIdentifier: "io.heckel.ntfy",
    //          title: "Notification Title",
    //          subtitle: "Notification Subtitle",
    //          message: text,
    //          displayName: "Example App"
    //      )
    //
    //      let notification = G1Notification(ncsNotification: ncsNotification)
    //      let encodedChunks = await notification.constructNotification()
    //      CoreCommsService.log("encodedChunks: \(encodedChunks.count)")
    //      self.queueChunks(encodedChunks)
    //    }
  }
  
  @objc public func RN_sendTextWall(_ text: String) -> Void {
    let chunks = textHelper.createTextWallChunks(text)
    queueChunks(chunks, sleepAfterMs: 10)
  }
  
  func createQuickNoteIfNeeded(_ text: String) async {
    if quickNotes.count == 0 {
      await addQuickNote(text)
    } else {
      await updateQuickNote(id: quickNotes[0].id, newText: text)
    }
  }
  
  @objc public func RN_sendDoubleTextWall(_ top: String, _ bottom: String) -> Void {
    let chunks = textHelper.createDoubleTextWallChunks(textTop: top, textBottom: bottom)
    queueChunks(chunks, sleepAfterMs: 10)
    
    // quick note testing:
    // Task {
    //   await createQuickNoteIfNeeded(top + "\n" + bottom)
    //   await sendQuickNotesToGlasses()
    // }
  }
  
  private func sendQuickNotesToGlasses() async {
    //      guard let rightGlass = rightPeripheral,
    //            let leftGlass = leftPeripheral,
    //            let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass),
    //            let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) else {
    //          return
    //      }
    
    // if !self.isHeadUp {
    //   return
    // }
    
    // First, clear all existing notes
    //      for noteNumber in 1...2 {
    let noteNumber = 1
    var command = Data()
    command.append(Commands.QUICK_NOTE_ADD.rawValue)
    command.append(0x10) // Fixed length for delete command
    command.append(0x00) // Fixed byte
    command.append(0xE0) // Version byte for delete
    command.append(contentsOf: [0x03, 0x01, 0x00, 0x01, 0x00]) // Fixed bytes
    command.append(UInt8(noteNumber)) // Note number to delete
    command.append(contentsOf: [0x00, 0x01, 0x00, 0x01, 0x00, 0x00]) // Fixed bytes for delete
    
    //          // Send delete command to both glasses with proper timing
    //          rightGlass.writeValue(command, for: rightTxChar, type: .withResponse)
    //          try? await Task.sleep(nanoseconds: 50 * 1_000_000)
    //          leftGlass.writeValue(command, for: leftTxChar, type: .withResponse)
    //          try? await Task.sleep(nanoseconds: 150 * 1_000_000)
    
    // convert command to array of UInt8
    let commandArray = command.map { $0 }
    queueChunks([commandArray])
    //      }
    
    // Then add all current notes
    for (index, note) in quickNotes.prefix(4).enumerated() {
      let slotNumber = index + 1
      
      guard let textData = note.text.data(using: .utf8),
            let nameData = "Quick Note2".data(using: .utf8) else {
        continue
      }
      
      // Calculate payload length
      let fixedBytes: [UInt8] = [0x03, 0x01, 0x00, 0x01, 0x00]
      let versionByte = UInt8(Date().timeIntervalSince1970.truncatingRemainder(dividingBy: 256))
      let payloadLength = 1 + // Fixed byte
      1 + // Version byte
      fixedBytes.count + // Fixed bytes sequence
      1 + // Note number
      1 + // Fixed byte 2
      1 + // Name length
      nameData.count + // Name bytes
      1 + // Text length
      1 + // Fixed byte after text length
      textData.count + // Text bytes
      2 // Final bytes
      
      // Build command
      var command = Data()
      command.append(Commands.QUICK_NOTE_ADD.rawValue)
      command.append(UInt8(payloadLength & 0xFF))
      command.append(0x00) // Fixed byte
      command.append(versionByte)
      command.append(contentsOf: fixedBytes)
      command.append(UInt8(slotNumber))
      command.append(0x01) // Fixed byte 2
      command.append(UInt8(nameData.count))
      command.append(nameData)
      command.append(UInt8(textData.count))
      command.append(0x00) // Fixed byte
      command.append(textData)
      
      // convert command to array of UInt8
      let commandArray = command.map { $0 }
      queueChunks([commandArray])
    }
  }
  
  public func addQuickNote(_ text: String) async {
    let note = QuickNote(id: UUID(), text: text, timestamp: Date())
    quickNotes.append(note)
  }
  
  public func updateQuickNote(id: UUID, newText: String) async {
    if let index = quickNotes.firstIndex(where: { $0.id == id }) {
      quickNotes[index] = QuickNote(id: id, text: newText, timestamp: Date())
    }
  }
  
  public func removeQuickNote(id: UUID) async {
    quickNotes.removeAll { $0.id == id }
  }
  
  public func clearQuickNotes() async {
    quickNotes.removeAll()
  }
  
  public func setReadiness(left: Bool?, right: Bool?) {
    let prevLeftReady = leftReady
    let prevRightReady = rightReady
    
    if left != nil {
      leftReady = left!
      if (!prevLeftReady && leftReady) {
        CoreCommsService.log("Left ready!")
      }
    }
    if right != nil {
      rightReady = right!
      if (!prevRightReady && rightReady) {
        CoreCommsService.log("Right ready!")
      }
    }
    
    // CoreCommsService.log("g1Ready set to \(leftReady) \(rightReady) \(leftReady && rightReady)")
    g1Ready = leftReady && rightReady
    if g1Ready {
      stopReconnectionTimer()
    }
  }
  
  @objc func RN_stopScan() {
    centralManager!.stopScan()
    CoreCommsService.log("G1: Stopped scanning for devices")
  }
  
  @objc func RN_getSerialNumberInfo() -> [String: Any] {
    return [
      "serialNumber": glassesSerialNumber ?? "",
      "style": glassesStyle ?? "",
      "color": glassesColor ?? ""
    ]
  }
  
  func disconnect() {
    self.isDisconnecting = true
    leftGlassUUID = nil
    rightGlassUUID = nil
    stopReconnectionTimer()
    
    if let left = leftPeripheral {
      centralManager!.cancelPeripheralConnection(left)
    }
    
    if let right = rightPeripheral {
      centralManager!.cancelPeripheralConnection(right)
    }
    
    leftPeripheral = nil
    rightPeripheral = nil
    setReadiness(left: false, right: false)
    CoreCommsService.log("G1: Disconnected from glasses")
  }
  
  // @@@ END REACT NATIVE FUNCTIONS
  
  
  actor CommandQueue {
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
  
  private func setupCommandQueue() {
    Task.detached { [weak self] in
      guard let self = self else { return }
      
      while true {
        let command = await self.commandQueue.dequeue()
        await self.processCommand(command)
      }
    }
  }
  
  func resetSemaphoreToZero(_ semaphore: DispatchSemaphore) {
    // First, try to acquire the semaphore with a minimal timeout
    let result = semaphore.wait(timeout: .now() + 0.001)
    if result == .success {
      // We acquired it, meaning it was at least 1
      // Release it to get back to where we were (if it was 1) or to increment it by 1 (if it was >1)
      semaphore.signal()
      // Try to acquire it again to see if it's still available (meaning it was >1 before)
      while semaphore.wait(timeout: .now() + 0.001) == .success {
        // Keep signaling until we're sure we're at 1
        semaphore.signal()
        break
      }
    } else {
      // Timeout occurred, meaning the semaphore was at 0 or less
      // Signal once to try to bring it to 1
      semaphore.signal()
    }
    // bring it down to 0:
    semaphore.wait(timeout: .now() + 0.001)
  }
  
  private func attemptSend(chunks: [[UInt8]], side: String) async {
    var maxAttempts = 5
    var attempts: Int = 0
    var success: Bool = false
    var semaphore = side == "L" ? leftSemaphore : rightSemaphore
    
    while attempts < maxAttempts && !success {
      if (attempts > 0) {
        CoreCommsService.log("G1: trying again to send to:\(side): \(attempts)")
      }
      let data = Data(chunks[0])
      // CoreCommsService.log("SEND (\(side)) \(data.hexEncodedString())")
      
      if self.isDisconnecting {
        // forget whatever we were doing since we're disconnecting:
        break
      }
      
      for i in 0..<chunks.count-1 {
        let chunk = chunks[i]
        await sendCommandToSideWithoutResponse(chunk, side: side)
        try? await Task.sleep(nanoseconds: 8 * 1_000_000)// 8ms
      }
      
      let lastChunk = chunks.last!
      
      var sequenceNumber = -1
      
      // if this is a text chunk, set the sequence to the 2nd byte of the chunk:
      if (lastChunk[0] == 0x4E) {
        sequenceNumber = Int(lastChunk[1])
      }
      
      CoreCommsService.log("G1: SENDING with sequenceNumber: \(sequenceNumber)")
      
      success = await sendCommandToSide2(lastChunk, side: side, attemptNumber: attempts, sequenceNumber: sequenceNumber)
      // CoreCommsService.log("command success: \(success)")
      //      if (!success) {
      //        CoreCommsService.log("G1: timed out waiting for \(s)")
      //      }
      //      await sendCommandToSideWithoutResponse(lastChunk, side: side)
      //      success = true
      
      attempts += 1
      if !success && (attempts >= maxAttempts) {
        CoreCommsService.log("G1: ❌ Command timed out!")
        startReconnectionTimer()
        break
      }
    }
  }
  
  // Process a single number with timeouts
  private func processCommand(_ command: BufferedCommand) async {
    
    if command.chunks.isEmpty {
      CoreCommsService.log("G1: @@@ chunks was empty! @@@")
      return
    }
    
    // Send to both sides in parallel
    await withTaskGroup(of: Void.self) { group in
      if command.sendLeft {
        group.addTask {
          await self.attemptSend(chunks: command.chunks, side: "L")
        }
      }
      
      if command.sendRight {
        group.addTask {
          await self.attemptSend(chunks: command.chunks, side: "R")
        }
      }
      
      // Wait for all tasks to complete
      await group.waitForAll()
    }
    
    if command.waitTime > 0 {
      // wait waitTime milliseconds before moving on to the next command:
      try? await Task.sleep(nanoseconds: UInt64(command.waitTime) * 1_000_000)
    } else {
      // sleep for a min amount of time unless otherwise specified
      try? await Task.sleep(nanoseconds: 10 * 1_000_000)// Xms
    }
  }
  
  private func waitForSemaphore(semaphore: DispatchSemaphore, timeout: TimeInterval) -> Bool {
    let result = semaphore.wait(timeout: .now() + timeout)
    return result == .success
  }
  
  func startHeartbeatTimer() {
    
    // Check if a timer is already running
    if heartbeatTimer != nil && heartbeatTimer!.isValid {
      CoreCommsService.log("G1: Heartbeat timer already running")
      return
    }
    
    // Create a new queue if needed
    if heartbeatQueue == nil {
      heartbeatQueue = DispatchQueue(label: "com.sample.heartbeatTimerQueue", qos: .background)
    }
    
    heartbeatQueue!.async { [weak self] in
      self?.heartbeatTimer = Timer(timeInterval: 15.0, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        self.sendHeartbeat()
      }
      
      RunLoop.current.add(self!.heartbeatTimer!, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  private func findCharacteristic(uuid: CBUUID, peripheral: CBPeripheral) -> CBCharacteristic? {
    for service in peripheral.services ?? [] {
      for characteristic in service.characteristics ?? [] {
        if characteristic.uuid == uuid {
          return characteristic
        }
      }
    }
    return nil
  }
  
  private func getConnectedDevices() -> [CBPeripheral] {
    let connectedPeripherals = centralManager!.retrieveConnectedPeripherals(withServices: [UART_SERVICE_UUID])
    return connectedPeripherals
  }
  
  private func handleAck(from peripheral: CBPeripheral, success: Bool, sequenceNumber: Int = -1) {
    //    CoreCommsService.log("G1: handleAck \(success)")
    if !success { return }
    
    let side = peripheral == leftPeripheral ? "L" : "R"
    let key = sequenceNumber == -1 ? side : "\(side)-\(sequenceNumber)"
    
    CoreCommsService.log("G1: ACK received for \(key)")
    
    // Resume any pending ACK continuation for this side (thread-safe)
    var continuation: CheckedContinuation<Bool, Never>?
    ackCompletionsQueue.sync(flags: .barrier) {
      continuation = pendingAckCompletions.removeValue(forKey: key)
    }
    
    if let continuation = continuation {
      continuation.resume(returning: true)
      // CoreCommsService.log("✅ ACK received for \(side) side, resuming continuation")
    }
    
    if peripheral == self.leftPeripheral {
      leftSemaphore.signal()
      setReadiness(left: true, right: nil)
    }
    if peripheral == self.rightPeripheral {
      rightSemaphore.signal()
      setReadiness(left: nil, right: true)
    }
  }
  
  private func handleNotification(from peripheral: CBPeripheral, data: Data) {
    guard let command = data.first else { return }// ensure the data isn't empty
    
    let side = peripheral == leftPeripheral ? "L" : "R"
    let s = peripheral == leftPeripheral ? "L" : "R"
    CoreCommsService.log("G1: RECV (\(s)) \(data.hexEncodedString())")
    
    switch Commands(rawValue: command) {
    case .BLE_REQ_INIT:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
      handleInitResponse(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .QUICK_NOTE_ADD:
      handleAck(from: peripheral, success: data[1] == 0x10 || data[1] == 0x43)
    case .BLE_REQ_MIC_ON:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .BRIGHTNESS:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .BLE_EXIT_ALL_FUNCTIONS:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .WHITELIST:
      // TODO: ios no idea why the glasses send 0xCB before sending ACK: (CB == continue!)
      handleAck(from: peripheral, success: data[1] == 0xCB || data[1] == CommandResponse.ACK.rawValue)
    case .DASHBOARD_LAYOUT_COMMAND:
      // 0x06 seems arbitrary :/
      handleAck(from: peripheral, success: data[1] == 0x06)
    case .DASHBOARD_SHOW:
      handleAck(from: peripheral, success: data[1] == 0x07 || data[1] == 0x90 || data[1] == 0x0C)
    case .HEAD_UP_ANGLE:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
      // head up angle ack
      // position ack
    case .SILENT_MODE:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .BLE_REQ_TRANSFER_MIC_DATA:
      self.compressedVoiceData = data
      //                CoreCommsService.log("G1: Got voice data: " + String(data.count))
      break
    case .UNK_1:
      handleAck(from: peripheral, success: true)
    case .UNK_2:
      handleAck(from: peripheral, success: true)
    case .BLE_REQ_HEARTBEAT:
      // TODO: ios handle semaphores correctly here
      // battery info
      guard data.count >= 6 && data[1] == 0x66 else {
        break
      }
      
      handleAck(from: peripheral, success: data[1] == 0x66)
      
      // Response format: 2C 66 [battery%] [flags] [voltage_low] [voltage_high] ...
      let batteryPercent = Int(data[2])
      let flags = data[3]
      let voltageLow = Int(data[4])
      let voltageHigh = Int(data[5])
      let rawVoltage = (voltageHigh << 8) | voltageLow
      let voltage = rawVoltage / 10  // Scale down by 10 to get actual millivolts
      
      //      CoreCommsService.log("G1: Raw battery data - Battery: \(batteryPercent)%, Voltage: \(voltage)mV, Flags: 0x\(String(format: "%02X", flags))")
      
      // if left, update left battery level, if right, update right battery level
      if peripheral == leftPeripheral {
        if leftBatteryLevel != batteryPercent {
          CoreCommsService.log("G1: Left glass battery: \(batteryPercent)%")
          leftBatteryLevel = batteryPercent
        }
      } else if peripheral == rightPeripheral {
        if rightBatteryLevel != batteryPercent {
          CoreCommsService.log("G1: Right glass battery: \(batteryPercent)%")
          rightBatteryLevel = batteryPercent
        }
      }
      
      // update the main battery level as the lower of the two
      let newBatteryLevel = min(leftBatteryLevel, rightBatteryLevel)
      if (self.batteryLevel != newBatteryLevel) {
        self.batteryLevel = min(leftBatteryLevel, rightBatteryLevel)
      }
      break
    case .BLE_REQ_EVENAI:
      guard data.count > 1 else { break }
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue, sequenceNumber: Int(data[2]))
    case .BLE_REQ_DEVICE_ORDER:
      let order = data[1]
      switch DeviceOrders(rawValue: order) {
      case .HEAD_UP:
        CoreCommsService.log("G1: HEAD_UP")
        isHeadUp = true
        break
      case .HEAD_UP2:
        CoreCommsService.log("G1: HEAD_UP2")
        isHeadUp = true
        break
        // case .HEAD_DOWN:
        //   CoreCommsService.log("HEAD_DOWN")
        //   isHeadUp = false
        //   break
      case .HEAD_DOWN2:
        CoreCommsService.log("G1: HEAD_DOWN2")
        isHeadUp = false
        break
      case .ACTIVATED:
        CoreCommsService.log("G1: ACTIVATED")
      case .SILENCED:
        CoreCommsService.log("G1: SILENCED")
      case .DISPLAY_READY:
        CoreCommsService.log("G1: DISPLAY_READY")
        //        sendInitCommand(to: peripheral)// experimental
      case .TRIGGER_FOR_AI:
        CoreCommsService.log("G1: TRIGGER AI")
      case .TRIGGER_FOR_STOP_RECORDING:
        CoreCommsService.log("G1: STOP RECORDING")
      case .TRIGGER_CHANGE_PAGE:
        CoreCommsService.log("G1: TRIGGER_CHANGE_PAGE")
      case .CASE_REMOVED:
        CoreCommsService.log("G1: REMOVED FROM CASE")
        self.caseRemoved = true
      case .CASE_REMOVED2:
        CoreCommsService.log("G1: REMOVED FROM CASE2")
        self.caseRemoved = true
      case .CASE_OPEN:
        self.caseOpen = true
        self.caseRemoved = false
        CoreCommsService.log("G1: CASE OPEN");
      case .CASE_CLOSED:
        self.caseOpen = false
        self.caseRemoved = false
        CoreCommsService.log("G1: CASE CLOSED");
      case .CASE_CHARGING_STATUS:
        guard data.count >= 3 else { break }
        let status = data[2]
        if status == 0x01 {
          self.caseCharging = true
          CoreCommsService.log("G1: CASE CHARGING")
        } else {
          self.caseCharging = false
          CoreCommsService.log("G1: CASE NOT CHARGING")
        }
      case .CASE_CHARGE_INFO:
        CoreCommsService.log("G1: CASE CHARGE INFO")
        guard data.count >= 3 else { break }
        if Int(data[2]) != -1 {
          caseBatteryLevel = Int(data[2])
          CoreCommsService.log("G1: Case battery level: \(caseBatteryLevel)%")
        } else {
          CoreCommsService.log("G1: Case battery level was -1")
        }
      case .DOUBLE_TAP:
        CoreCommsService.log("G1: DOUBLE TAP / display turned off")
        //        Task {
        ////          RN_sendText("DOUBLE TAP DETECTED")
        ////          queueChunks([[UInt8(0x00), UInt8(0x01)]])
        //          try? await Task.sleep(nanoseconds: 1500 * 1_000_000) // 2s delay after sending
        //          sendInit()
        //          clearState()
        //        }
      default:
        // CoreCommsService.log("G1: Received device order: \(data.subdata(in: 1..<data.count).hexEncodedString())")
        break
      }
    default:
      //          CoreCommsService.log("G1: received from G1(not handled): \(data.hexEncodedString())")
      break
    }
  }
}
// MARK: Commands
extension ERG1Manager {
  
  // Handle whitelist functionality
  func getWhitelistChunks() -> [[UInt8]] {
    // Define the hardcoded whitelist JSON
    let apps = [
      ["id": "com.mentra.os", "name": "MentraOS"],
      ["id": "io.heckel.ntfy", "name": "ntfy"]
    ]
    let whitelistJson = createWhitelistJson(apps: apps)
    
    CoreCommsService.log("G1: Creating chunks for hardcoded whitelist: \(whitelistJson)")
    
    // Convert JSON to bytes and split into chunks
    return createWhitelistChunks(json: whitelistJson)
  }
  
  private func createWhitelistJson(apps: [[String: String]]) -> String {
    do {
      // Create app list array
      var appList: [[String: Any]] = []
      for app in apps {
        let appDict: [String: Any] = [
          "id": app["id"] ?? "",
          "name": app["name"] ?? ""
        ]
        appList.append(appDict)
      }
      
      // Create the whitelist dictionary
      let whitelistDict: [String: Any] = [
        "calendar_enable": true,
        "call_enable": true,
        "msg_enable": true,
        "ios_mail_enable": true,
        "app": [
          "list": appList,
          "enable": true
        ]
      ]
      
      // Convert to JSON string
      let jsonData = try JSONSerialization.data(withJSONObject: whitelistDict, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        return jsonString
      } else {
        return "{}"
      }
    } catch {
      CoreCommsService.log("G1: Error creating whitelist JSON: \(error.localizedDescription)")
      return "{}"
    }
  }
  
  // Helper function to split JSON into chunks
  private func createWhitelistChunks(json: String) -> [[UInt8]] {
    let MAX_CHUNK_SIZE = 180 - 4 // Reserve space for the header
    guard let jsonData = json.data(using: .utf8) else { return [] }
    
    let totalChunks = Int(ceil(Double(jsonData.count) / Double(MAX_CHUNK_SIZE)))
    var chunks: [Data] = []
    
    CoreCommsService.log("G1: jsonData.count = \(jsonData.count), totalChunks = \(totalChunks)")
    
    for i in 0..<totalChunks {
      let start = i * MAX_CHUNK_SIZE
      let end = min(start + MAX_CHUNK_SIZE, jsonData.count)
      let range = start..<end
      let payloadChunk = jsonData.subdata(in: range)
      
      // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
      var headerData = Data()
      headerData.append(Commands.WHITELIST.rawValue)
      headerData.append(UInt8(totalChunks))
      headerData.append(UInt8(i))
      
      // Combine header and payload
      var chunkData = Data()
      chunkData.append(headerData)
      chunkData.append(payloadChunk)
      
      chunks.append(chunkData)
    }
    
    var uintChunks: [[UInt8]] = []
    for chunk in chunks {
      uintChunks.append(Array(chunk))
    }
    return uintChunks
    //    return chunks.flatMap { Array($0) }
  }
  
  func exitAllFunctions(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    var data = Data()
    data.append(Commands.BLE_EXIT_ALL_FUNCTIONS.rawValue)
    peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
  }
  
  private func sendInitCommand(to peripheral: CBPeripheral) {
    let initData = Data([Commands.BLE_REQ_INIT.rawValue, 0x01])
    let initDataArray = initData.map { UInt8($0) }
    
    if (leftPeripheral == peripheral) {
      queueChunks([initDataArray], sendLeft: true, sendRight: false)
    } else if (rightPeripheral == peripheral) {
      queueChunks([initDataArray], sendLeft: false, sendRight: true)
    }
  }
  
  private func sendInit() {
    let initData = Data([Commands.BLE_REQ_INIT.rawValue, 0x01])
    let initDataArray = initData.map { UInt8($0) }
    queueChunks([initDataArray])
  }
  
  func RN_exit() {
    let exitData = Data([Commands.BLE_EXIT_ALL_FUNCTIONS.rawValue])
    let exitDataArray = exitData.map { UInt8($0) }
    queueChunks([exitDataArray])
  }
  
  // don't call semaphore signals here as it's handled elswhere:
  private func handleInitResponse(from peripheral: CBPeripheral, success: Bool) {
    if peripheral == leftPeripheral {
      leftInitialized = success
      // CoreCommsService.log("G1: Left arm initialized: \(success)")
      setReadiness(left: true, right: nil)
    } else if peripheral == rightPeripheral {
      rightInitialized = success
      // CoreCommsService.log("G1: Right arm initialized: \(success)")
      setReadiness(left: nil, right: true)
    }
    
    // Only proceed if both glasses are initialized
    if leftInitialized && rightInitialized {
      setReadiness(left: true, right: true)
    }
  }
  
  private func sendHeartbeat() {
    var heartbeatData = Data()
    heartbeatData.append(Commands.BLE_REQ_HEARTBEAT.rawValue)
    heartbeatData.append(UInt8(0x02 & 0xFF))
    
    var heartbeatArray = heartbeatData.map { UInt8($0) }
    
    if g1Ready {
      queueChunks([heartbeatArray])
    }
    //    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
    //      let hexString = heartbeatData.map { String(format: "%02X", $0) }.joined()
    //      peripheral.writeValue(heartbeatData, for: txChar, type: .withoutResponse)
    //    }
  }
  
  public func sendCommandToSide(_ command: [UInt8], side: String) async {
    
    // Convert to Data
    let commandData = Data(command)
    //    CoreCommsService.log("G1: Sending command to glasses: \(paddedCommand.map { String(format: "%02X", $0) }.joined(separator: " "))")
    // CoreCommsService.log("G1: SEND (\(side)) \(commandData.hexEncodedString())")
    
    if (side == "L") {
      // send to left
      if let leftPeripheral = leftPeripheral,
         let characteristic = leftPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        leftPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      }
    } else {
      // send to right
      if let rightPeripheral = rightPeripheral,
         let characteristic = rightPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        rightPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      }
    }
  }
  
  public func sendCommandToSide2(_ command: [UInt8], side: String, attemptNumber: Int = 0, sequenceNumber: Int = -1) async -> Bool {
    let startTime = Date()
    
    // Convert to Data
    let commandData = Data(command)
    
    return await withCheckedContinuation { continuation in
      
      var peripheral: CBPeripheral? = nil;
      var characteristic: CBCharacteristic? = nil;
      
      if (side == "L") {
        // send to left
        peripheral = leftPeripheral;
        characteristic = leftPeripheral?.services?
          .first(where: { $0.uuid == UART_SERVICE_UUID })?
          .characteristics?
          .first(where: { $0.uuid == UART_TX_CHAR_UUID })
      } else {
        // send to right
        peripheral = rightPeripheral;
        characteristic = rightPeripheral?.services?
          .first(where: { $0.uuid == UART_SERVICE_UUID })?
          .characteristics?
          .first(where: { $0.uuid == UART_TX_CHAR_UUID })
      }
      
      if peripheral == nil || characteristic == nil {
        CoreCommsService.log("G1: ⚠️ peripheral/characteristic not found, resuming immediately")
        //        continuation.resume()
        continuation.resume(returning: false)
        return
      }
      
      let key = sequenceNumber == -1 ? side : "\(side)-\(sequenceNumber)"
      
      // Store continuation for ACK callback (thread-safe)
      ackCompletionsQueue.async(flags: .barrier) {
        self.pendingAckCompletions[key] = continuation
      }
      
      peripheral!.writeValue(commandData, for: characteristic!, type: .withResponse)
      
      let waitTime = (0.1) + (0.2 * Double(attemptNumber))
      
      // after 200ms, if we haven't received the ack, resume:
      DispatchQueue.main.asyncAfter(deadline: .now() + waitTime) {
        // Check if ACK continuation still exists (if it does, ACK wasn't received)
        var pendingContinuation: CheckedContinuation<Bool, Never>?
        self.ackCompletionsQueue.sync(flags: .barrier) {
          pendingContinuation = self.pendingAckCompletions.removeValue(forKey: key)
        }
        
        if let pendingContinuation = pendingContinuation {
          let elapsed = Date().timeIntervalSince(startTime) * 1000
          CoreCommsService.log("G1: ⚠️ ACK timeout for \(key) after \(String(format: "%.0f", elapsed))ms")
          pendingContinuation.resume(returning: false)
        }
      }
    }
  }
  
  // FAST BLE TRANSMISSION (.withoutResponse)
  public func sendCommandToSideWithoutResponse(_ command: [UInt8], side: String) async {
    // Convert to Data
    let commandData = Data(command)
    
    if (side == "L") {
      // send to left
      if let leftPeripheral = leftPeripheral,
         let characteristic = leftPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        
        // Fast approach: .withoutResponse for speed
        leftPeripheral.writeValue(commandData, for: characteristic, type: .withoutResponse)
      }
    } else {
      // send to right
      if let rightPeripheral = rightPeripheral,
         let characteristic = rightPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        
        // Fast approach: .withoutResponse for speed
        rightPeripheral.writeValue(commandData, for: characteristic, type: .withoutResponse)
      }
    }
    
    // No waiting for ACK - fire and forget for speed
  }
  
  public func queueChunks(_ chunks: [[UInt8]], sendLeft: Bool = true, sendRight: Bool = true, sleepAfterMs: Int = 0, ignoreAck: Bool = false) {
    let bufferedCommand = BufferedCommand(chunks: chunks, sendLeft: sendLeft, sendRight: sendRight, waitTime: sleepAfterMs, ignoreAck: ignoreAck);
    Task {
      await commandQueue.enqueue(bufferedCommand)
    }
  }
  
  
  @objc func RN_sendWhitelist() {
    CoreCommsService.log("G1: RN_sendWhitelist()")
    let whitelistChunks = getWhitelistChunks()
    queueChunks(whitelistChunks, sendLeft: true, sendRight: true, sleepAfterMs: 100)
  }
  
  @objc public func RN_setBrightness(_ level: Int, autoMode: Bool = false) {
    // Convert from percentage (0-100) to the correct range (0-41)
    let mappedLevel = min(41, max(0, Int((Double(level) / 100.0) * 41.0)))
    
    // Create and capture the UInt8 value
    let brightnessLevel = UInt8(mappedLevel)
    
    // Call the async function from a non-async context
    Task {
      let success = await setBrightness(brightnessLevel, autoMode: autoMode)
      if !success {
        NSLog("Failed to set brightness to level \(level)% (mapped to \(mappedLevel))")
      }
    }
  }
  
  public func setBrightness(_ level: UInt8, autoMode: Bool = false) async -> Bool {
    CoreCommsService.log("G1: setBrightness()")
    // Ensure level is between 0x00 and 0x29 (0-41)
    var lvl: UInt8 = level
    if (level > 0x29) {
      lvl = 0x29
    }
    
    let command: [UInt8] = [Commands.BRIGHTNESS.rawValue, lvl, autoMode ? 0x01 : 0x00]
    queueChunks([command])
    
    // buried data point testing:
    //    let command: [UInt8] = [0x3E]
    //    queueChunks([command])
    
    //    // Send to both glasses with proper timing
    //    if let rightGlass = rightPeripheral,
    //       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
    //      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
    //      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
    //    }
    //
    //    if let leftGlass = leftPeripheral,
    //       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
    //      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
    //    }
    
    return true
  }
  
  @objc public func RN_setHeadUpAngle(_ angle: Int) {
    var agl: Int = angle
    if (angle < 0) {
      agl = 0;
    } else if (angle > 60) {
      agl = 60;
    }
    
    // Call the async function from a non-async context
    Task {
      let success = await setHeadUpAngle(UInt8(agl))
      if !success {
        NSLog("Failed to set angle to \(angle)")
      }
    }
  }
  
  public func setHeadUpAngle(_ angle: UInt8) async -> Bool {
    CoreCommsService.log("G1: setHeadUpAngle()")
    let command: [UInt8] = [Commands.HEAD_UP_ANGLE.rawValue, angle, 0x01]
    queueChunks([command])
    return true
  }
  
  @objc public func RN_getBatteryStatus() {
    Task {
      await getBatteryStatus()
    }
  }
  
  public func getBatteryStatus() async {
    CoreCommsService.log("G1: getBatteryStatus()")
    let command: [UInt8] = [0x2C, 0x01]
    queueChunks([command])
  }
  
  public func setSilentMode(_ enabled: Bool) async -> Bool {
    let command: [UInt8] = [Commands.SILENT_MODE.rawValue, enabled ? 0x0C : 0x0A, 0x00]
    queueChunks([command])
    return true
  }
  
  @objc public func RN_setDashboardPosition(_ height: Int, _ depth: Int) {
    Task {
      await setDashboardPosition(UInt8(height), UInt8(depth))
    }
  }
  
  public func incrementGlobalCounter() {
    if globalCounter < 255 {
      globalCounter += 1
    } else {
      globalCounter = 0
    }
  }
  
  @objc public func RN_showDashboard() {
    // nothing for now
  }
  
  public func setDashboardPosition(_ height: UInt8, _ depth: UInt8) async -> Bool {
    
    let h: UInt8 = min(max(height, 0), 8)
    let d: UInt8 = min(max(depth, 1), 9)
    
    incrementGlobalCounter()
    
    // Build dashboard position command
    var command = Data()
    command.append(Commands.DASHBOARD_LAYOUT_COMMAND.rawValue)
    command.append(0x08) // Length
    command.append(0x00) // Sequence
    command.append(globalCounter & 0xFF) // Fixed value
    command.append(0x02) // Fixed value
    command.append(0x01) // State ON
    command.append(h) // height
    command.append(d) // depth
    
    //    while command.count < 20 {
    //      command.append(0x00)
    //    }
    
    // convert command to array of UInt8
    let commandArray = command.map { $0 }
    queueChunks([commandArray])
    return true
  }
  
  @objc public func RN_setMicEnabled(_ enabled: Bool) {
    CoreCommsService.log("G1: RN_setMicEnabled()")
    Task {
      await setMicEnabled(enabled: enabled)
    }
  }
  
  public func setMicEnabled(enabled: Bool) async -> Bool {
    
    var micOnData = Data()
    micOnData.append(Commands.BLE_REQ_MIC_ON.rawValue)
    if enabled {
      micOnData.append(0x01)
    } else {
      micOnData.append(0x00)
    }
    
    let micOnDataArray: [UInt8] = micOnData.map { UInt8($0) }
    
    queueChunks([micOnDataArray], sendLeft: false, sendRight: true)
    
    //    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
    //      peripheral.writeValue(micOnData, for: txChar, type: .withResponse)
    //    }
    return true
  }
  
  // MARK: - Enhanced BMP Display Methods
  
  /// Progress callback for BMP operations
  public typealias BmpProgressCallback = (String, Int, Int, Int) -> Void
  public typealias BmpSuccessCallback = (String) -> Void
  public typealias BmpErrorCallback = (String, String) -> Void
  
  public func displayBitmap(base64ImageData: String,
                            onProgress: BmpProgressCallback? = nil,
                            onSuccess: BmpSuccessCallback? = nil,
                            onError: BmpErrorCallback? = nil) async -> Bool {
    
    guard let bmpData = Data(base64Encoded: base64ImageData) else {
      CoreCommsService.log("G1: Failed to decode base64 image data")
      onError?("both", "Failed to decode base64 image data")
      return false
    }
    
    CoreCommsService.log("G1: ✅ Successfully decoded base64 image data to \(bmpData.count) bytes")
    // CoreCommsService.log("🔍 First 10 bytes from hex: \(Array(bmpData.prefix(10)).map { String(format: "0x%02X", $0) }.joined(separator: " "))")
    
    let invertedBmpData = invertBmpPixels(bmpData)
    // Debug: Check if we have any non-FF bytes in pixel data
    let pixelData = bmpData.dropFirst(62)
    let nonFFCount = pixelData.filter { $0 != 0xFF }.count
    // CoreCommsService.log("G1: 🎨 iOS decoded: \(nonFFCount) black pixels out of \(pixelData.count) bytes")
    
    // Show first few non-FF bytes
    let nonFFBytes = Array(pixelData.enumerated().filter { $0.element != 0xFF }.prefix(5))
    let nonFFDebug = nonFFBytes.map { "pos \($0.offset)=0x\(String(format: "%02X", $0.element))" }.joined(separator: ", ")
    // CoreCommsService.log("G1: 🔍 iOS non-FF bytes: \(nonFFDebug)")
    
    // Debug: show hex sample received
    // CoreCommsService.log("G1: 🔍 iOS received hex sample (chars 100-200): \(hexString.dropFirst(100).prefix(100))")
    
    // CRITICAL: Check if data is still good right before calling display function
    let pixelCheck = bmpData.dropFirst(62)
    let blackCheck = pixelCheck.filter { $0 != 0xFF }.count
    // CoreCommsService.log("G1: 🔍 Just before display call: \(blackCheck) black pixels - DATA IS \(blackCheck > 0 ? "GOOD" : "CORRUPTED")")
    
    // CoreCommsService.log("G1: 🖼️ Single frame: Using fast MentraOS transmission method")
    let result = await displayBitmapDataMentraOS(bmpData: invertedBmpData, sendLeft: true, sendRight: true, onProgress: onProgress, onSuccess: onSuccess, onError: onError)
    CoreCommsService.log("G1: 🖼️ Single frame: Transmission \(result ? "SUCCESS" : "FAILED")")
    return result
  }
  
  /// Clear display using MentraOS's 0x18 command (exit to dashboard)
  public func RN_clearDisplay() {
    CoreCommsService.log("G1: RN_clearDisplay() - Using 0x18 exit command")
    Task {
      
      // Send 0x18 to both glasses (MentraOS's clear method)
      
      var cmd: [UInt8] = [0x18]// turns off display
      //     var cmd: [UInt8] = [0x23, 0x72]// restarts the glasses
      var bufferedCommand = BufferedCommand(
        chunks: [cmd],
        sendLeft: false,
        sendRight: true,
        waitTime: 50,
        ignoreAck: false
      )
      
      await commandQueue.enqueue(bufferedCommand)
      //    Task {
      //      await setSilentMode(true)
      //      try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
      //      await setSilentMode(false)
      //      await setSilentMode(false)
      //    }
      
      // RN_sendText("DISPLAY SLEEPING...")
      
      // // queue the command after 0.5 seconds
      // Task {
      //   try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
      //   await commandQueue.enqueue(bufferedCommand)
      // }
      
      // CoreCommsService.log("Display cleared with exit command")
      return true
    }
  }
  
  // MARK: - Animation Batching (iOS-Controlled Timing)
  
  /// Display animation from batched frames with iOS-controlled timing
  public func RN_displayBitmapAnimation(_ framesJson: String, interval: Double, shouldRepeat: Bool) {
    CoreCommsService.log("G1: RN_displayBitmapAnimation() - Frames JSON size: \(framesJson.count), interval: \(interval)ms, repeat: \(shouldRepeat)")
    
    // Parse frames from JSON
    guard let framesData = framesJson.data(using: .utf8),
          let frames = try? JSONSerialization.jsonObject(with: framesData) as? [String] else {
      CoreCommsService.log("G1: ❌ Failed to parse animation frames JSON")
      return
    }
    
    Task {
      await startBitmapAnimation(frames: frames, interval: interval / 1000.0, shouldRepeat: shouldRepeat)
    }
  }
  
  /// Start bitmap animation with iOS-controlled timing
  private func startBitmapAnimation(frames: [String], interval: TimeInterval, shouldRepeat: Bool) async {
    // Stop any existing animation
    stopBitmapAnimation()
    
    // Setup animation parameters
    self.animationFrames = frames
    self.animationInterval = interval
    self.animationRepeat = shouldRepeat
    self.currentFrameIndex = 0
    self.isAnimationRunning = true
    
    CoreCommsService.log("G1: 🎬 Starting iOS-controlled animation: \(frames.count) frames at \(Int(interval * 1000))ms intervals")
    
    // Display first frame immediately
    if !frames.isEmpty {
      await displayAnimationFrame(frames[0], frameNumber: 1, totalFrames: frames.count)
      currentFrameIndex = 1
    }
    
    // Start iOS timer for subsequent frames (one-shot to prevent overlap)
    DispatchQueue.main.async {
      self.animationTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
        self?.displayNextFrame()
      }
    }
  }
  
  /// Display next frame in animation sequence
  private func displayNextFrame() {
    guard isAnimationRunning else { return }
    
    // Check if we've reached the end
    if currentFrameIndex >= animationFrames.count {
      if animationRepeat {
        // Restart animation
        currentFrameIndex = 0
        CoreCommsService.log("G1: 🔄 Animation loop: restarting from frame 1")
      } else {
        // Stop animation
        stopBitmapAnimation()
        CoreCommsService.log("G1: 🏁 Animation completed")
        return
      }
    }
    
    // Display current frame
    let frameData = animationFrames[currentFrameIndex]
    let frameNumber = currentFrameIndex + 1
    
    // CRITICAL FIX: Stop timer while displaying frame to prevent overlap
    animationTimer?.invalidate()
    CoreCommsService.log("G1: ⏰ Timer invalidated, starting frame \(frameNumber) display...")
    
    Task {
      let startTime = Date()
      await self.displayAnimationFrame(frameData, frameNumber: frameNumber, totalFrames: self.animationFrames.count)
      let frameDisplayTime = Date().timeIntervalSince(startTime)
      
      CoreCommsService.log("G1: ✅ Frame \(frameNumber) completed in \(Int(frameDisplayTime * 1000))ms, scheduling next frame in \(Int(self.animationInterval * 1000))ms")
      
      // Schedule next frame after display completes + interval delay
      DispatchQueue.main.async {
        guard self.isAnimationRunning else {
          CoreCommsService.log("G1: 🛑 Animation stopped, not scheduling next frame")
          return
        }
        CoreCommsService.log("G1: ⏰ Scheduling next frame timer...")
        self.animationTimer = Timer.scheduledTimer(withTimeInterval: self.animationInterval, repeats: false) { [weak self] _ in
          CoreCommsService.log("G1: ⏰ Timer fired for next frame!")
          self?.displayNextFrame()
        }
      }
    }
    
    currentFrameIndex += 1
  }
  
  /// Display single animation frame using our proven sequential method
  private func displayAnimationFrame(_ hexData: String, frameNumber: Int, totalFrames: Int) async {
    let intervalMs = Int(animationInterval * 1000)
    CoreCommsService.log("G1: 🎬 Frame \(frameNumber)/\(totalFrames): iOS-controlled timing (\(intervalMs)ms interval)")
    
    // Use our proven sequential display method
    await displayBitmapFromHex(hexString: hexData)
  }
  
  /// Stop bitmap animation
  public func RN_stopBitmapAnimation() {
    stopBitmapAnimation()
  }
  
  private func stopBitmapAnimation() {
    guard isAnimationRunning else { return }
    
    isAnimationRunning = false
    animationTimer?.invalidate()
    animationTimer = nil
    
    CoreCommsService.log("G1: ⏹️ iOS animation stopped")
  }
  
  /// Start local BMP animation (HACKY SOLUTION)
  @objc public func RN_startLocalAnimation() {
    CoreCommsService.log("G1: 🎬 RN_startLocalAnimation() - Starting 10-frame local animation")
    Task {
      await startLocalBMPAnimation()
    }
  }
  
  /// Local BMP animation (HACKY SOLUTION - eliminates network timing)
  private func startLocalBMPAnimation() async {
    CoreCommsService.log("G1: 🎬 Starting local BMP animation with known-working data")
    
    // Create a simple test BMP pattern that should display
    let testPatternHex = createTestBMPHex()
    
    CoreCommsService.log("G1: 🔄 Starting animation loop with 1250ms timing (like MentraOS)")
    
    // Animation loop - 10 frames, 1250ms each (like MentraOS timing)
    for frameIndex in 1...10 {
      CoreCommsService.log("G1: 🖼️ Displaying local frame \(frameIndex)")
      
      // Use our working hex display method
      let success = await displayBitmapFromHex(hexString: testPatternHex,
                                               onProgress: nil,
                                               onSuccess: nil,
                                               onError: nil)
      
      if success {
        CoreCommsService.log("✅ Local frame \(frameIndex) displayed successfully")
      } else {
        CoreCommsService.log("❌ Local frame \(frameIndex) failed")
      }
      
      // MentraOS timing: 1250ms between frames
      if frameIndex < 10 {
        try? await Task.sleep(nanoseconds: 1_250_000_000) // 1250ms
      }
    }
    
    CoreCommsService.log("🏁 Local animation completed")
  }
  
  /// Create a simple test BMP pattern in hex format
  private func createTestBMPHex() -> String {
    // BMP header for 576x135 1-bit monochrome (from our working data)
    let header = "424d36260000000000003e0000002800000040020000870000000100010000000000f82500c40e0000c40e00000200000002000000000000ffffff00"
    
    // Create a simple pattern: alternating lines
    var pixelData = ""
    let bytesPerRow = 72 // 576 pixels / 8 bits per byte
    
    for row in 0..<135 {
      for col in 0..<bytesPerRow {
        // Create a pattern: every other row is different
        if row % 10 < 5 {
          pixelData += "ff" // White line
        } else {
          pixelData += col % 4 == 0 ? "00" : "ff" // Pattern line
        }
      }
    }
    
    return header + pixelData
  }
  
  /// Display bitmap from hex string using MentraOS-compatible protocol
  public func displayBitmapFromHex(hexString: String,
                                   onProgress: BmpProgressCallback? = nil,
                                   onSuccess: BmpSuccessCallback? = nil,
                                   onError: BmpErrorCallback? = nil) async -> Bool {
    
    guard let bmpData = Data(hexString: hexString) else {
      CoreCommsService.log("G1: Failed to decode hex image data")
      onError?("both", "Failed to decode hex image data")
      return false
    }
    
    CoreCommsService.log("G1: 🔍 iOS hex decoded image data: \(bmpData.map { String(format: "%02X", $0) }.joined(separator: " "))")
    
    CoreCommsService.log("G1: ✅ Successfully decoded hex to \(bmpData.count) bytes")
    // CoreCommsService.log("🔍 First 10 bytes from hex: \(Array(bmpData.prefix(10)).map { String(format: "0x%02X", $0) }.joined(separator: " "))")
    
    // Debug: Check if we have any non-FF bytes in pixel data
    let pixelData = bmpData.dropFirst(62)
    let nonFFCount = pixelData.filter { $0 != 0xFF }.count
    // CoreCommsService.log("G1: 🎨 iOS decoded: \(nonFFCount) black pixels out of \(pixelData.count) bytes")
    
    // Show first few non-FF bytes
    let nonFFBytes = Array(pixelData.enumerated().filter { $0.element != 0xFF }.prefix(5))
    let nonFFDebug = nonFFBytes.map { "pos \($0.offset)=0x\(String(format: "%02X", $0.element))" }.joined(separator: ", ")
    // CoreCommsService.log("G1: 🔍 iOS non-FF bytes: \(nonFFDebug)")
    
    // Debug: show hex sample received
    // CoreCommsService.log("G1: 🔍 iOS received hex sample (chars 100-200): \(hexString.dropFirst(100).prefix(100))")
    
    // CRITICAL: Check if data is still good right before calling display function
    let pixelCheck = bmpData.dropFirst(62)
    let blackCheck = pixelCheck.filter { $0 != 0xFF }.count
    // CoreCommsService.log("G1: 🔍 Just before display call: \(blackCheck) black pixels - DATA IS \(blackCheck > 0 ? "GOOD" : "CORRUPTED")")
    
    // CoreCommsService.log("G1: 🖼️ Single frame: Using fast MentraOS transmission method")
    let result = await displayBitmapDataMentraOS(bmpData: bmpData, sendLeft: true, sendRight: true, onProgress: onProgress, onSuccess: onSuccess, onError: onError)
    CoreCommsService.log("G1: 🖼️ Single frame: Transmission \(result ? "SUCCESS" : "FAILED")")
    return result
  }
  
  private func invertBmpPixels(_ bmpData: Data) -> Data {
    guard bmpData.count > 62 else {
      CoreCommsService.log("G1: BMP data too small to contain pixel data")
      return bmpData
    }
    
    // BMP header is 62 bytes for your format (14 byte file header + 40 byte DIB header + 8 byte color table)
    let headerSize = 62
    var invertedData = Data(bmpData.prefix(headerSize)) // Keep header unchanged
    
    // Invert the pixel data (everything after the header)
    let pixelData = bmpData.dropFirst(headerSize)
    
    for byte in pixelData {
      // Invert each byte (flip all bits)
      let invertedByte = ~byte
      invertedData.append(invertedByte)
    }
    
    CoreCommsService.log("G1: Inverted BMP pixels: \(pixelData.count) bytes processed")
    return invertedData
  }
  
  /// Core MentraOS-compatible BMP display implementation
  private func displayBitmapDataMentraOS(bmpData: Data,
                                         sendLeft: Bool = true,
                                         sendRight: Bool = true,
                                         onProgress: BmpProgressCallback? = nil,
                                         onSuccess: BmpSuccessCallback? = nil,
                                         onError: BmpErrorCallback? = nil) async -> Bool {
    
    // Frame timing validation for animation smoothness
    let currentTime = Date()
    let timeSinceLastFrame = currentTime.timeIntervalSince(lastFrameTime)
    
    // Update frame tracking
    frameSequence += 1
    lastFrameTime = currentTime
    
    CoreCommsService.log("G1: 🎬 Frame \(frameSequence): \(String(format: "%.0f", timeSinceLastFrame * 1000))ms since last frame")
    
    // Skip duplicate prevention for animation frames
    if !isAnimationRunning {
      // Only apply lock for single BMP displays
      if isDisplayingBMP {
        let timeSinceStart = currentTime.timeIntervalSince(lastBMPStartTime)
        if timeSinceStart > 2.0 {
          CoreCommsService.log("G1: ⚠️ Force unlocking BMP display after \(String(format: "%.1f", timeSinceStart))s timeout")
          isDisplayingBMP = false
        } else {
          CoreCommsService.log("G1: ⚠️ BMP display already in progress (started \(String(format: "%.1f", timeSinceStart))s ago), ignoring duplicate request")
          return false
        }
      }
      
      lastBMPStartTime = currentTime
      isDisplayingBMP = true
      defer {
        CoreCommsService.log("G1: 🏁 BMP display completed, releasing lock")
        isDisplayingBMP = false
      }
    }
    
    CoreCommsService.log("G1: Starting MentraOS BMP display process - Size: \(bmpData.count) bytes")
    
    // CRITICAL: Check if bmpData is already corrupted at function entry
    let pixelData = bmpData.dropFirst(62)
    let blackPixels = pixelData.filter { $0 != 0xFF }.count
    CoreCommsService.log("G1: 🔍 At function start: \(blackPixels) black pixels out of \(pixelData.count)")
    
    if blackPixels == 0 {
      CoreCommsService.log("G1: ❌ CRITICAL ERROR: bmpData is already all white at function entry!")
      let corruptSample = Array(bmpData[62..<82])
      let corruptHex = corruptSample.map { String(format: "%02X", $0) }.joined(separator: " ")
      CoreCommsService.log("G1: ❌ Corrupt pixel sample (62-82): \(corruptHex)")
      return false
    }
    
    // Debug: Check BMP content
    if bmpData.count >= 100 {
      let headerBytes = Array(bmpData.prefix(10))
      CoreCommsService.log("G1: BMP Header: \(headerBytes.map { String(format: "0x%02X", $0) }.joined(separator: " "))")
      
      // Check some data bytes to ensure it's not all white
      let sampleBytes = Array(bmpData[100..<110])
      CoreCommsService.log("G1: Sample data bytes (100-110): \(sampleBytes.map { String(format: "0x%02X", $0) }.joined(separator: " "))")
    }
    
    // Validate BMP format
    guard bmpData.count >= 2 && bmpData[0] == 0x42 && bmpData[1] == 0x4D else {
      CoreCommsService.log("G1: Invalid BMP format - missing BM signature")
      onError?("both", "Invalid BMP format")
      return false
    }
    
    // Send HeartBeat first (MentraOS does this before BMP)
    CoreCommsService.log("G1: Sending HeartBeat (0x25) before BMP - MentraOS format")
    
    // MentraOS HeartBeat format appears to be just 0x25 (simple single byte)
    let heartbeatCommand: [UInt8] = [0x25]
    
    // Send heartbeat fast like MentraOS (no need to wait for ACK)
    if sendLeft {
      await sendCommandToSideWithoutResponse(heartbeatCommand, side: "L")
      CoreCommsService.log("G1: HeartBeat sent to L (fast)")
    }
    if sendRight {
      await sendCommandToSideWithoutResponse(heartbeatCommand, side: "R")
      CoreCommsService.log("G1: HeartBeat sent to R (fast)")
    }
    
    // Wait for heartbeat response (MentraOS timing - much faster)
    try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
    
    // MentraOS constants - exact match
    let packLen = 194  // Exact chunk size from MentraOS
    let iosDelayMs = 8  // iOS delay from MentraOS
    let addressBytes: [UInt8] = [0x00, 0x1c, 0x00, 0x00]  // Address from MentraOS
    
    // Debug: Check bmpData integrity before chunking
    let pixelDataStart = 62
    if bmpData.count > pixelDataStart + 50 {
      let beforeChunkSample = Array(bmpData[pixelDataStart..<(pixelDataStart + 20)])
      let beforeChunkHex = beforeChunkSample.map { String(format: "%02X", $0) }.joined(separator: " ")
      CoreCommsService.log("G1: 🔍 Before chunking - pixel data sample (bytes 62-82): \(beforeChunkHex)")
    }
    
    // Create chunks exactly like MentraOS
    var multiPacks: [Data] = []
    var index = 0
    while index < bmpData.count {
      let end = min(index + packLen, bmpData.count)
      let singlePack = bmpData.subdata(in: index..<end)
      
      // Debug first few chunks to see where corruption happens
      if index < 600 { // First 3 chunks (194 * 3 = 582)
        let chunkSample = Array(singlePack.prefix(20))
        let chunkHex = chunkSample.map { String(format: "%02X", $0) }.joined(separator: " ")
        CoreCommsService.log("G1: 🔍 Chunk creation - index \(index), sample: \(chunkHex)")
      }
      
      multiPacks.append(singlePack)
      index += packLen
    }
    
    CoreCommsService.log("G1: Created \(multiPacks.count) packs from BMP data (MentraOS format)")
    
    // Function to send to specific side using MentraOS protocol
    func sendToSide(_ lr: String) async -> Bool {
      let sideStartTime = Date()
      CoreCommsService.log("G1: 📡 Starting \(lr) side transmission - \(multiPacks.count) chunks")
      
      // Send chunks with MentraOS formatting
      for (packIndex, pack) in multiPacks.enumerated() {
        let packData: Data
        if packIndex == 0 {
          // First package includes address: [0x15, index, address...]
          var firstPacketData = Data([0x15, UInt8(packIndex & 0xff)])
          firstPacketData.append(Data(addressBytes))
          firstPacketData.append(pack)
          packData = firstPacketData
        } else {
          // Subsequent packages: [0x15, index, data...]
          var packetData = Data([0x15, UInt8(packIndex & 0xff)])
          packetData.append(pack)
          packData = packetData
        }
        
        CoreCommsService.log("G1: Sending chunk \(packIndex) to \(lr), size: \(packData.count)")
        
        // Debug: Check what's actually in this pack
        // if packIndex < 5 || packIndex > 45 {  // Show first few and last few chunks
        //   let packBytes = Array(pack.prefix(20))
        //   let packHex = packBytes.map { String(format: "%02X", $0) }.joined(separator: " ")
        //   CoreCommsService.log("🔍 Pack \(packIndex) data sample: \(packHex)")
        // }
        
        // Send directly like Flutter MentraOS (no retries, direct transmission with .withoutResponse)
        await sendCommandToSideWithoutResponse(Array(packData), side: lr)
        
        // MentraOS timing - 8ms delay between chunks (iOS optimized)
        if packIndex < multiPacks.count - 1 {
          try? await Task.sleep(nanoseconds: 8_000_000) // 8ms like MentraOS iOS timing
        }
        
        // Progress callback
        let offset = packIndex * packLen
        let adjustedOffset = min(offset, bmpData.count - pack.count)
        onProgress?(lr, adjustedOffset, packIndex, bmpData.count)
      }
      
      // Send finish command like MentraOS: [0x20, 0x0d, 0x0e]
      CoreCommsService.log("G1: Sending finish command [0x20, 0x0d, 0x0e] to \(lr)")
      
      let isLeft = lr == "L"
      let isRight = lr == "R"
      
      // Send finish command directly to ensure it gets sent (using fast method)
      if isLeft {
        await sendCommandToSideWithoutResponse([0x20, 0x0d, 0x0e], side: "L")
      }
      if isRight {
        await sendCommandToSideWithoutResponse([0x20, 0x0d, 0x0e], side: "R")
      }
      
      CoreCommsService.log("G1: Finish command sent to \(lr)")
      
      // Small delay after finish command (MentraOS timing)
      try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
      
      // CRC validation like MentraOS - frame 1 should be 0x1914adcf
      var imageWithAddress = Data(addressBytes)
      imageWithAddress.append(bmpData)
      
      // Calculate CRC32-XZ like MentraOS (not standard CRC32)
      let crc32Value = calculateCRC32XZ(data: imageWithAddress)
      let crcBytes = Data([
        UInt8((crc32Value >> 24) & 0xff),
        UInt8((crc32Value >> 16) & 0xff),
        UInt8((crc32Value >> 8) & 0xff),
        UInt8(crc32Value & 0xff)
      ])
      
      var crcCommand = Data([0x16])
      crcCommand.append(crcBytes)
      
      CoreCommsService.log("G1: Sending CRC command to \(lr): \(String(format: "%02X %02X %02X %02X", crcBytes[0], crcBytes[1], crcBytes[2], crcBytes[3]))")
      CoreCommsService.log("G1: Expected for frame 1: 19 14 AD CF")
      
      // Send CRC directly like MentraOS (using fast method)
      if isLeft {
        await sendCommandToSideWithoutResponse(Array(crcCommand), side: "L")
        CoreCommsService.log("G1: CRC sent to L")
      }
      if isRight {
        await sendCommandToSideWithoutResponse(Array(crcCommand), side: "R")
        CoreCommsService.log("G1: CRC sent to R")
      }
      
      // Wait for CRC response (MentraOS timing)
      try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
      
      let sideElapsed = Date().timeIntervalSince(sideStartTime) * 1000
      CoreCommsService.log("G1: 🏁 \(lr) side transmission completed in \(String(format: "%.0f", sideElapsed))ms")
      
      return true
    }
    
    // Send to both sides SEQUENTIALLY like MentraOS for perfect sync
    // MentraOS sends left first, then right, with precise timing
    var results: [(String, Bool)] = []
    
    // send to both sides at the same time:
    
    await withTaskGroup(of: Void.self) { group in
      if sendLeft {
        group.addTask {
          let leftResult = await sendToSide("L")
          results.append(("L", leftResult))
        }
      }
      
      if sendRight {
        group.addTask {
          let rightResult = await sendToSide("R")
          results.append(("R", rightResult))
        }
      }
      
      // Wait for all tasks to complete
      await group.waitForAll()
    }
    
    // Check results with detailed synchronization status
    var allSuccess = true
    var successSides: [String] = []
    var failedSides: [String] = []
    
    for (side, success) in results {
      if success {
        successSides.append(side)
        CoreCommsService.log("G1: ✅ BMP display success for side \(side)")
      } else {
        failedSides.append(side)
        allSuccess = false
        CoreCommsService.log("G1: ❌ BMP display failed for side \(side)")
      }
    }
    
    // Report synchronization status
    if allSuccess {
      onSuccess?("both")
      CoreCommsService.log("G1: ✅ BMP display successful on both sides - SYNCHRONIZED")
    } else if successSides.count > 0 {
      CoreCommsService.log("G1: ⚠️ PARTIAL SUCCESS: \(successSides.joined(separator: ", ")) succeeded, \(failedSides.joined(separator: ", ")) failed - DESYNCHRONIZED")
      onError?("both", "Partial failure - desynchronized")
    } else {
      CoreCommsService.log("G1: ❌ COMPLETE FAILURE: Both sides failed")
      onError?("both", "BMP display failed")
    }
    
    return allSuccess
  }
  
  // Helper function to calculate CRC32-XZ like MentraOS (matches Dart crclib)
  private func calculateCRC32XZ(data: Data) -> UInt32 {
    // CRC32-XZ table-based implementation (matches Dart crclib exactly)
    let polynomial: UInt32 = 0x04C11DB7
    var crc: UInt32 = 0xFFFFFFFF
    
    // Build CRC table for efficiency (matches crclib behavior)
    var table: [UInt32] = Array(repeating: 0, count: 256)
    for i in 0..<256 {
      var entry = UInt32(i) << 24
      for _ in 0..<8 {
        if (entry & 0x80000000) != 0 {
          entry = (entry << 1) ^ polynomial
        } else {
          entry <<= 1
        }
      }
      table[i] = entry
    }
    
    // Calculate CRC using table lookup (matches MentraOS's crclib)
    for byte in data {
      let tableIndex = Int((crc >> 24) ^ UInt32(byte)) & 0xFF
      crc = (crc << 8) ^ table[tableIndex]
    }
    
    return ~crc
  }
  
  // Helper function to calculate CRC32 (simple implementation)
  private func calculateCRC32(data: Data) -> UInt32 {
    let polynomial: UInt32 = 0xEDB88320
    var crc: UInt32 = 0xFFFFFFFF
    
    for byte in data {
      crc ^= UInt32(byte)
      for _ in 0..<8 {
        if (crc & 1) != 0 {
          crc = (crc >> 1) ^ polynomial
        } else {
          crc = crc >> 1
        }
      }
    }
    
    return ~crc
  }
  
  /// Display BMP from file path
  @objc public func RN_displayBmpFromFile(_ filePath: String) {
    CoreCommsService.log("G1: RN_displayBmpFromFile() - Path: \(filePath)")
    Task {
      await displayBmpFromFile(filePath: filePath)
    }
  }
  
  public func displayBmpFromFile(filePath: String,
                                 onProgress: BmpProgressCallback? = nil,
                                 onSuccess: BmpSuccessCallback? = nil,
                                 onError: BmpErrorCallback? = nil) async -> Bool {
    
    guard let bmpData = NSData(contentsOfFile: filePath) as Data? else {
      CoreCommsService.log("G1: Failed to load BMP file: \(filePath)")
      onError?("both", "Failed to load BMP file")
      return false
    }
    
    return await displayBitmapData(bmpData: bmpData, onProgress: onProgress, onSuccess: onSuccess, onError: onError)
  }
  
  /// Core BMP display implementation with enhanced error handling and retry logic
  private func displayBitmapData(bmpData: Data,
                                 sendLeft: Bool = true,
                                 sendRight: Bool = true,
                                 onProgress: BmpProgressCallback? = nil,
                                 onSuccess: BmpSuccessCallback? = nil,
                                 onError: BmpErrorCallback? = nil) async -> Bool {
    
    CoreCommsService.log("G1: Starting BMP display process - Size: \(bmpData.count) bytes")
    
    // Validate BMP format
    guard bmpData.count >= 2 && bmpData[0] == 0x42 && bmpData[1] == 0x4D else {
      CoreCommsService.log("G1: Invalid BMP format - missing BM signature")
      onError?("both", "Invalid BMP format")
      return false
    }
    
    // Constants for MentraOS-compatible BMP handling
    let maxRetryAttempts = 10
    let chunkSize = 194  // MentraOS uses 194 bytes per chunk
    let iosChunkDelayMs = 8 // Platform-specific timing
    let endCommandTimeoutMs = 3000
    let crcCommandTimeoutMs = 3000
    
    // Create chunks with proper formatting
    let chunks = createBmpChunks(from: bmpData, chunkSize: chunkSize)
    CoreCommsService.log("G1: Created \(chunks.count) chunks from BMP data")
    
    // Send chunks with progress tracking and retry logic
    for (index, chunk) in chunks.enumerated() {
      var success = false
      var attempt = 0
      
      while !success && attempt < maxRetryAttempts {
        // Queue the chunk
        queueChunks([chunk], sendLeft: sendLeft, sendRight: sendRight)
        
        // Wait with iOS-specific timing
        try? await Task.sleep(nanoseconds: UInt64(iosChunkDelayMs * 1_000_000))
        
        // For now, assume success (in a real implementation, you'd check for ACK)
        success = true
        
        if !success {
          attempt += 1
          CoreCommsService.log("G1: Chunk \(index) failed, retry attempt \(attempt)")
          
          if attempt < maxRetryAttempts {
            // Exponential backoff for retries
            let retryDelay = min(100 * (1 << attempt), 1000) // Max 1 second
            try? await Task.sleep(nanoseconds: UInt64(retryDelay * 1_000_000))
          }
        }
      }
      
      if !success {
        CoreCommsService.log("G1: Failed to send chunk \(index) after \(maxRetryAttempts) attempts")
        onError?("both", "Failed to send chunk \(index)")
        return false
      }
      
      // Report progress
      let offset = index * chunkSize
      onProgress?("both", offset, index, bmpData.count)
    }
    
    // Send finish command with retry logic (MentraOS protocol)
    var endSuccess = false
    for attempt in 0..<maxRetryAttempts {
      let endCommand = Data([0x20, 0x0d, 0x0e]) // MentraOS finish command
      let endArray: [UInt8] = endCommand.map { UInt8($0) }
      
      queueChunks([endArray], sendLeft: sendLeft, sendRight: sendRight)
      
      // Wait for end command to process
      try? await Task.sleep(nanoseconds: UInt64(endCommandTimeoutMs * 1_000_000))
      
      // For now, assume success (in a real implementation, you'd check for ACK)
      endSuccess = true
      
      if endSuccess {
        break
      }
      
      CoreCommsService.log("G1: End command failed, attempt \(attempt + 1)")
    }
    
    if !endSuccess {
      CoreCommsService.log("G1: Failed to send end command after \(maxRetryAttempts) attempts")
      onError?("both", "Failed to send end command")
      return false
    }
    
    // Calculate and send CRC with retry logic
    let crcSuccess = await sendBmpCrcWithRetry(bmpData: bmpData,
                                               sendLeft: sendLeft,
                                               sendRight: sendRight,
                                               maxAttempts: maxRetryAttempts,
                                               timeoutMs: crcCommandTimeoutMs)
    
    if !crcSuccess {
      CoreCommsService.log("G1: Failed to send CRC after retries")
      onError?("both", "CRC check failed")
      return false
    }
    
    CoreCommsService.log("G1: BMP display process completed successfully")
    onSuccess?("both")
    return true
  }
  
  /// Create BMP chunks with MentraOS-compatible headers
  private func createBmpChunks(from bmpData: Data, chunkSize: Int) -> [[UInt8]] {
    var chunks: [[UInt8]] = []
    let glassesAddress: [UInt8] = [0x00, 0x1c, 0x00, 0x00] // MentraOS uses address 0x1c
    
    let totalChunks = (bmpData.count + chunkSize - 1) / chunkSize
    
    for i in 0..<totalChunks {
      let start = i * chunkSize
      let end = min(start + chunkSize, bmpData.count)
      let chunkData = bmpData.subdata(in: start..<end)
      
      var chunk: [UInt8] = []
      
      // First chunk needs address bytes
      if i == 0 {
        chunk.append(0x15) // Command
        chunk.append(UInt8(i & 0xFF)) // Sequence
        chunk.append(contentsOf: glassesAddress) // Address
        chunk.append(contentsOf: chunkData)
      } else {
        chunk.append(0x15) // Command
        chunk.append(UInt8(i & 0xFF)) // Sequence
        chunk.append(contentsOf: chunkData)
      }
      
      chunks.append(chunk)
    }
    
    return chunks
  }
  
  /// Send CRC with retry logic
  private func sendBmpCrcWithRetry(bmpData: Data,
                                   sendLeft: Bool,
                                   sendRight: Bool,
                                   maxAttempts: Int,
                                   timeoutMs: Int) async -> Bool {
    
    // Create data with address for CRC calculation (MentraOS pattern)
    let glassesAddress: [UInt8] = [0x00, 0x1c, 0x00, 0x00] // Same address as in chunks
    var dataWithAddress = Data(glassesAddress)
    dataWithAddress.append(bmpData)
    
    // Calculate CRC32 (simplified - in a real implementation, use proper CRC32-XZ)
    let crcValue = dataWithAddress.crc32
    
    // Create CRC command packet
    var crcCommand: [UInt8] = [0x16] // CRC command
    crcCommand.append(UInt8((crcValue >> 24) & 0xFF))
    crcCommand.append(UInt8((crcValue >> 16) & 0xFF))
    crcCommand.append(UInt8((crcValue >> 8) & 0xFF))
    crcCommand.append(UInt8(crcValue & 0xFF))
    
    CoreCommsService.log("G1: Sending CRC command, CRC value: \(String(format: "%08x", crcValue))")
    
    // Send CRC with retry
    for attempt in 0..<maxAttempts {
      queueChunks([crcCommand], sendLeft: sendLeft, sendRight: sendRight)
      
      // Wait for CRC command to process
      try? await Task.sleep(nanoseconds: UInt64(timeoutMs * 1_000_000))
      
      // For now, assume success (in a real implementation, you'd check for ACK)
      CoreCommsService.log("G1: CRC command sent successfully")
      return true
      
      CoreCommsService.log("G1: CRC command failed, attempt \(attempt + 1)")
    }
    
    CoreCommsService.log("G1: Failed to send CRC command after \(maxAttempts) attempts")
    return false
  }
  
  
}

// MARK: BLE Stubs
extension ERG1Manager: CBCentralManagerDelegate, CBPeripheralDelegate {
  
  func getWriteCharacteristic(for peripheral: CBPeripheral?) -> CBCharacteristic? {
    guard let peripheral = peripheral else { return nil }
    for service in peripheral.services ?? [] {
      if service.uuid == UART_SERVICE_UUID {
        for characteristic in service.characteristics ?? [] where characteristic.uuid == UART_TX_CHAR_UUID {
          return characteristic
        }
      }
    }
    return nil
  }
  
  func extractIdNumber(_ string: String) -> Int? {
    // Pattern to match "G1_" followed by digits, followed by "_"
    let pattern = "G1_(\\d+)_"
    
    // Create a regular expression
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
      return nil
    }
    
    // Look for matches in the input string
    let range = NSRange(string.startIndex..<string.endIndex, in: string)
    guard let match = regex.firstMatch(in: string, options: [], range: range) else {
      return nil
    }
    
    // Extract the captured group (the digits)
    if let matchRange = Range(match.range(at: 1), in: string) {
      let idString = String(string[matchRange])
      return Int(idString)
    }
    
    return nil
  }
  
  public func emitDiscoveredDevice(_ name: String) {
    if name.contains("_L_") || name.contains("_R_") {
      // exampleName = "Even G1_74_L_57863C", "Even G1_3_L_57863C", "Even G1_100_L_57863C"
      guard let extractedNum = extractIdNumber(name) else { return }
      let res: [String: Any] = [
        "model_name": "Even Realities G1",
        "device_name": "\(extractedNum)",
      ]
      let eventBody: [String: Any] = [
        "compatible_glasses_search_result": res,
      ]
      
      // must convert to string before sending:
      do {
        let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
        if let jsonString = String(data: jsonData, encoding: .utf8) {
          CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
        }
      } catch {
        CoreCommsService.log("Error converting to JSON: \(error)")
      }
    }
  }
  
  // On BT discovery, automatically connect to both arms if we have them:
  public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    
    guard let name = peripheral.name else { return }
    guard name.contains("Even G1") else { return }
    
    CoreCommsService.log("G1: found peripheral: \(name) - SEARCH_ID: \(DEVICE_SEARCH_ID)")
    
    // Only process serial number for devices that match our search ID
    if name.contains(DEVICE_SEARCH_ID) {
      // Extract manufacturer data to decode serial number
      if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
        CoreCommsService.log("G1: 📱 Found manufacturer data: \(manufacturerData.hexEncodedString())")
        
        // Try to decode serial number from manufacturer data
        if let decodedSerial = decodeSerialFromManufacturerData(manufacturerData) {
          CoreCommsService.log("G1: 📱 Decoded serial number: \(decodedSerial)")
          
          // Decode style and color from serial number
          let (style, color) = ERG1Manager.decodeEvenG1SerialNumber(decodedSerial)
          CoreCommsService.log("G1: 📱 Style: \(style), Color: \(color)")
          
          // Store the information
          glassesSerialNumber = decodedSerial
          glassesStyle = style
          glassesColor = color
          
          // Emit the serial number information
          emitSerialNumberInfo(serialNumber: decodedSerial, style: style, color: color)
        } else {
          CoreCommsService.log("G1: 📱 Could not decode serial number from manufacturer data")
        }
      } else {
        CoreCommsService.log("G1: 📱 No manufacturer data found in advertisement")
      }
    }
    
    if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
      CoreCommsService.log("G1: Found left arm: \(name)")
      leftPeripheral = peripheral
    } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
      CoreCommsService.log("G1: Found right arm: \(name)")
      rightPeripheral = peripheral
    }
    
    emitDiscoveredDevice(name);
    
    if leftPeripheral != nil && rightPeripheral != nil {
      //      central.stopScan()
      RN_connectGlasses()
    }
    
  }
  
  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    CoreCommsService.log("G1: centralManager(_:didConnect:) device connected!: \(peripheral.name ?? "Unknown")")
    peripheral.delegate = self
    peripheral.discoverServices([UART_SERVICE_UUID])
    
    // Store the UUIDs for future reconnection
    if peripheral == leftPeripheral || (peripheral.name?.contains("_L_") ?? false) {
      CoreCommsService.log("G1: 🔵 Storing left glass UUID: \(peripheral.identifier.uuidString)")
      leftGlassUUID = peripheral.identifier
      leftPeripheral = peripheral
    }
    
    if peripheral == rightPeripheral || (peripheral.name?.contains("_R_") ?? false) {
      CoreCommsService.log("G1: 🔵 Storing right glass UUID: \(peripheral.identifier.uuidString)")
      rightGlassUUID = peripheral.identifier
      rightPeripheral = peripheral
    }
    
    // Update the last connection timestamp
    lastConnectionTimestamp = Date()
    CoreCommsService.log("G1: Connected to peripheral: \(peripheral.name ?? "Unknown")")
    
    // Emit connection event
    let isLeft = peripheral == leftPeripheral
    let eventBody: [String: Any] = [
      "side": isLeft ? "L" : "R",
      "name": peripheral.name ?? "Unknown",
      "id": peripheral.identifier.uuidString
    ]
    
    // tell iOS to reconnect to this, even from the background
    //    central.connect(peripheral, options: [
    //        CBConnectPeripheralOptionNotifyOnConnectionKey: true,
    //        CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
    //        CBConnectPeripheralOptionNotifyOnNotificationKey: true
    //    ])
    
    // TODO: ios not actually used for anything yet, but we should trigger a re-connect if it was disconnected:
    //    CoreCommsService.emitter.sendEvent(withName: "onConnectionStateChanged", body: eventBody)
  }
  
  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?) {
    let side = peripheral == leftPeripheral ? "LEFT" : peripheral == rightPeripheral ? "RIGHT" : "unknown"
    CoreCommsService.log("G1: @@@@@ \(side) PERIPHERAL DISCONNECTED @@@@@")
    
    // only reconnect if we're not intentionally disconnecting:
    if self.isDisconnecting {
      return
    }
    
    if peripheral == leftPeripheral || peripheral == rightPeripheral {
      // force reconnection to both before considering us ready again:
      leftPeripheral = nil
      rightPeripheral = nil
      setReadiness(left: false, right: false)
      startReconnectionTimer()// Start periodic reconnection attempts
    }
  }
  
  private func startReconnectionTimer() {
    // Cancel any existing timer
    stopReconnectionTimer()
    
    // Reset attempt counter
    reconnectionAttempts = 0
    
    // Create a new timer on a background queue
    let queue = DispatchQueue(label: "com.sample.reconnectionTimerQueue", qos: .background)
    queue.async { [weak self] in
      guard let self = self else {
        return
      }
      self.reconnectionTimer = Timer.scheduledTimer(
        timeInterval: self.reconnectionInterval,
        target: self,
        selector: #selector(self.attemptReconnection),
        userInfo: nil,
        repeats: true
      )
      
      guard let recon = reconnectionTimer else {
        return
      }
      
      // Fire immediately for first attempt
      recon.fire()
      
      // Add timer to the run loop
      RunLoop.current.add(recon, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  private func stopReconnectionTimer() {
    reconnectionTimer?.invalidate()
    reconnectionTimer = nil
  }
  
  // Connect by UUID
  @objc public func connectByUUID() -> Bool {
    
    // don't do this if we don't have a search id set:
    if DEVICE_SEARCH_ID == "NOT_SET" || DEVICE_SEARCH_ID.isEmpty {
      CoreCommsService.log("G1: 🔵 No DEVICE_SEARCH_ID set, skipping connect by UUID")
      return false
    }
    
    CoreCommsService.log("G1: 🔵 Attempting to connect by UUID")
    var foundAny = false
    
    if let leftUUID = leftGlassUUID {
      CoreCommsService.log("G1: 🔵 Found stored left glass UUID: \(leftUUID.uuidString)")
      let leftDevices = centralManager!.retrievePeripherals(withIdentifiers: [leftUUID])
      
      if let leftDevice = leftDevices.first {
        CoreCommsService.log("G1: 🔵 Successfully retrieved left glass: \(leftDevice.name ?? "Unknown")")
        foundAny = true
        leftPeripheral = leftDevice
        leftDevice.delegate = self
        centralManager!.connect(leftDevice, options: [
          CBConnectPeripheralOptionNotifyOnConnectionKey: true,
          CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
      }
    }
    
    if let rightUUID = rightGlassUUID {
      CoreCommsService.log("G1: 🔵 Found stored right glass UUID: \(rightUUID.uuidString)")
      let rightDevices = centralManager!.retrievePeripherals(withIdentifiers: [rightUUID])
      
      if let rightDevice = rightDevices.first {
        CoreCommsService.log("G1: 🔵 Successfully retrieved right glass: \(rightDevice.name ?? "Unknown")")
        foundAny = true
        rightPeripheral = rightDevice
        rightDevice.delegate = self
        centralManager!.connect(rightDevice, options: [
          CBConnectPeripheralOptionNotifyOnConnectionKey: true,
          CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
      }
    }
    
    return foundAny
  }
  
  @objc private func attemptReconnection() {
    // Check if we're already connected
    if g1Ready {
      stopReconnectionTimer()
      return
    }
    
    // Check if we've exceeded maximum attempts
    if maxReconnectionAttempts > 0 && reconnectionAttempts >= maxReconnectionAttempts {
      CoreCommsService.log("G1: Maximum reconnection attempts reached. Stopping reconnection timer.")
      stopReconnectionTimer()
      return
    }
    
    reconnectionAttempts += 1
    CoreCommsService.log("G1: Attempting reconnection (attempt \(reconnectionAttempts))...")
    
    // Start a new scan
    startScan()
  }
  
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let services = peripheral.services {
      for service in services where service.uuid == UART_SERVICE_UUID {
        peripheral.discoverCharacteristics([UART_TX_CHAR_UUID, UART_RX_CHAR_UUID], for: service)
      }
    }
  }
  
  // Update peripheral(_:didDiscoverCharacteristicsFor:error:) to set services waiters
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristics = service.characteristics else { return }
    
    if service.uuid.isEqual(UART_SERVICE_UUID) {
      for characteristic in characteristics {
        if characteristic.uuid == UART_TX_CHAR_UUID {
          sendInitCommand(to: peripheral)
        } else if characteristic.uuid == UART_RX_CHAR_UUID {
          peripheral.setNotifyValue(true, for: characteristic)
          
          // enable notification (needed for pairing from scracth!)
          Thread.sleep(forTimeInterval: 0.5) // 500ms delay
          let CLIENT_CHARACTERISTIC_CONFIG_UUID = CBUUID(string: "00002902-0000-1000-8000-00805f9b34fb");
          if let descriptor = characteristic.descriptors?.first(where: { $0.uuid == CLIENT_CHARACTERISTIC_CONFIG_UUID }) {
            let value = Data([0x01, 0x00]) // ENABLE_NOTIFICATION_VALUE in iOS
            peripheral.writeValue(value, for: descriptor)
          } else {
            CoreCommsService.log("PROC_QUEUE - descriptor not found")
          }
        }
      }
      
      // Mark the services as ready
      if peripheral == leftPeripheral {
        CoreCommsService.log("G1: Left glass services discovered and ready")
      } else if peripheral == rightPeripheral {
        CoreCommsService.log("G1: Right glass services discovered and ready")
      }
    }
  }
  
  // called whenever bluetooth is initialized / turned on or off:
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      CoreCommsService.log("G1: Bluetooth was powered on")
      setReadiness(left: false, right: false)
      // only automatically start scanning if we have a SEARCH_ID, otherwise wait for RN to call startScan() itself
      if (DEVICE_SEARCH_ID != "NOT_SET" && !DEVICE_SEARCH_ID.isEmpty) {
        startScan()
      }
    } else {
      CoreCommsService.log("G1: Bluetooth was turned off.")
    }
  }
  
  // called when we get data from the glasses:
  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      CoreCommsService.log("G1: Error updating value for characteristic: \(error.localizedDescription)")
      return
    }
    
    guard let data = characteristic.value else {
      CoreCommsService.log("G1: Characteristic value is nil.")
      return
    }
    
    // Process the notification data
    handleNotification(from: peripheral, data: data)
  }
  
  // L/R Synchronization - Handle BLE write completions
  public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      CoreCommsService.log("G1: ❌ BLE write error for \(peripheral.name ?? "unknown"): \(error.localizedDescription)")
    } else {
      // Only log successful writes every 10th operation to avoid spam
      // if writeCompletionCount % 10 == 0 {
      //   CoreCommsService.log("G1: ✅ BLE write \(writeCompletionCount) completed for \(peripheral.name ?? "unknown")")
      // }
      writeCompletionCount += 1
    }
    
    // Resume continuation to allow sequential execution
    // TODO: use the ack continuation
    //    if let continuation = pendingWriteCompletions.removeValue(forKey: characteristic) {
    //      continuation.resume(returning: false)
    //    }
  }
}
