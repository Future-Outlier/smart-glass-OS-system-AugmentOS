//
//  G2.swift
//  MentraOS_Manager
//
//  Rewritten for EvenHub protocol (G2-native protobuf-based display system)
//  Based on reverse-engineered protocol from ae_g2_rev
//

import Combine
import CoreBluetooth
import Foundation
import React
import UIKit

// MARK: - Data Little-Endian Helpers (for BMP construction)

private extension Data {
    mutating func appendLittleEndian(_ value: UInt16) {
        var v = value.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }
    mutating func appendLittleEndian(_ value: UInt32) {
        var v = value.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }
    mutating func appendLittleEndian(_ value: Int32) {
        var v = value.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }
}

// MARK: - G2 Protocol Constants

private enum G2BLE {
    // EvenHub BLE characteristic UUIDs (NOT the G1 UART UUIDs!)
    static let CHAR_WRITE = CBUUID(string: "00002760-08C2-11E1-9073-0E8AC72E5401")
    static let CHAR_NOTIFY = CBUUID(string: "00002760-08C2-11E1-9073-0E8AC72E5402")
    static let AUDIO_NOTIFY = CBUUID(string: "00002760-08C2-11E1-9073-0E8AC72E6402")

    // We discover services by scanning for these characteristics
    // The service UUID that contains these chars
    static let SERVICE_UUID = CBUUID(string: "00002760-08C2-11E1-9073-0E8AC72E0000")

    // Transport constants
    static let HEADER_BYTE: UInt8 = 0xAA
    static let SOURCE_PHONE: UInt8 = 1
    static let DEST_GLASSES: UInt8 = 2
    static let MAX_PACKET_PAYLOAD: Int = 236
}

// Service IDs from service_id_def.proto
private enum ServiceID: UInt8 {
    case g2Setting = 9         // 0x09 - UI_SETTING_APP_ID
    case onboarding = 16       // 0x10 - UI_ONBOARDING_APP_ID
    case deviceSettings = 128  // 0x80 - UX_DEVICE_SETTINGS_APP_ID
    case evenHub = 224         // 0xE0 - UI_BACKGROUND_EVENHUB_APP_ID
}

// EvenHub command IDs from EvenHub.proto
private enum EvenHubCmd: Int32 {
    case createStartupPage = 0   // APP_REQUEST_CREATE_STARTUP_PAGE_PACKET
    case updateImageRawData = 3  // APP_UPDATE_IMAGE_RAW_DATA_PACKET
    case updateTextData = 5      // APP_UPDATE_TEXT_DATA_PACKET
    case shutdownPage = 9        // APP_REQUEST_SHUTDOWN_PAGE_PACKET
    case heartbeat = 12          // APP_REQUEST_HEARTBEAT_PACKET
    case audioControl = 15       // APP_REQUEST_AUDIO_CTR_PACKET
}

// EvenHub response command IDs (from glasses → phone)
private enum EvenHubResponseCmd: Int32 {
    case osNotifyEventToApp = 2  // OS_NOITY_EVENT_TO_APP_PACKET - touch/gesture events
}

// OsEventTypeList from EvenHub.proto
private enum OsEventType: Int32 {
    case click = 0
    case scrollTop = 1
    case scrollBottom = 2
    case doubleClick = 3
    case foregroundEnter = 4
    case foregroundExit = 5
    case abnormalExit = 6
    case systemExit = 7
}

// g2_settingCommandId from g2_setting.proto
private enum G2SettingCommandId: Int32 {
    case none = 0
    case deviceReceiveInfo = 1    // Send settings TO glasses
    case deviceReceiveRequest = 2 // Request info FROM glasses
    case deviceSendToApp = 3      // Glasses sends info TO app
    case deviceRespondToApp = 4   // Glasses responds to app
}

// DevCfgCommandId from dev_config_protocol.proto
private enum DevCfgCommandId: Int32 {
    case authentication = 4
    case pipeRoleChange = 5
    case timeSync = 128
    case baseConnHeartBeat = 14
}

// MARK: - CRC16 (matches Python calc_crc)

private func calcCRC16(_ data: Data) -> UInt16 {
    var crc: UInt16 = 0xFFFF
    for byte in data {
        crc = ((crc >> 8) | ((crc << 8) & 0xFF00)) ^ UInt16(byte)
        crc ^= (crc & 0xFF) >> 4
        crc ^= (crc << 12) & 0xFFFF
        crc ^= ((crc & 0xFF) << 5) & 0xFFFF
    }
    return crc & 0xFFFF
}

// MARK: - Minimal Protobuf Encoding Helpers

// We manually encode protobuf messages rather than using codegen.
// This keeps dependencies minimal and matches the known field numbers from the .proto files.

private struct ProtobufWriter {
    private(set) var data = Data()

    // Varint encoding
    mutating func writeVarint(_ value: UInt64) {
        var v = value
        while v > 0x7F {
            data.append(UInt8(v & 0x7F) | 0x80)
            v >>= 7
        }
        data.append(UInt8(v))
    }

    mutating func writeInt32Field(_ fieldNumber: Int, _ value: Int32) {
        let tag = UInt64(fieldNumber << 3) | 0 // wire type 0 = varint
        writeVarint(tag)
        // protobuf int32 uses varint encoding; negative values use 10 bytes
        if value >= 0 {
            writeVarint(UInt64(value))
        } else {
            writeVarint(UInt64(bitPattern: Int64(value)))
        }
    }

    mutating func writeStringField(_ fieldNumber: Int, _ value: String) {
        let tag = UInt64(fieldNumber << 3) | 2 // wire type 2 = length-delimited
        writeVarint(tag)
        let utf8 = Array(value.utf8)
        writeVarint(UInt64(utf8.count))
        data.append(contentsOf: utf8)
    }

    mutating func writeBytesField(_ fieldNumber: Int, _ value: Data) {
        let tag = UInt64(fieldNumber << 3) | 2 // wire type 2 = length-delimited
        writeVarint(tag)
        writeVarint(UInt64(value.count))
        data.append(value)
    }

    // Embed a sub-message (length-delimited)
    mutating func writeMessageField(_ fieldNumber: Int, _ subMessage: Data) {
        let tag = UInt64(fieldNumber << 3) | 2
        writeVarint(tag)
        writeVarint(UInt64(subMessage.count))
        data.append(subMessage)
    }

    mutating func writeBoolField(_ fieldNumber: Int, _ value: Bool) {
        writeInt32Field(fieldNumber, value ? 1 : 0)
    }
}

// MARK: - Minimal Protobuf Decoding Helpers

private struct ProtobufReader {
    private let data: Data
    private var offset: Int = 0

    init(_ data: Data) {
        self.data = data
    }

    var hasMore: Bool { offset < data.count }

    mutating func readVarint() -> UInt64? {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        while offset < data.count {
            let byte = data[data.startIndex + offset]
            offset += 1
            result |= UInt64(byte & 0x7F) << shift
            if byte & 0x80 == 0 { return result }
            shift += 7
            if shift > 63 { return nil }
        }
        return nil
    }

    // Returns (fieldNumber, wireType) or nil
    mutating func readTag() -> (Int, Int)? {
        guard let tag = readVarint() else { return nil }
        return (Int(tag >> 3), Int(tag & 0x07))
    }

    mutating func readInt32() -> Int32? {
        guard let v = readVarint() else { return nil }
        return Int32(truncatingIfNeeded: v)
    }

    mutating func readBytes() -> Data? {
        guard let len = readVarint() else { return nil }
        let length = Int(len)
        guard offset + length <= data.count else { return nil }
        let result = data[(data.startIndex + offset)..<(data.startIndex + offset + length)]
        offset += length
        return Data(result)
    }

    mutating func readString() -> String? {
        guard let bytes = readBytes() else { return nil }
        return String(data: bytes, encoding: .utf8)
    }

    // Skip a field value based on wire type
    mutating func skipField(wireType: Int) {
        switch wireType {
        case 0: _ = readVarint()        // varint
        case 1: offset += 8              // 64-bit
        case 2: _ = readBytes()          // length-delimited
        case 5: offset += 4              // 32-bit
        default: break
        }
    }

    // Parse a message into a dictionary of field# -> value
    // Values are: Int32 for varint, Data for length-delimited
    mutating func parseFields() -> [Int: Any] {
        var fields: [Int: Any] = [:]
        while hasMore {
            guard let (fieldNum, wireType) = readTag() else { break }
            switch wireType {
            case 0: // varint
                if let v = readVarint() { fields[fieldNum] = Int32(truncatingIfNeeded: v) }
            case 2: // length-delimited (submessage or bytes or string)
                if let d = readBytes() { fields[fieldNum] = d }
            default:
                skipField(wireType: wireType)
            }
        }
        return fields
    }
}

// MARK: - EvenHub Protobuf Message Builders

private enum EvenHubProto {
    // Build a TextContainerProperty message
    static func textContainerProperty(
        x: Int32, y: Int32, width: Int32, height: Int32,
        borderWidth: Int32 = 0, borderColor: Int32 = 0, borderRadius: Int32 = 0,
        paddingLength: Int32 = 0, containerID: Int32,
        containerName: String? = nil, isEventCapture: Bool = false,
        content: String? = nil
    ) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, x)           // XPosition
        w.writeInt32Field(2, y)           // YPosition
        w.writeInt32Field(3, width)       // Width
        w.writeInt32Field(4, height)      // Height
        w.writeInt32Field(5, borderWidth) // BorderWidth
        w.writeInt32Field(6, borderColor) // BorderColor
        w.writeInt32Field(7, borderRadius) // BorderRdaius (sic - typo in proto)
        w.writeInt32Field(8, paddingLength) // PaddingLength
        w.writeInt32Field(9, containerID) // ContainerID
        if let name = containerName {
            w.writeStringField(10, name)  // ContainerName
        }
        w.writeInt32Field(11, isEventCapture ? 1 : 0) // IsEventCapture
        if let content = content {
            w.writeStringField(12, content) // Content
        }
        return w.data
    }

    // Build an ImageContainerProperty message
    static func imageContainerProperty(
        x: Int32, y: Int32, width: Int32, height: Int32,
        containerID: Int32, containerName: String? = nil
    ) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, x)           // XPosition
        w.writeInt32Field(2, y)           // YPosition
        w.writeInt32Field(3, width)       // Width
        w.writeInt32Field(4, height)      // Height
        w.writeInt32Field(5, containerID) // ContainerID
        if let name = containerName {
            w.writeStringField(6, name)   // ContainerName
        }
        return w.data
    }

    // Build an ImageRawDataUpdate message
    static func imageRawDataUpdate(
        containerID: Int32, containerName: String? = nil,
        mapSessionId: Int32, mapTotalSize: Int32, compressMode: Int32 = 0,
        mapFragmentIndex: Int32, mapFragmentPacketSize: Int32, mapRawData: Data
    ) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, containerID)            // ContainerID
        if let name = containerName {
            w.writeStringField(2, name)              // ContainerName
        }
        w.writeInt32Field(3, mapSessionId)           // MapSessionId
        w.writeInt32Field(4, mapTotalSize)           // MapTotalSize
        w.writeInt32Field(5, compressMode)           // CompressMode
        w.writeInt32Field(6, mapFragmentIndex)       // MapFragmentIndex
        w.writeInt32Field(7, mapFragmentPacketSize)  // MapFragmentPacketSize
        w.writeBytesField(8, mapRawData)             // MapRawData
        return w.data
    }

    // Build a CreateStartUpPageContainer message
    static func createStartupPageContainer(
        containerTotalNum: Int32,
        textContainers: [Data] = [],
        imageContainers: [Data] = []
    ) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, containerTotalNum) // ContainerTotalNum
        // field 2 = repeated ListContainerProperty ListObject (not used here)
        for tc in textContainers {
            w.writeMessageField(3, tc)  // field 3 = repeated TextObject
        }
        for ic in imageContainers {
            w.writeMessageField(4, ic)  // field 4 = repeated ImageObject
        }
        return w.data
    }

    // Build a TextContainerUpgrade message
    static func textContainerUpgrade(
        containerID: Int32, contentOffset: Int32 = 0,
        contentLength: Int32, content: String
    ) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, containerID)     // ContainerID
        w.writeInt32Field(3, contentOffset)   // ContentOffset
        w.writeInt32Field(4, contentLength)   // ContentLength
        w.writeStringField(5, content)        // Content
        return w.data
    }

    // Build a ShutDownContaniner message (sic - typo in proto)
    static func shutdownContainer(exitMode: Int32 = 0) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, exitMode) // exitMode
        return w.data
    }

    // Build a HeartBeatPacket message
    static func heartbeatPacket(cnt: Int32 = 0) -> Data {
        var w = ProtobufWriter()
        if cnt != 0 {
            w.writeInt32Field(1, cnt)  // Cnt
        }
        return w.data
    }

    // Build an AudioCtrCmd message
    static func audioCtrCmd(enable: Bool) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, enable ? 1 : 0) // AudoFuncEn
        return w.data
    }

    // Build an evenhub_main_msg_ctx wrapper
    static func evenHubMessage(cmd: EvenHubCmd, subFieldNumber: Int, subMessage: Data) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, cmd.rawValue) // Cmd (field 1, enum)
        // MagicRandom will be set by the send layer (field 2)
        w.writeMessageField(subFieldNumber, subMessage) // the actual command payload
        return w.data
    }

    // Convenience builders for full evenhub messages
    static func createPageMessage(textContainers: [Data] = [], imageContainers: [Data] = []) -> Data {
        let total = Int32(textContainers.count + imageContainers.count)
        let createMsg = createStartupPageContainer(
            containerTotalNum: total,
            textContainers: textContainers,
            imageContainers: imageContainers
        )
        return evenHubMessage(cmd: .createStartupPage, subFieldNumber: 3, subMessage: createMsg)
    }

    static func updateImageRawDataMessage(
        containerID: Int32, containerName: String? = nil,
        mapSessionId: Int32, mapTotalSize: Int32, compressMode: Int32 = 0,
        mapFragmentIndex: Int32, mapFragmentPacketSize: Int32, mapRawData: Data
    ) -> Data {
        let updateMsg = imageRawDataUpdate(
            containerID: containerID, containerName: containerName,
            mapSessionId: mapSessionId, mapTotalSize: mapTotalSize,
            compressMode: compressMode,
            mapFragmentIndex: mapFragmentIndex,
            mapFragmentPacketSize: mapFragmentPacketSize,
            mapRawData: mapRawData
        )
        return evenHubMessage(cmd: .updateImageRawData, subFieldNumber: 5, subMessage: updateMsg)
    }

    static func updateTextMessage(containerID: Int32, contentOffset: Int32 = 0, contentLength: Int32, content: String) -> Data {
        let upgradeMsg = textContainerUpgrade(
            containerID: containerID, contentOffset: contentOffset,
            contentLength: contentLength, content: content
        )
        return evenHubMessage(cmd: .updateTextData, subFieldNumber: 9, subMessage: upgradeMsg)
    }

    static func shutdownMessage(exitMode: Int32 = 0) -> Data {
        let shutdownMsg = shutdownContainer(exitMode: exitMode)
        return evenHubMessage(cmd: .shutdownPage, subFieldNumber: 11, subMessage: shutdownMsg)
    }

    static func heartbeatMessage() -> Data {
        let hbMsg = heartbeatPacket()
        return evenHubMessage(cmd: .heartbeat, subFieldNumber: 14, subMessage: hbMsg)
    }

    static func audioControlMessage(enable: Bool) -> Data {
        let audioMsg = audioCtrCmd(enable: enable)
        return evenHubMessage(cmd: .audioControl, subFieldNumber: 18, subMessage: audioMsg)
    }
}

// MARK: - DevSettings Auth Protobuf Builders

private enum DevSettingsProto {
    // DevCfgDataPackage with AUTHENTICATION command
    static func authCmd(magicRandom: Int32) -> Data {
        // DevCfgDataPackage:
        //   field 1 = commandId (enum)
        //   field 2 = magicRandom (int32)
        //   field 3 = authMgr (AuthMgr message)
        var w = ProtobufWriter()
        w.writeInt32Field(1, DevCfgCommandId.authentication.rawValue) // commandId
        w.writeInt32Field(2, magicRandom) // magicRandom

        // AuthMgr sub-message:
        //   field 1 = secAuth (bool)
        //   field 2 = phoneType (enum eDevice: PHONE_IOS=3, PHONE_ANDROID=4)
        var authW = ProtobufWriter()
        authW.writeBoolField(1, true) // secAuth
        authW.writeInt32Field(2, 3)   // phoneType = PHONE_IOS (eDevice.PHONE_IOS=3)

        w.writeMessageField(3, authW.data) // authMgr
        return w.data
    }

    // DevCfgDataPackage with PIPE_ROLE_CHANGE command
    static func pipeRoleChange(magicRandom: Int32) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, DevCfgCommandId.pipeRoleChange.rawValue)
        w.writeInt32Field(2, magicRandom)

        // PipeRoleChange: field 1 = asCmdRole (enum GlassesLR.RIGHT=1)
        var roleW = ProtobufWriter()
        roleW.writeInt32Field(1, 1) // RIGHT
        w.writeMessageField(4, roleW.data) // roleChange (field 4 in DevCfgDataPackage)
        return w.data
    }

    // DevCfgDataPackage with TIME_SYNC command
    static func timeSync(magicRandom: Int32) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, DevCfgCommandId.timeSync.rawValue)
        w.writeInt32Field(2, magicRandom)

        // TimeSync: field 1 = timestamp (int32), field 2 = timezone (int32)
        var tsW = ProtobufWriter()
        let timestamp = Int32(Date().timeIntervalSince1970)
        tsW.writeInt32Field(1, timestamp)
        let tz = Int32(TimeZone.current.secondsFromGMT() / 3600)
        tsW.writeInt32Field(2, tz)
        w.writeMessageField(128, tsW.data) // timeSync (field 128 in DevCfgDataPackage)
        return w.data
    }

    // DevCfgDataPackage with BASE_CONNECT_HEART_BEAT command
    static func baseHeartbeat(magicRandom: Int32) -> Data {
        var w = ProtobufWriter()
        w.writeInt32Field(1, DevCfgCommandId.baseConnHeartBeat.rawValue)
        w.writeInt32Field(2, magicRandom)

        // BaseConnHeartBeat: empty message
        var hbW = ProtobufWriter()
        _ = hbW // empty
        w.writeMessageField(13, hbW.data) // baseHeartBeat (field 13)
        return w.data
    }
}

// MARK: - G2 Settings Protobuf Builders (g2_setting.proto, service ID 9)

private enum G2SettingProto {
    // Set brightness: G2SettingPackage with DeviceReceiveInfo + DeviceReceive_Brightness
    static func setBrightness(magicRandom: Int32, level: Int32, autoAdjust: Bool) -> Data {
        // DeviceReceive_Brightness
        var brightnessW = ProtobufWriter()
        brightnessW.writeInt32Field(1, autoAdjust ? 1 : 0) // autoAdjust
        brightnessW.writeInt32Field(2, level)                // brightnessLevel

        // DeviceReceiveInfoFromAPP
        var infoW = ProtobufWriter()
        infoW.writeMessageField(1, brightnessW.data) // deviceReceiveBrightness (field 1)

        // G2SettingPackage
        var w = ProtobufWriter()
        w.writeInt32Field(1, G2SettingCommandId.deviceReceiveInfo.rawValue) // commandId
        w.writeInt32Field(2, magicRandom)
        w.writeMessageField(3, infoW.data) // deviceReceiveInfoFromApp (field 3)
        return w.data
    }

    // Request battery/version/etc: G2SettingPackage with DeviceReceiveRequest
    static func requestInfo(magicRandom: Int32) -> Data {
        // DeviceReceiveRequestFromAPP - empty message triggers glasses to respond with all fields
        var reqW = ProtobufWriter()
        // Request brightness info type
        reqW.writeInt32Field(1, 1) // settingInfoType = APP_REQUIRE_BASIC_SETTING

        // G2SettingPackage
        var w = ProtobufWriter()
        w.writeInt32Field(1, G2SettingCommandId.deviceReceiveRequest.rawValue) // commandId
        w.writeInt32Field(2, magicRandom)
        w.writeMessageField(4, reqW.data) // deviceReceiveRequestFromApp (field 4)
        return w.data
    }
}

// MARK: - Onboarding Protobuf Builders (onboarding.proto, service ID 16)

private enum OnboardingProto {
    // Skip onboarding: OnboardingDataPackage with CONFIG command, processId=FINISH
    static func skipOnboarding(magicRandom: Int32) -> Data {
        // OnboardingConfig: processId = FINISH (4)
        var configW = ProtobufWriter()
        configW.writeInt32Field(1, 4) // processId = FINISH

        // OnboardingDataPackage
        var w = ProtobufWriter()
        w.writeInt32Field(1, 1) // commandId = CONFIG
        w.writeInt32Field(2, magicRandom)
        w.writeMessageField(3, configW.data) // config (field 3)
        return w.data
    }
}

// MARK: - EvenBLE Transport Layer

// Builds and splits payloads into BLE packets with the EvenHub transport framing
private struct EvenBLETransport {
    var syncId: UInt8

    // Build one or more framed packets for a payload
    static func buildPackets(syncId: UInt8, serviceId: UInt8, payload: Data, reserveFlag: Bool = false) -> [Data] {
        let maxPayload = G2BLE.MAX_PACKET_PAYLOAD

        // Split payload into chunks
        var chunks: [Data] = []
        var offset = 0
        while offset < payload.count {
            let end = min(offset + maxPayload, payload.count)
            chunks.append(payload[offset..<end])
            offset = end
        }
        if chunks.isEmpty {
            chunks.append(Data())
        }

        // If last chunk is exactly max size, we need an extra packet for CRC
        let needExtraCrcPacket = (chunks.last!.count == maxPayload)
        if needExtraCrcPacket {
            chunks.append(Data())
        }

        let totalPackets = UInt8(chunks.count)
        let crc = calcCRC16(payload)

        var packets: [Data] = []
        for (i, chunk) in chunks.enumerated() {
            let serialNum = UInt8(i + 1)
            let isLast = (serialNum == totalPackets)

            // status byte: bit0=notify, bits1-4=resultCode, bit5=reserveFlag, bits6-7=reserve
            let status: UInt8 = (reserveFlag ? 0x20 : 0x00)

            // payload length includes CRC if last packet
            let payloadLen = UInt8(chunk.count + (isLast ? 2 : 0))

            var packet = Data()
            packet.append(G2BLE.HEADER_BYTE)                                    // [0] 0xAA
            packet.append((G2BLE.DEST_GLASSES << 4) | G2BLE.SOURCE_PHONE)       // [1] src+dst
            packet.append(syncId)                                                // [2] syncId
            packet.append(payloadLen)                                            // [3] payloadLen
            packet.append(totalPackets)                                          // [4] packetTotalNum
            packet.append(serialNum)                                             // [5] packetSerialNum
            packet.append(serviceId)                                             // [6] serviceId
            packet.append(status)                                                // [7] status

            packet.append(chunk)

            if isLast {
                packet.append(UInt8(crc & 0xFF))         // CRC low
                packet.append(UInt8((crc >> 8) & 0xFF))  // CRC high
            }

            packets.append(packet)
        }

        return packets
    }
}

// MARK: - G2 Send Manager

// Manages syncId counter and sends packets over BLE
private class G2SendManager {
    private var syncId: UInt8 = 0
    private var magicRandom: UInt8 = 0

    func nextSyncId() -> UInt8 {
        let id = syncId
        syncId = syncId &+ 1
        return id
    }

    func nextMagicRandom() -> Int32 {
        let val = magicRandom
        magicRandom = magicRandom &+ 1
        return Int32(val)
    }

    func buildPackets(serviceId: UInt8, payload: Data, reserveFlag: Bool = false) -> [Data] {
        let sid = nextSyncId()
        return EvenBLETransport.buildPackets(syncId: sid, serviceId: serviceId, payload: payload, reserveFlag: reserveFlag)
    }
}

// MARK: - G2 Receive Manager (multi-part reassembly)

private class G2ReceiveManager {
    private var partials: [String: (Data, UInt8)] = [:] // key -> (accumulated payload, lastSerialNum)

    func handlePacket(_ rawData: Data) -> (serviceId: UInt8, payload: Data)? {
        guard rawData.count >= 8 else { return nil }
        guard rawData[0] == G2BLE.HEADER_BYTE else { return nil }

        let payloadLen = Int(rawData[3])
        let expectedLen = payloadLen + 8
        guard rawData.count >= expectedLen else { return nil }

        let totalPackets = rawData[4]
        let serialNum = rawData[5]
        let serviceId = rawData[6]
        let status = rawData[7]
        let resultCode = (status >> 1) & 0x0F

        guard resultCode == 0 else { return nil }

        let isLast = (serialNum == totalPackets)
        let hasCrc = isLast
        let payloadEnd = 8 + payloadLen - (hasCrc ? 2 : 0)
        let payload = rawData[8..<payloadEnd]

        let syncId = rawData[2]
        let key = "\(serviceId)-\(syncId)"

        if serialNum > 1 {
            guard var existing = partials[key] else { return nil }
            existing.0.append(payload)
            existing.1 = serialNum
            partials[key] = existing
        } else if totalPackets > 1 {
            partials[key] = (Data(payload), serialNum)
        }

        if !isLast {
            if serialNum == 1 && totalPackets > 1 {
                // Already stored above
            }
            return nil
        }

        let fullPayload: Data
        if let existing = partials[key] {
            var accumulated = existing.0
            if serialNum > 1 {
                // already appended above
            } else {
                accumulated.append(payload)
            }
            fullPayload = accumulated
            partials.removeValue(forKey: key)
        } else {
            fullPayload = Data(payload)
        }

        return (serviceId, fullPayload)
    }
}

// MARK: - G2 Class (SGCManager implementation)

// Actor for reconnection logic (matches G1 pattern)
actor G2ReconnectionManager {
    private var task: Task<Void, Never>?
    private let intervalSeconds: TimeInterval
    private var attempts = 0
    private let maxAttempts: Int // -1 for unlimited

    init(intervalSeconds: TimeInterval = 30, maxAttempts: Int = -1) {
        self.intervalSeconds = intervalSeconds
        self.maxAttempts = maxAttempts
    }

    var isRunning: Bool {
        task != nil && task?.isCancelled == false
    }

    func start(onAttempt: @escaping @Sendable () async -> Bool) {
        stop()
        attempts = 0

        task = Task {
            while !Task.isCancelled {
                if maxAttempts > 0, attempts >= maxAttempts {
                    Bridge.log("G2: Max reconnection attempts (\(maxAttempts)) reached")
                    break
                }

                attempts += 1
                Bridge.log("G2: Reconnection attempt \(attempts)")

                let shouldStop = await onAttempt()

                if shouldStop {
                    Bridge.log("G2: Reconnection successful, stopping")
                    break
                }

                do {
                    try await Task.sleep(nanoseconds: UInt64(intervalSeconds * 1_000_000_000))
                } catch {
                    break
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        attempts = 0
    }
}

@MainActor
class G2: NSObject, SGCManager {
    var type = DeviceTypes.G2
    let hasMic = true

    // Connection state
    private var connectionState: String = ConnTypes.DISCONNECTED
    private var _ready: Bool = false
    private var ready: Bool {
        get { _ready }
        set {
            _ready = newValue
            if !newValue {
                batteryLevel = -1
            }
        }
    }

    // BLE peripherals (L+R)
    private var centralManager: CBCentralManager?
    private var leftPeripheral: CBPeripheral?
    private var rightPeripheral: CBPeripheral?
    private var leftWriteChar: CBCharacteristic?
    private var rightWriteChar: CBCharacteristic?
    private var leftNotifyChar: CBCharacteristic?
    private var rightNotifyChar: CBCharacteristic?
    private var rightAudioChar: CBCharacteristic?
    private var leftAudioChar: CBCharacteristic?
    private var leftInitialized: Bool = false
    private var rightInitialized: Bool = false
    private var isDisconnecting = false

    // Device search
    var DEVICE_SEARCH_ID = "NOT_SET"

    // Stored UUIDs for background reconnection
    private var leftGlassUUID: UUID? {
        get { UserDefaults.standard.string(forKey: "g2_leftGlassUUID").flatMap { UUID(uuidString: $0) } }
        set {
            if let v = newValue { UserDefaults.standard.set(v.uuidString, forKey: "g2_leftGlassUUID") }
            else { UserDefaults.standard.removeObject(forKey: "g2_leftGlassUUID") }
        }
    }
    private var rightGlassUUID: UUID? {
        get { UserDefaults.standard.string(forKey: "g2_rightGlassUUID").flatMap { UUID(uuidString: $0) } }
        set {
            if let v = newValue { UserDefaults.standard.set(v.uuidString, forKey: "g2_rightGlassUUID") }
            else { UserDefaults.standard.removeObject(forKey: "g2_rightGlassUUID") }
        }
    }

    // Reconnection
    private let reconnectionManager = G2ReconnectionManager()

    // Protocol state
    private let sendManager = G2SendManager()
    private let receiveManager = G2ReceiveManager()
    private var heartbeatTimer: Timer?
    private var devSettingsHeartbeatTimer: Timer?
    private var micEnabled_: Bool = false
    private var pageCreated: Bool = false
    private var currentTextContent: String = ""
    private var textContainerID: Int32 = 1
    private var imageSessionCounter: Int = 0
    private var heartbeatCounter: Int = 0
    private var authStarted: Bool = false

    // Published state
    @Published var batteryLevel: Int = -1 {
        didSet {
            if batteryLevel != oldValue && batteryLevel >= 0 {
                GlassesStore.shared.apply("glasses", "batteryLevel", batteryLevel)
                Bridge.sendBatteryStatus(level: batteryLevel, charging: isCharging)
            }
        }
    }
    private var isCharging: Bool = false
    @Published var aiListening: Bool = false

    static let _bluetoothQueue = DispatchQueue(label: "BluetoothG2", qos: .userInitiated)

    // MARK: - Initialization

    override init() {
        super.init()
    }

    deinit {
        centralManager?.delegate = nil
        leftPeripheral?.delegate = nil
        rightPeripheral?.delegate = nil
    }

    // MARK: - BLE Sending

    private func sendToGlasses(_ packets: [Data], left: Bool = false, right: Bool = true) {
        for packet in packets {
            if right, let char = rightWriteChar, let peripheral = rightPeripheral {
                peripheral.writeValue(packet, for: char, type: .withoutResponse)
            }
            if left, let char = leftWriteChar, let peripheral = leftPeripheral {
                peripheral.writeValue(packet, for: char, type: .withoutResponse)
            }
        }
    }

    private func sendEvenHubCommand(_ payload: Data) {
        let packets = sendManager.buildPackets(
            serviceId: ServiceID.evenHub.rawValue,
            payload: payload,
            reserveFlag: true
        )
        sendToGlasses(packets)
    }

    private func sendDevSettingsCommand(_ payload: Data, left: Bool = false, right: Bool = true) {
        let packets = sendManager.buildPackets(
            serviceId: ServiceID.deviceSettings.rawValue,
            payload: payload
        )
        sendToGlasses(packets, left: left, right: right)
    }

    private func sendG2SettingCommand(_ payload: Data) {
        let packets = sendManager.buildPackets(
            serviceId: ServiceID.g2Setting.rawValue,
            payload: payload,
            reserveFlag: true
        )
        sendToGlasses(packets)
    }

    private func sendOnboardingCommand(_ payload: Data) {
        let packets = sendManager.buildPackets(
            serviceId: ServiceID.onboarding.rawValue,
            payload: payload,
            reserveFlag: true
        )
        sendToGlasses(packets)
    }

    // MARK: - Authentication Sequence

    private func runAuthSequence() {
        Bridge.log("G2: Running auth sequence")

        // Auth to left side
        if leftPeripheral != nil && leftWriteChar != nil {
            let authL = DevSettingsProto.authCmd(magicRandom: sendManager.nextMagicRandom())
            sendDevSettingsCommand(authL, left: true, right: false)
        }

        // Small delay then auth right + pipe role change + time sync
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self = self else { return }

            let authR = DevSettingsProto.authCmd(magicRandom: self.sendManager.nextMagicRandom())
            self.sendDevSettingsCommand(authR, left: false, right: true)

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                guard let self = self else { return }

                let roleChange = DevSettingsProto.pipeRoleChange(magicRandom: self.sendManager.nextMagicRandom())
                self.sendDevSettingsCommand(roleChange, left: false, right: true)

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                    guard let self = self else { return }

                    let timeSync = DevSettingsProto.timeSync(magicRandom: self.sendManager.nextMagicRandom())
                    self.sendDevSettingsCommand(timeSync)

                    // Skip onboarding on connect
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                        guard let self = self else { return }
                        let onboarding = OnboardingProto.skipOnboarding(magicRandom: self.sendManager.nextMagicRandom())
                        self.sendOnboardingCommand(onboarding)
                        Bridge.log("G2: Sent onboarding skip (FINISH)")
                    }

                    // Start heartbeats after auth
                    self.startHeartbeats()

                    // Mark as ready and request device info (version + battery)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                        guard let self = self else { return }
                        self.ready = true
                        Task { await self.reconnectionManager.stop() }
                        Bridge.log("G2: Auth sequence complete, glasses ready")

                        // Set device_name so CoreManager can save it for reconnection
                        if let peripheralName = self.rightPeripheral?.name ?? self.leftPeripheral?.name,
                           let idNumber = self.extractIdNumber(peripheralName) {
                            let deviceId = "\(idNumber)"
                            GlassesStore.shared.apply("core", "device_name", deviceId)
                            Bridge.log("G2: Set device_name to \(deviceId)")
                        }

                        GlassesStore.shared.apply("glasses", "connected", true)
                        GlassesStore.shared.apply("glasses", "fullyBooted", true)

                        // Query version + battery info from glasses
                        self.requestDeviceInfo()
                    }
                }
            }
        }
    }

    // MARK: - Heartbeats

    private func startHeartbeats() {
        // EvenHub heartbeat every 5 seconds
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            DispatchQueue.main.async {
                self?.sendEvenHubHeartbeat()
            }
        }

        // DevSettings heartbeat every 5 seconds
        devSettingsHeartbeatTimer?.invalidate()
        devSettingsHeartbeatTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            DispatchQueue.main.async {
                self?.sendDevSettingsHeartbeat()
            }
        }
    }

    private func stopHeartbeats() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        devSettingsHeartbeatTimer?.invalidate()
        devSettingsHeartbeatTimer = nil
    }

    private func sendEvenHubHeartbeat() {
        guard ready else { return }
        let msg = EvenHubProto.heartbeatMessage()
        sendEvenHubCommand(msg)

        // Poll battery every 10 heartbeats (~50 seconds)
        heartbeatCounter += 1
        if heartbeatCounter % 10 == 0 {
            requestDeviceInfo()
        }
    }

    private func sendDevSettingsHeartbeat() {
        guard ready else { return }
        let msg = DevSettingsProto.baseHeartbeat(magicRandom: sendManager.nextMagicRandom())
        sendDevSettingsCommand(msg)
    }

    // Request battery, version, and other device info via g2_setting service
    private func requestDeviceInfo() {
        let msg = G2SettingProto.requestInfo(magicRandom: sendManager.nextMagicRandom())
        sendG2SettingCommand(msg)
        Bridge.log("G2: Requested device info (battery/version)")
    }

    // MARK: - SGCManager: Display Control

    func sendTextWall(_ text: String) {
        Bridge.log("G2: sendTextWall(\(text.prefix(50))...)")

        if text.isEmpty {
            clearDisplay()
            return
        }

        if !pageCreated {
            createPageWithText(text)
        } else {
            updateText(text)
        }
    }

    func sendDoubleTextWall(_ top: String, _ bottom: String) {
        // G2 doesn't have native double text wall, combine them
        let combined = top + "\n" + bottom
        sendTextWall(combined)
    }

    func clearDisplay() {
        Bridge.log("G2: clearDisplay()")
        // Don't shutdown the EvenHub page — that kills audio streaming too.
        // Instead, just clear the text content by sending a space.
        // if pageCreated {
        //     let msg = EvenHubProto.shutdownMessage()
        //     sendEvenHubCommand(msg)
        //     pageCreated = false
        //     currentTextContent = ""
        // }
        if pageCreated {
            sendTextWall(" ")
        }
    }

    func displayBitmap(base64ImageData: String) async -> Bool {
        guard let rawData = Data(base64Encoded: base64ImageData) else {
            Bridge.log("G2: displayBitmap() - failed to decode base64")
            return false
        }

        Bridge.log("G2: displayBitmap() - decoded \(rawData.count) bytes from base64")

        // Convert to G2-native 4-bit BMP (scaled down to keep BLE transfer small)
        guard let bmp = convertToG2Bmp(rawData) else {
            Bridge.log("G2: displayBitmap() - failed to convert image to G2 BMP format")
            return false
        }

        Bridge.log("G2: displayBitmap() - converted to G2 BMP: \(bmp.data.count) bytes (\(bmp.width)x\(bmp.height))")

        // Shut down existing page, then create image page with container matching BMP size
        let imageContainerID: Int32 = 2
        let imageContainerName = "img-main"

        // Center the image container on the display
        let containerX = (G2.g2DisplayWidth - bmp.width) / 2
        let containerY = (G2.g2DisplayHeight - bmp.height) / 2

        let ic = EvenHubProto.imageContainerProperty(
            x: Int32(containerX), y: Int32(containerY),
            width: Int32(bmp.width), height: Int32(bmp.height),
            containerID: imageContainerID, containerName: imageContainerName
        )
        let createMsg = EvenHubProto.createPageMessage(imageContainers: [ic])
        sendEvenHubCommand(createMsg)
        pageCreated = true
        try? await Task.sleep(nanoseconds: 500_000_000) // 500ms

        // Send BMP data in fragments (4096 bytes per fragment)
        let fragmentSize = 4096
        imageSessionCounter += 1
        let sessionId = imageSessionCounter
        let totalSize = Int32(bmp.data.count)
        var fragmentIndex: Int32 = 0
        var offset = 0

        while offset < bmp.data.count {
            let end = min(offset + fragmentSize, bmp.data.count)
            let fragment = bmp.data[offset..<end]

            let msg = EvenHubProto.updateImageRawDataMessage(
                containerID: imageContainerID,
                containerName: imageContainerName,
                mapSessionId: Int32(sessionId),
                mapTotalSize: totalSize,
                compressMode: 0,
                mapFragmentIndex: fragmentIndex,
                mapFragmentPacketSize: Int32(fragment.count),
                mapRawData: Data(fragment)
            )
            sendEvenHubCommand(msg)

            fragmentIndex += 1
            offset = end

            // Small delay between fragments to avoid overwhelming BLE
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }

        Bridge.log("G2: displayBitmap() - sent \(fragmentIndex) fragments")
        return true
    }

    // MARK: - Bitmap Conversion (any input → G2-native 4-bit BMP)

    private static let g2DisplayWidth = 640
    private static let g2DisplayHeight = 200

    /// Result of BMP conversion — includes BMP data and dimensions for container sizing.
    private struct G2BmpResult {
        let data: Data
        let width: Int
        let height: Int
    }

    /// Convert any image data to a G2-native 4-bit indexed BMP.
    /// Scales down to keep BLE transfer small. Returns BMP data + actual dimensions.
    private func convertToG2Bmp(_ data: Data) -> G2BmpResult? {
        guard let image = UIImage(data: data), let cgImage = image.cgImage else {
            Bridge.log("G2: convertToG2Bmp - could not decode image data")
            return nil
        }

        let srcWidth = cgImage.width
        let srcHeight = cgImage.height

        // Scale to fit within half-display to keep BLE transfer reasonable (~10KB)
        let maxW = G2.g2DisplayWidth / 2   // 320
        let maxH = G2.g2DisplayHeight / 2  // 100
        let scale = min(1.0, min(Double(maxW) / Double(srcWidth), Double(maxH) / Double(srcHeight)))
        let dstWidth = max(1, Int(Double(srcWidth) * scale))
        let dstHeight = max(1, Int(Double(srcHeight) * scale))

        Bridge.log("G2: convertToG2Bmp - input \(srcWidth)x\(srcHeight) → output \(dstWidth)x\(dstHeight)")

        guard let ctx = CGContext(
            data: nil,
            width: dstWidth,
            height: dstHeight,
            bitsPerComponent: 8,
            bytesPerRow: dstWidth,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else {
            Bridge.log("G2: convertToG2Bmp - failed to create CGContext")
            return nil
        }

        ctx.setFillColor(gray: 0, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: dstWidth, height: dstHeight))
        ctx.interpolationQuality = .high
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: dstWidth, height: dstHeight))

        guard let renderedImage = ctx.makeImage(),
              let pixelData = renderedImage.dataProvider?.data as Data? else {
            Bridge.log("G2: convertToG2Bmp - failed to get rendered pixel data")
            return nil
        }

        guard let bmpData = build4BitBmp(grayscalePixels: pixelData, width: dstWidth, height: dstHeight) else {
            return nil
        }
        return G2BmpResult(data: bmpData, width: dstWidth, height: dstHeight)
    }

    /// Build a 4-bit indexed BMP file from 8-bit grayscale pixel data.
    /// BMP rows are stored bottom-up. Each row is padded to a 4-byte boundary.
    private func build4BitBmp(grayscalePixels: Data, width: Int, height: Int) -> Data? {
        // 4-bit: 2 pixels per byte, rows padded to 4-byte boundary
        let bytesPerRow4bit = (width + 1) / 2 // ceil(width / 2)
        let paddedRowSize = (bytesPerRow4bit + 3) & ~3 // pad to 4-byte boundary
        let pixelDataSize = paddedRowSize * height

        // BMP file header (14 bytes) + DIB header (40 bytes) + color table (16 * 4 = 64 bytes)
        let headerSize = 14 + 40 + 64
        let fileSize = headerSize + pixelDataSize

        var bmp = Data(capacity: fileSize)

        // --- BMP File Header (14 bytes) ---
        bmp.append(contentsOf: [0x42, 0x4D])                        // "BM" signature
        bmp.appendLittleEndian(UInt32(fileSize))                     // File size
        bmp.appendLittleEndian(UInt16(0))                            // Reserved1
        bmp.appendLittleEndian(UInt16(0))                            // Reserved2
        bmp.appendLittleEndian(UInt32(headerSize))                   // Pixel data offset

        // --- DIB Header (BITMAPINFOHEADER, 40 bytes) ---
        bmp.appendLittleEndian(UInt32(40))                           // DIB header size
        bmp.appendLittleEndian(Int32(width))                         // Width
        bmp.appendLittleEndian(Int32(height))                        // Height (positive = bottom-up)
        bmp.appendLittleEndian(UInt16(1))                            // Color planes
        bmp.appendLittleEndian(UInt16(4))                            // Bits per pixel (4-bit)
        bmp.appendLittleEndian(UInt32(0))                            // Compression (none)
        bmp.appendLittleEndian(UInt32(pixelDataSize))                // Image size
        bmp.appendLittleEndian(Int32(2835))                          // X pixels/meter (~72 DPI)
        bmp.appendLittleEndian(Int32(2835))                          // Y pixels/meter
        bmp.appendLittleEndian(UInt32(16))                           // Colors used
        bmp.appendLittleEndian(UInt32(0))                            // Important colors (0 = all)

        // --- Color Table (16 entries, 4 bytes each: B, G, R, 0) ---
        for i in 0..<16 {
            let val = UInt8(i * 17) // 0, 17, 34, ... 255 (evenly spaced grayscale)
            bmp.append(contentsOf: [val, val, val, 0]) // B, G, R, Reserved
        }

        // --- Pixel Data (bottom-up rows, 4-bit packed) ---
        let rowBytes = [UInt8](repeating: 0, count: paddedRowSize)
        for row in 0..<height {
            // BMP is bottom-up: row 0 in BMP = last row of image
            let srcRow = height - 1 - row
            let srcOffset = srcRow * width
            var rowBuf = rowBytes

            for col in 0..<width {
                let pixelIndex = srcOffset + col
                guard pixelIndex < grayscalePixels.count else { continue }

                // Map 8-bit grayscale (0-255) to 4-bit index (0-15)
                let gray8 = grayscalePixels[pixelIndex]
                let index4 = gray8 >> 4 // divide by 16

                let bytePos = col / 2
                if col % 2 == 0 {
                    // High nibble
                    rowBuf[bytePos] = index4 << 4
                } else {
                    // Low nibble
                    rowBuf[bytePos] |= index4
                }
            }
            bmp.append(contentsOf: rowBuf)
        }

        Bridge.log("G2: build4BitBmp - \(bmp.count) bytes (header=\(headerSize), pixels=\(pixelDataSize), rows=\(paddedRowSize)x\(height))")
        return bmp
    }

    func showDashboard() {
        // G2 doesn't have a native dashboard concept via EvenHub
    }

    func setDashboardPosition(_ height: Int, _ depth: Int) {
        // No-op for G2
    }

    func setBrightness(_ level: Int, autoMode: Bool) {
        Bridge.log("G2: setBrightness(\(level), auto=\(autoMode))")
        let msg = G2SettingProto.setBrightness(
            magicRandom: sendManager.nextMagicRandom(),
            level: Int32(level),
            autoAdjust: autoMode
        )
        sendG2SettingCommand(msg)
    }

    // MARK: - Private Display Helpers

    private func createPageWithText(_ text: String) {
        let tc = EvenHubProto.textContainerProperty(
            x: 0, y: 0, width: 640, height: 200,
            borderWidth: 0, borderColor: 0, borderRadius: 0,
            paddingLength: 4, containerID: textContainerID,
            containerName: "text-main", isEventCapture: false,
            content: text
        )

        let msg = EvenHubProto.createPageMessage(textContainers: [tc])
        sendEvenHubCommand(msg)
        pageCreated = true
        currentTextContent = text
    }

    private func updateText(_ text: String) {
        let msg = EvenHubProto.updateTextMessage(
            containerID: textContainerID,
            contentOffset: 0,
            contentLength: Int32(text.utf8.count),
            content: text
        )
        sendEvenHubCommand(msg)
        currentTextContent = text
    }

    // MARK: - SGCManager: Audio Control

    func setMicEnabled(_ enabled: Bool) {
        Bridge.log("G2: setMicEnabled(\(enabled))")
        micEnabled_ = enabled
        GlassesStore.shared.apply("glasses", "micEnabled", enabled)

        let msg = EvenHubProto.audioControlMessage(enable: enabled)
        sendEvenHubCommand(msg)
    }

    func sortMicRanking(list: [String]) -> [String] {
        return list
    }

    // MARK: - SGCManager: Connection Management

    func findCompatibleDevices() {
        Bridge.log("G2: findCompatibleDevices()")
        DEVICE_SEARCH_ID = "NOT_SET"
        startScan()
    }

    func connectById(_ id: String) {
        Bridge.log("G2: connectById(\(id))")
        DEVICE_SEARCH_ID = "_" + id + "_"
        startScan()
    }

    func disconnect() {
        Bridge.log("G2: disconnect()")
        isDisconnecting = true
        stopHeartbeats()
        Task { await reconnectionManager.stop() }

        if let left = leftPeripheral {
            centralManager?.cancelPeripheralConnection(left)
        }
        if let right = rightPeripheral {
            centralManager?.cancelPeripheralConnection(right)
        }

        ready = false
        leftInitialized = false
        rightInitialized = false
        authStarted = false
        pageCreated = false
        heartbeatCounter = 0
        GlassesStore.shared.apply("glasses", "connected", false)
        GlassesStore.shared.apply("glasses", "fullyBooted", false)
    }

    func forget() {
        stopHeartbeats()
        Task { await reconnectionManager.stop() }
        disconnect()
        leftGlassUUID = nil
        rightGlassUUID = nil
        leftPeripheral = nil
        rightPeripheral = nil
        leftWriteChar = nil
        rightWriteChar = nil
        leftNotifyChar = nil
        rightNotifyChar = nil
        rightAudioChar = nil
        leftAudioChar = nil
        DEVICE_SEARCH_ID = "NOT_SET"
        centralManager?.delegate = nil
    }

    func cleanup() {
        disconnect()
    }

    func getConnectedBluetoothName() -> String? {
        return rightPeripheral?.name ?? leftPeripheral?.name
    }

    func ping() {
        sendEvenHubHeartbeat()
    }

    // MARK: - SGCManager: Device Control

    func setHeadUpAngle(_ angle: Int) {
        // TODO: Implement via g2_setting service
    }

    func getBatteryStatus() {
        Bridge.log("G2: getBatteryStatus()")
        requestDeviceInfo()
    }

    func setSilentMode(_ enabled: Bool) {
        // TODO: Implement
    }

    func exit() {
        clearDisplay()
    }

    func sendShutdown() {
        clearDisplay()
        disconnect()
    }

    func sendReboot() {
        // TODO: Implement via dev_settings
    }

    func sendRgbLedControl(
        requestId: String, packageName: String?, action: String, color: String?,
        ontime: Int, offtime: Int, count: Int
    ) {
        // G2 doesn't have RGB LEDs
    }

    // MARK: - SGCManager: Messaging

    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool, requireAck: Bool) {
        // G2 doesn't use JSON messaging
    }

    // MARK: - SGCManager: Camera & Media (not supported on G2)

    func requestPhoto(_ requestId: String, appId: String, size: String?, webhookUrl: String?, authToken: String?, compress: String?, silent: Bool) {}
    func startRtmpStream(_ message: [String: Any]) {}
    func stopRtmpStream() {}
    func sendRtmpKeepAlive(_ message: [String: Any]) {}
    func startBufferRecording() {}
    func stopBufferRecording() {}
    func saveBufferVideo(requestId: String, durationSeconds: Int) {}
    func startVideoRecording(requestId: String, save: Bool, silent: Bool) {}
    func stopVideoRecording(requestId: String) {}
    func sendButtonPhotoSettings() {}
    func sendButtonModeSetting() {}
    func sendButtonVideoRecordingSettings() {}
    func sendButtonMaxRecordingTime() {}
    func sendButtonCameraLedSetting() {}

    // MARK: - SGCManager: Network (G2 has no WiFi)

    func requestWifiScan() {}
    func sendWifiCredentials(_ ssid: String, _ password: String) {}
    func forgetWifiNetwork(_ ssid: String) {}
    func sendHotspotState(_ enabled: Bool) {}
    func sendOtaStart() {}

    // MARK: - SGCManager: User Context

    func sendUserEmailToGlasses(_ email: String) {
        // TODO: Could send via dev_settings
    }

    // MARK: - SGCManager: Gallery

    func queryGalleryStatus() {}
    func sendGalleryMode() {}

    // MARK: - SGCManager: Version Info

    func requestVersionInfo() {
        Bridge.log("G2: requestVersionInfo()")
        requestDeviceInfo()
    }

    // MARK: - BLE Scanning

    @discardableResult
    private func startScan() -> Bool {
        Bridge.log("G2: startScan()")
        if centralManager == nil {
            centralManager = CBCentralManager(
                delegate: self, queue: G2._bluetoothQueue,
                options: [CBCentralManagerOptionShowPowerAlertKey: 0]
            )
        }

        isDisconnecting = false
        guard centralManager!.state == .poweredOn else {
            Bridge.log("G2: Bluetooth not powered on")
            return false
        }

        // Try UUID-based reconnection first
        if connectByUUID() {
            return true
        }

        centralManager!.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
        ])
        return true
    }

    private func stopScan() {
        centralManager?.stopScan()
    }

    private func connectByUUID() -> Bool {
        guard let leftUUID = leftGlassUUID, let rightUUID = rightGlassUUID else { return false }

        let knownLeft = centralManager?.retrievePeripherals(withIdentifiers: [leftUUID])
        let knownRight = centralManager?.retrievePeripherals(withIdentifiers: [rightUUID])

        guard let left = knownLeft?.first, let right = knownRight?.first else { return false }

        leftPeripheral = left
        rightPeripheral = right
        left.delegate = self
        right.delegate = self
        centralManager?.connect(left, options: nil)
        centralManager?.connect(right, options: nil)
        return true
    }

    private func getConnectedDevices() -> [CBPeripheral] {
        return centralManager?.retrieveConnectedPeripherals(withServices: [G2BLE.SERVICE_UUID]) ?? []
    }

    private func emitDiscoveredDevice(_ name: String) {
        // Extract the numeric ID from name like "Even G2_32_R_3FFA6D" -> "32"
        guard let idNumber = extractIdNumber(name) else {
            Bridge.log("G2: Could not extract ID from: \(name)")
            return
        }
        Bridge.sendDiscoveredDevice(DeviceTypes.G2, "\(idNumber)")
    }

    private func extractIdNumber(_ name: String) -> Int? {
        // Name format: "Even G2_XX_L_XXXXXX" or "Even G2_XX_R_XXXXXX"
        // Extract XX (the numeric ID between G2_ and _L_/_R_)
        let pattern = "G2_(\\d+)_"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)),
              let range = Range(match.range(at: 1), in: name) else {
            return nil
        }
        return Int(name[range])
    }

    // MARK: - Incoming Data Handling

    private func handleNotifyData(_ data: Data, from peripheral: CBPeripheral) {
        guard let result = receiveManager.handlePacket(data) else { return }

        // Route based on service ID
        switch result.serviceId {
        case ServiceID.evenHub.rawValue:
            handleEvenHubResponse(result.payload)
        case ServiceID.deviceSettings.rawValue:
            handleDevSettingsResponse(result.payload)
        case ServiceID.g2Setting.rawValue:
            handleG2SettingResponse(result.payload)
        default:
            Bridge.log("G2: Unhandled service \(result.serviceId) (\(result.payload.count) bytes)")
        }
    }

    private func handleEvenHubResponse(_ payload: Data) {
        // Parse evenhub_main_msg_ctx: field 1 = Cmd (varint), field 13 = DevEvent (submessage)
        var reader = ProtobufReader(payload)
        let fields = reader.parseFields()

        guard let cmdValue = fields[1] as? Int32 else { return }

        if cmdValue == EvenHubResponseCmd.osNotifyEventToApp.rawValue {
            // Touch/gesture event from glasses
            guard let devEventData = fields[13] as? Data else { return }
            handleTouchEvent(devEventData)
        }
    }

    private func handleTouchEvent(_ devEventData: Data) {
        // Parse SendDeviceEvent: field 1=ListEvent, field 2=TextEvent, field 3=SysEvent
        var reader = ProtobufReader(devEventData)
        let fields = reader.parseFields()

        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)

        // SysEvent (field 3) - system-level gestures
        if let sysData = fields[3] as? Data {
            var sysReader = ProtobufReader(sysData)
            let sysFields = sysReader.parseFields()
            if let eventTypeRaw = sysFields[1] as? Int32,
               let eventType = OsEventType(rawValue: eventTypeRaw) {
                let gestureName = mapEventTypeToGesture(eventType)
                if let gestureName = gestureName {
                    Bridge.sendTouchEvent(deviceModel: DeviceTypes.G2, gestureName: gestureName, timestamp: timestamp)
                    Bridge.log("G2: SysEvent → \(gestureName)")
                }
                return
            }
        }

        // TextEvent (field 2) - tap on text container
        if let textData = fields[2] as? Data {
            var textReader = ProtobufReader(textData)
            let textFields = textReader.parseFields()
            if let eventTypeRaw = textFields[3] as? Int32,
               let eventType = OsEventType(rawValue: eventTypeRaw) {
                let gestureName = mapEventTypeToGesture(eventType)
                if let gestureName = gestureName {
                    Bridge.sendTouchEvent(deviceModel: DeviceTypes.G2, gestureName: gestureName, timestamp: timestamp)
                    Bridge.log("G2: TextEvent → \(gestureName)")
                }
            }
            return
        }

        // ListEvent (field 1) - interaction with list container
        if let listData = fields[1] as? Data {
            var listReader = ProtobufReader(listData)
            let listFields = listReader.parseFields()
            if let eventTypeRaw = listFields[5] as? Int32,
               let eventType = OsEventType(rawValue: eventTypeRaw) {
                let gestureName = mapEventTypeToGesture(eventType)
                if let gestureName = gestureName {
                    Bridge.sendTouchEvent(deviceModel: DeviceTypes.G2, gestureName: gestureName, timestamp: timestamp)
                    Bridge.log("G2: ListEvent → \(gestureName)")
                }
            }
        }
    }

    private func mapEventTypeToGesture(_ eventType: OsEventType) -> String? {
        switch eventType {
        case .click:           return "single_tap"
        case .doubleClick:     return "double_tap"
        case .scrollTop:       return "swipe_up"
        case .scrollBottom:    return "swipe_down"
        case .foregroundEnter: return "foreground_enter"
        case .foregroundExit:  return "foreground_exit"
        case .systemExit:      return "system_exit"
        case .abnormalExit:    return nil // don't report abnormal exits as gestures
        }
    }

    private func handleDevSettingsResponse(_ payload: Data) {
        // DevSettings responses (auth acks, heartbeat acks) — mostly informational
    }

    private func handleG2SettingResponse(_ payload: Data) {
        // Parse G2SettingPackage: field 1=commandId, field 4=DeviceReceiveRequestFromAPP (response), field 5=DeviceSendInfoToAPP
        var reader = ProtobufReader(payload)
        let fields = reader.parseFields()

        guard let cmdValue = fields[1] as? Int32 else { return }

        // DeviceReceiveRequest response (glasses sends back requested info)
        if cmdValue == G2SettingCommandId.deviceReceiveRequest.rawValue ||
           cmdValue == G2SettingCommandId.deviceSendToApp.rawValue {

            // The response data might be in field 4 (deviceReceiveRequestFromApp) or field 5 (deviceSendInfoToApp)
            if let requestData = fields[4] as? Data {
                parseDeviceRequestResponse(requestData)
            }
            if let sendData = fields[5] as? Data {
                parseDeviceSendToApp(sendData)
            }
        }
    }

    private func parseDeviceRequestResponse(_ data: Data) {
        // DeviceReceiveRequestFromAPP fields:
        //   5 = leftSoftwareVersion (string), 6 = rightSoftwareVersion (string)
        //   12 = battery (int32), 13 = chargingStatus (int32)
        var reader = ProtobufReader(data)
        let fields = reader.parseFields()

        // Battery
        if let battery = fields[12] as? Int32 {
            let level = Int(battery)
            if level >= 0 && level <= 100 {
                Bridge.log("G2: Battery level: \(level)%")
                batteryLevel = level
            }
        }

        // Charging status
        if let charging = fields[13] as? Int32 {
            isCharging = charging != 0
            Bridge.log("G2: Charging: \(isCharging)")
            // Re-send battery status with updated charging info
            if batteryLevel >= 0 {
                Bridge.sendBatteryStatus(level: batteryLevel, charging: isCharging)
            }
        }

        // Software versions
        if let leftVer = fields[5] as? Data, let leftVersion = String(data: leftVer, encoding: .utf8) {
            Bridge.log("G2: Left firmware: \(leftVersion)")
            GlassesStore.shared.apply("glasses", "leftFirmwareVersion", leftVersion)
        }
        if let rightVer = fields[6] as? Data, let rightVersion = String(data: rightVer, encoding: .utf8) {
            Bridge.log("G2: Right firmware: \(rightVersion)")
            GlassesStore.shared.apply("glasses", "rightFirmwareVersion", rightVersion)
            // Use right version as the main version
            GlassesStore.shared.apply("glasses", "firmwareVersion", rightVersion)
        }
    }

    private func parseDeviceSendToApp(_ data: Data) {
        // DeviceSendInfoToAPP: field 1 = currentRecalibrationStatus, field 2 = silentModeSwitch
        // Informational — just log for now
        var reader = ProtobufReader(data)
        let fields = reader.parseFields()
        if let silentMode = fields[2] as? Int32 {
            Bridge.log("G2: Silent mode: \(silentMode != 0)")
        }
    }

    private func handleAudioData(_ data: Data) {
        // G2 audio arrives on AUDIO_NOTIFY characteristic
        // Format: ~200+ byte chunks, use first 200 bytes, split into 40-byte LC3 frames
        // Each frame: LC3, 16kHz, mono, 10ms, 40 bytes

        let usableLength = min(data.count, 200)
        guard usableLength >= 40 else { return }

        let audioData = data.prefix(usableLength)

        // Forward LC3 data to CoreManager for decoding
        // G2 uses 40-byte frames (vs G1's 20-byte frames)
        CoreManager.shared.handleGlassesMicData(Data(audioData), 40)
    }
}

// MARK: - CBCentralManagerDelegate

extension G2: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let state = central.state
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            Bridge.log("G2: Bluetooth state: \(state.rawValue)")
            if state == .poweredOn {
                _ = self.startScan()
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        guard let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String else { return }

        // G2 glasses have "Even" prefix and "G2" in name, with _L_ or _R_ for side
        guard name.contains("G2") else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            Bridge.log("G2: Discovered: \(name) (RSSI: \(RSSI))")

            // Always emit discovered device to frontend
            self.emitDiscoveredDevice(name)

            // If scan-only mode (no search ID set), don't auto-connect
            guard self.DEVICE_SEARCH_ID != "NOT_SET" else { return }

            // Only connect to devices matching our search ID
            guard name.contains(self.DEVICE_SEARCH_ID) else { return }

            if name.contains("_L_") {
                if self.leftPeripheral == nil {
                    self.leftPeripheral = peripheral
                    peripheral.delegate = self
                    central.connect(peripheral, options: nil)
                    Bridge.log("G2: Connecting to LEFT: \(name)")
                }
            } else if name.contains("_R_") {
                if self.rightPeripheral == nil {
                    self.rightPeripheral = peripheral
                    peripheral.delegate = self
                    central.connect(peripheral, options: nil)
                    Bridge.log("G2: Connecting to RIGHT: \(name)")
                }
            }

            // Stop scanning once we have both
            if self.leftPeripheral != nil && self.rightPeripheral != nil {
                self.stopScan()
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            Bridge.log("G2: Connected to \(peripheral.name ?? "unknown")")

            // Store UUID for reconnection
            if peripheral === self.leftPeripheral {
                self.leftGlassUUID = peripheral.identifier
            } else if peripheral === self.rightPeripheral {
                self.rightGlassUUID = peripheral.identifier
            }

            // Discover services - scan for all since we need to find the EvenHub characteristics
            peripheral.discoverServices(nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let side = peripheral === self.leftPeripheral ? "LEFT" : "RIGHT"
            Bridge.log("G2: Disconnected \(side): \(error?.localizedDescription ?? "clean")")

            // Only reconnect if not intentionally disconnecting
            if self.isDisconnecting { return }

            // Clear both sides to force re-discovery (like G1)
            self.leftPeripheral = nil
            self.rightPeripheral = nil
            self.leftInitialized = false
            self.rightInitialized = false
            self.leftWriteChar = nil
            self.rightWriteChar = nil
            self.leftNotifyChar = nil
            self.rightNotifyChar = nil
            self.leftAudioChar = nil
            self.rightAudioChar = nil
            self.authStarted = false

            self.ready = false
            self.pageCreated = false
            GlassesStore.shared.apply("glasses", "connected", false)
            GlassesStore.shared.apply("glasses", "fullyBooted", false)

            // Start persistent reconnection loop (every 30s, unlimited attempts)
            self.startReconnectionTimer()
        }
    }

    private func startReconnectionTimer() {
        Task {
            await reconnectionManager.start { [weak self] in
                guard let self else { return false }

                // Check if already connected
                if await MainActor.run(body: { self.ready }) {
                    Bridge.log("G2: Already connected, stopping reconnection")
                    return true
                }

                Bridge.log("G2: Attempting reconnection...")

                await MainActor.run {
                    self.startScan()
                }

                // Return false to keep trying
                return false
            }
        }
    }
}

// MARK: - CBPeripheralDelegate

extension G2: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let side = peripheral === self.leftPeripheral ? "LEFT" : "RIGHT"

            for char in characteristics {
                let uuid = char.uuid
                let props = char.properties

                // Log all characteristics with their properties for debugging
                var propStr: [String] = []
                if props.contains(.read) { propStr.append("read") }
                if props.contains(.write) { propStr.append("write") }
                if props.contains(.writeWithoutResponse) { propStr.append("writeNoResp") }
                if props.contains(.notify) { propStr.append("notify") }
                if props.contains(.indicate) { propStr.append("indicate") }
                Bridge.log("G2: \(side) char \(uuid) props=[\(propStr.joined(separator: ","))]")

                if uuid == G2BLE.CHAR_WRITE {
                    Bridge.log("G2: Found WRITE char on \(side)")
                    if peripheral === self.leftPeripheral {
                        self.leftWriteChar = char
                    } else {
                        self.rightWriteChar = char
                    }
                } else if uuid == G2BLE.CHAR_NOTIFY {
                    Bridge.log("G2: Found NOTIFY char on \(side)")
                    if peripheral === self.leftPeripheral {
                        self.leftNotifyChar = char
                    } else {
                        self.rightNotifyChar = char
                    }
                    peripheral.setNotifyValue(true, for: char)
                } else if uuid == G2BLE.AUDIO_NOTIFY {
                    Bridge.log("G2: Found AUDIO char on \(side)")
                    if peripheral === self.leftPeripheral {
                        self.leftAudioChar = char
                    } else {
                        self.rightAudioChar = char
                    }
                    peripheral.setNotifyValue(true, for: char)
                }
            }

            // Check if this side is fully initialized
            if peripheral === self.leftPeripheral && self.leftWriteChar != nil {
                self.leftInitialized = true
                Bridge.log("G2: LEFT initialized")
            } else if peripheral === self.rightPeripheral && self.rightWriteChar != nil && self.rightNotifyChar != nil {
                self.rightInitialized = true
                Bridge.log("G2: RIGHT initialized")
            }

            // Both sides ready -> run auth (once)
            if self.leftInitialized && self.rightInitialized && !self.authStarted {
                self.authStarted = true
                Bridge.log("G2: Both sides initialized, starting auth sequence")
                self.runAuthSequence()
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value, error == nil else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            if characteristic.uuid == G2BLE.AUDIO_NOTIFY {
                // Audio data - forward to mic system
                self.handleAudioData(data)
            } else if characteristic.uuid == G2BLE.CHAR_NOTIFY {
                // Protocol data
                self.handleNotifyData(data, from: peripheral)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            DispatchQueue.main.async {
                Bridge.log("G2: Write error: \(error.localizedDescription)")
            }
        }
    }
}
