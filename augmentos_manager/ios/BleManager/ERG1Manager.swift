//
//  ERG1Manager.swift
//  AugmentOS_Manager
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
  
  override init() {
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
    
    CoreCommsService.log("ERG1Manager deinitialized")
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
        CoreCommsService.log("📱 Emitted serial number info: \(serialNumber), Style: \(style), Color: \(color)")
        
        // Trigger status update to include serial number in status JSON
        DispatchQueue.main.async {
          self.onSerialNumberDiscovered?()
        }
      }
    } catch {
      CoreCommsService.log("Error creating serial number JSON: \(error)")
    }
  }
  
  // @@@ REACT NATIVE FUNCTIONS @@@
  
  @objc func RN_setSearchId(_ searchId: String) {
    CoreCommsService.log("SETTING SEARCH_ID: \(searchId)")
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
        CoreCommsService.log("Attempting to scan but bluetooth is not powered on.")
        return false
      }
      
      // send our already connected devices to RN:
      let devices = getConnectedDevices()
      CoreCommsService.log("connnectedDevices.count: (\(devices.count))")
      for device in devices {
        if let name = device.name {
          CoreCommsService.log("Connected to device: \(name)")
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
        CoreCommsService.log("🔄 Found and attempting to connect to stored glasses UUIDs")
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
    
    CoreCommsService.log("found both glasses \(leftPeripheral!.name ?? "(unknown)"), \(rightPeripheral!.name ?? "(unknown)") stopping scan");
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
    queueChunks(chunks, sleepAfterMs: 50)
  }
  
  
  @objc public func RN_sendDoubleTextWall(_ top: String, _ bottom: String) -> Void {
    let chunks = textHelper.createDoubleTextWallChunks(textTop: top, textBottom: bottom)
    queueChunks(chunks, sleepAfterMs: 50)
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
    CoreCommsService.log("Stopped scanning for devices")
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
    CoreCommsService.log("Disconnected from glasses")
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
    var result: Bool = false
    var semaphore = side == "left" ? leftSemaphore : rightSemaphore
    var s = side == "left" ? "L" : "R"
    
    while attempts < maxAttempts && !result {
      if (attempts > 0) {
        CoreCommsService.log("trying again to send to:\(s): \(attempts)")
      }
      //      let data = Data(chunks[0])
      //      CoreCommsService.log("SEND (\(s)) \(data.hexEncodedString())")
      
      if self.isDisconnecting {
        // forget whatever we were doing since we're disconnecting:
        break
      }
      
      
      
      for i in 0..<chunks.count-1 {
        let chunk = chunks[i]
        await sendCommandToSide(chunk, side: side)
        try? await Task.sleep(nanoseconds: 50 * 1_000_000)// 50ms
      }
      
      let lastChunk = chunks.last!
      await sendCommandToSide(lastChunk, side: side)
      
      
      CoreCommsService.log("waiting for \(s)")
      result = waitForSemaphore(semaphore: semaphore, timeout: (0.3 + (Double(attempts) * 0.2)))
      if (!result) {
        CoreCommsService.log("timed out waiting for \(s)")
      }
      
      attempts += 1
      if !result && (attempts >= maxAttempts) {
        semaphore.signal()// increment the count
        startReconnectionTimer()
        break
      }
    }
  }
  
  // Process a single number with timeouts
  private func processCommand(_ command: BufferedCommand) async {
    
    //    CoreCommsService.log("@@@ processing command \(command.chunks[0][0]),\(command.chunks[0][1]) @@@")
    
    // TODO: this is a total hack but in theory ensure semaphores are at count 1:
    // in theory this shouldn't be necesarry but in practice this helps ensure weird
    // race conditions don't lead me down debugging the wrong thing for hours:
    resetSemaphoreToZero(leftSemaphore)
    resetSemaphoreToZero(rightSemaphore)
    
    if command.chunks.isEmpty {
      CoreCommsService.log("@@@ chunks was empty! @@@")
      return
    }
    
    // first send to the left:
    if command.sendLeft {
      await attemptSend(chunks: command.chunks, side: "left")
    }
    
    //    CoreCommsService.log("@@@ sent (or failed) to left, now trying right @@@")
    
    if command.sendRight {
      await attemptSend(chunks: command.chunks, side: "right")
    }
    
    if command.waitTime > 0 {
      // wait waitTime milliseconds before moving on to the next command:
      try? await Task.sleep(nanoseconds: UInt64(command.waitTime) * 1_000_000)
    } else {
      // sleep for a min amount of time unless otherwise specified
      try? await Task.sleep(nanoseconds: 100 * 1_000_000)// Xms
    }
  }
  
  private func waitForSemaphore(semaphore: DispatchSemaphore, timeout: TimeInterval) -> Bool {
    let result = semaphore.wait(timeout: .now() + timeout)
    return result == .success
  }
  
  func startHeartbeatTimer() {
    
    // Check if a timer is already running
    if heartbeatTimer != nil && heartbeatTimer!.isValid {
      CoreCommsService.log("Heartbeat timer already running")
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
  
  private func handleAck(from peripheral: CBPeripheral, success: Bool) {
    CoreCommsService.log("handleAck \(success)")
    if !success { return }
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
    
    let side = peripheral == leftPeripheral ? "left" : "right"
    let s = peripheral == leftPeripheral ? "L" : "R"
    CoreCommsService.log("RECV (\(s)) \(data.hexEncodedString())")
    
    switch Commands(rawValue: command) {
    case .BLE_REQ_INIT:
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
      handleInitResponse(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
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
    case .BLE_REQ_TRANSFER_MIC_DATA:
      self.compressedVoiceData = data
      //                CoreCommsService.log("Got voice data: " + String(data.count))
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
      
      //      CoreCommsService.log("Raw battery data - Battery: \(batteryPercent)%, Voltage: \(voltage)mV, Flags: 0x\(String(format: "%02X", flags))")
      
      // if left, update left battery level, if right, update right battery level
      if peripheral == leftPeripheral {
        if leftBatteryLevel != batteryPercent {
          CoreCommsService.log("Left glass battery: \(batteryPercent)%")
          leftBatteryLevel = batteryPercent
        }
      } else if peripheral == rightPeripheral {
        if rightBatteryLevel != batteryPercent {
          CoreCommsService.log("Right glass battery: \(batteryPercent)%")
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
      handleAck(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
    case .BLE_REQ_DEVICE_ORDER:
      let order = data[1]
      switch DeviceOrders(rawValue: order) {
      case .HEAD_UP:
        CoreCommsService.log("HEAD_UP")
        isHeadUp = true
        break
      case .HEAD_UP2:
        CoreCommsService.log("HEAD_UP2")
        isHeadUp = true
        break
      case .HEAD_DOWN:
        CoreCommsService.log("HEAD_DOWN")
        isHeadUp = false
        break
      case .HEAD_DOWN2:
        CoreCommsService.log("HEAD_DOWN2")
        isHeadUp = false
        break
      case .ACTIVATED:
        CoreCommsService.log("ACTIVATED")
      case .SILENCED:
        CoreCommsService.log("SILENCED")
      case .DISPLAY_READY:
        CoreCommsService.log("DISPLAY_READY")
        //        sendInitCommand(to: peripheral)// experimental
      case .TRIGGER_FOR_AI:
        CoreCommsService.log("TRIGGER AI")
      case .TRIGGER_FOR_STOP_RECORDING:
        CoreCommsService.log("STOP RECORDING")
      case .TRIGGER_CHANGE_PAGE:
        CoreCommsService.log("TRIGGER_CHANGE_PAGE")
      case .CASE_REMOVED:
        CoreCommsService.log("REMOVED FROM CASE")
        self.caseRemoved = true
      case .CASE_REMOVED2:
        CoreCommsService.log("REMOVED FROM CASE2")
        self.caseRemoved = true
      case .CASE_OPEN:
        self.caseOpen = true
        self.caseRemoved = false
        CoreCommsService.log("CASE OPEN");
      case .CASE_CLOSED:
        self.caseOpen = false
        self.caseRemoved = false
        CoreCommsService.log("CASE CLOSED");
      case .CASE_CHARGING_STATUS:
        guard data.count >= 3 else { break }
        let status = data[2]
        if status == 0x01 {
          self.caseCharging = true
          CoreCommsService.log("CASE CHARGING")
        } else {
          self.caseCharging = false
          CoreCommsService.log("CASE NOT CHARGING")
        }
      case .CASE_CHARGE_INFO:
        CoreCommsService.log("CASE CHARGE INFO")
        guard data.count >= 3 else { break }
        if Int(data[2]) != -1 {
          caseBatteryLevel = Int(data[2])
          CoreCommsService.log("Case battery level: \(caseBatteryLevel)%")
        } else {
          CoreCommsService.log("Case battery level was -1")
        }
      case .DOUBLE_TAP:
        CoreCommsService.log("DOUBLE TAP / display turned off")
        //        Task {
        ////          RN_sendText("DOUBLE TAP DETECTED")
        ////          queueChunks([[UInt8(0x00), UInt8(0x01)]])
        //          try? await Task.sleep(nanoseconds: 1500 * 1_000_000) // 2s delay after sending
        //          sendInit()
        //          clearState()
        //        }
      default:
        CoreCommsService.log("Received device order: \(data.subdata(in: 1..<data.count).hexEncodedString())")
        break
      }
    default:
      //          CoreCommsService.log("received from G1(not handled): \(data.hexEncodedString())")
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
      //AppInfo(id: "com.augment.os", name: "AugmentOS"),
      AppInfo(id: "com.mentra.os", name: "MentraOS"),
      AppInfo(id: "io.heckel.ntfy", name: "ntfy")
    ]
    let whitelistJson = createWhitelistJson(apps: apps)
    
    CoreCommsService.log("Creating chunks for hardcoded whitelist: \(whitelistJson)")
    
    // Convert JSON to bytes and split into chunks
    return createWhitelistChunks(json: whitelistJson)
  }
  
  private func createWhitelistJson(apps: [AppInfo]) -> String {
    do {
      // Create app list array
      var appList: [[String: Any]] = []
      for app in apps {
        let appDict: [String: Any] = [
          "id": app.id,
          "name": app.name
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
      CoreCommsService.log("Error creating whitelist JSON: \(error.localizedDescription)")
      return "{}"
    }
  }
  
  // Helper function to split JSON into chunks
  private func createWhitelistChunks(json: String) -> [[UInt8]] {
    let MAX_CHUNK_SIZE = 180 - 4 // Reserve space for the header
    guard let jsonData = json.data(using: .utf8) else { return [] }
    
    let totalChunks = Int(ceil(Double(jsonData.count) / Double(MAX_CHUNK_SIZE)))
    var chunks: [Data] = []
    
    CoreCommsService.log("jsonData.count = \(jsonData.count), totalChunks = \(totalChunks)")
    
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
      // CoreCommsService.log("Left arm initialized: \(success)")
      setReadiness(left: true, right: nil)
    } else if peripheral == rightPeripheral {
      rightInitialized = success
      // CoreCommsService.log("Right arm initialized: \(success)")
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
    // Ensure command is exactly 20 bytes
    //    var paddedCommand = command
    //    while paddedCommand.count < 20 {
    //      paddedCommand.append(0x00)
    //    }
    
    // Convert to Data
    let commandData = Data(command)
    //    CoreCommsService.log("Sending command to glasses: \(paddedCommand.map { String(format: "%02X", $0) }.joined(separator: " "))")
    CoreCommsService.log("SEND (\(side == "left" ? "L" : "R")) \(commandData.hexEncodedString())")
    
    if (side == "left") {
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
  
  public func queueChunks(_ chunks: [[UInt8]], sendLeft: Bool = true, sendRight: Bool = true, sleepAfterMs: Int = 0, ignoreAck: Bool = false) {
    let bufferedCommand = BufferedCommand(chunks: chunks, sendLeft: sendLeft, sendRight: sendRight, waitTime: sleepAfterMs, ignoreAck: ignoreAck);
    Task {
      await commandQueue.enqueue(bufferedCommand)
    }
  }
  
  
  @objc func RN_sendWhitelist() {
    CoreCommsService.log("RN_sendWhitelist()")
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
    CoreCommsService.log("setBrightness()")
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
    CoreCommsService.log("setHeadUpAngle()")
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
    CoreCommsService.log("getBatteryStatus()")
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
    CoreCommsService.log("RN_setMicEnabled()")
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
    
    CoreCommsService.log("found peripheral: \(name) - SEARCH_ID: \(DEVICE_SEARCH_ID)")
    
    // Only process serial number for devices that match our search ID
    if name.contains(DEVICE_SEARCH_ID) {
      // Extract manufacturer data to decode serial number
      if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
        CoreCommsService.log("📱 Found manufacturer data: \(manufacturerData.hexEncodedString())")
        
        // Try to decode serial number from manufacturer data
        if let decodedSerial = decodeSerialFromManufacturerData(manufacturerData) {
          CoreCommsService.log("📱 Decoded serial number: \(decodedSerial)")
          
          // Decode style and color from serial number
          let (style, color) = ERG1Manager.decodeEvenG1SerialNumber(decodedSerial)
          CoreCommsService.log("📱 Style: \(style), Color: \(color)")
          
          // Store the information
          glassesSerialNumber = decodedSerial
          glassesStyle = style
          glassesColor = color
          
          // Emit the serial number information
          emitSerialNumberInfo(serialNumber: decodedSerial, style: style, color: color)
        } else {
          CoreCommsService.log("📱 Could not decode serial number from manufacturer data")
        }
      } else {
        CoreCommsService.log("📱 No manufacturer data found in advertisement")
      }
    }
    
    if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
      CoreCommsService.log("Found left arm: \(name)")
      leftPeripheral = peripheral
    } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
      CoreCommsService.log("Found right arm: \(name)")
      rightPeripheral = peripheral
    }
    
    emitDiscoveredDevice(name);
    
    if leftPeripheral != nil && rightPeripheral != nil {
      //      central.stopScan()
      RN_connectGlasses()
    }
    
  }
  
  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    CoreCommsService.log("centralManager(_:didConnect:) device connected!: \(peripheral.name ?? "Unknown")")
    peripheral.delegate = self
    peripheral.discoverServices([UART_SERVICE_UUID])
    
    // Store the UUIDs for future reconnection
    if peripheral == leftPeripheral || (peripheral.name?.contains("_L_") ?? false) {
      CoreCommsService.log("🔵 Storing left glass UUID: \(peripheral.identifier.uuidString)")
      leftGlassUUID = peripheral.identifier
      leftPeripheral = peripheral
    }
    
    if peripheral == rightPeripheral || (peripheral.name?.contains("_R_") ?? false) {
      CoreCommsService.log("🔵 Storing right glass UUID: \(peripheral.identifier.uuidString)")
      rightGlassUUID = peripheral.identifier
      rightPeripheral = peripheral
    }
    
    // Update the last connection timestamp
    lastConnectionTimestamp = Date()
    CoreCommsService.log("Connected to peripheral: \(peripheral.name ?? "Unknown")")
    
    // Emit connection event
    let isLeft = peripheral == leftPeripheral
    let eventBody: [String: Any] = [
      "side": isLeft ? "left" : "right",
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
    CoreCommsService.log("@@@@@ \(side) PERIPHERAL DISCONNECTED @@@@@")
    
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
      CoreCommsService.log("🔵 No DEVICE_SEARCH_ID set, skipping connect by UUID")
      return false
    }
    
    CoreCommsService.log("🔵 Attempting to connect by UUID")
    var foundAny = false
    
    if let leftUUID = leftGlassUUID {
      CoreCommsService.log("🔵 Found stored left glass UUID: \(leftUUID.uuidString)")
      let leftDevices = centralManager!.retrievePeripherals(withIdentifiers: [leftUUID])
      
      if let leftDevice = leftDevices.first {
        CoreCommsService.log("🔵 Successfully retrieved left glass: \(leftDevice.name ?? "Unknown")")
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
      CoreCommsService.log("🔵 Found stored right glass UUID: \(rightUUID.uuidString)")
      let rightDevices = centralManager!.retrievePeripherals(withIdentifiers: [rightUUID])
      
      if let rightDevice = rightDevices.first {
        CoreCommsService.log("🔵 Successfully retrieved right glass: \(rightDevice.name ?? "Unknown")")
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
      CoreCommsService.log("Maximum reconnection attempts reached. Stopping reconnection timer.")
      stopReconnectionTimer()
      return
    }
    
    reconnectionAttempts += 1
    CoreCommsService.log("Attempting reconnection (attempt \(reconnectionAttempts))...")
    
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
        CoreCommsService.log("Left glass services discovered and ready")
      } else if peripheral == rightPeripheral {
        CoreCommsService.log("Right glass services discovered and ready")
      }
    }
  }
  
  // called whenever bluetooth is initialized / turned on or off:
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      CoreCommsService.log("Bluetooth was powered on")
      setReadiness(left: false, right: false)
      // only automatically start scanning if we have a SEARCH_ID, otherwise wait for RN to call startScan() itself
      if (DEVICE_SEARCH_ID != "NOT_SET" && !DEVICE_SEARCH_ID.isEmpty) {
        startScan()
      }
    } else {
      CoreCommsService.log("Bluetooth was turned off.")
    }
  }
  
  // called when we get data from the glasses:
  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error updating value for characteristic: \(error.localizedDescription)")
      return
    }
    
    guard let data = characteristic.value else {
      CoreCommsService.log("Characteristic value is nil.")
      return
    }
    
    // Process the notification data
    handleNotification(from: peripheral, data: data)
  }
}
