import Foundation

@MainActor
protocol SGCManager {
    // MARK: - Device Information

    var type: String { get set }
    var hasMic: Bool { get }

    // var ready: Bool { get }
    // var connectionState: String { get }

    // // info:
    // var appVersion: String { get }
    // var buildNumber: String { get }
    // var deviceModel: String { get }
    // var androidVersion: String { get }
    // var otaVersionUrl: String { get }
    // var firmwareVersion: String { get }
    // var btMacAddress: String { get }
    // var serialNumber: String { get }
    // var style: String { get }
    // var color: String { get }

    // // MARK: - Hardware Status

    // var hasMic: Bool { get }
    // var micEnabled: Bool { get }
    // var batteryLevel: Int { get }
    // var charging: Bool { get }

    // // MARK: - Case Status

    // var caseOpen: Bool { get }
    // var caseRemoved: Bool { get }
    // var caseCharging: Bool { get }
    // var caseBatteryLevel: Int { get }

    // // MARK: - Network Status

    // var wifiSsid: String { get }
    // var wifiConnected: Bool { get }
    // var wifiLocalIp: String { get }
    // var isHotspotEnabled: Bool { get }
    // var hotspotSsid: String { get }
    // var hotspotPassword: String { get }
    // var hotspotGatewayIp: String { get }

    // MARK: - Audio Control

    func setMicEnabled(_ enabled: Bool)
    func sortMicRanking(list: [String]) -> [String]

    // MARK: - Messaging

    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool, requireAck: Bool)

    // MARK: - Camera & Media

    func requestPhoto(
        _ requestId: String, appId: String, size: String?, webhookUrl: String?, authToken: String?,
        compress: String?, silent: Bool
    )
    func startRtmpStream(_ message: [String: Any])
    func stopRtmpStream()
    func sendRtmpKeepAlive(_ message: [String: Any])
    func startBufferRecording()
    func stopBufferRecording()
    func saveBufferVideo(requestId: String, durationSeconds: Int)
    func startVideoRecording(requestId: String, save: Bool, silent: Bool)
    func stopVideoRecording(requestId: String)

    // MARK: - Button Settings

    func sendButtonPhotoSettings()
    func sendButtonModeSetting()
    func sendButtonVideoRecordingSettings()
    func sendButtonMaxRecordingTime()
    func sendButtonCameraLedSetting()

    // MARK: - Display Control

    func setBrightness(_ level: Int, autoMode: Bool)
    func clearDisplay()
    func sendTextWall(_ text: String)
    func sendDoubleTextWall(_ top: String, _ bottom: String)
    func displayBitmap(base64ImageData: String) async -> Bool
    func showDashboard()
    func setDashboardPosition(_ height: Int, _ depth: Int)

    // MARK: - Device Control

    func setHeadUpAngle(_ angle: Int)
    func getBatteryStatus()
    func setSilentMode(_ enabled: Bool)
    func exit()
    func sendRgbLedControl(
        requestId: String, packageName: String?, action: String, color: String?, ontime: Int,
        offtime: Int, count: Int
    )

    // MARK: - Connection Management

    func disconnect()
    func forget()
    func findCompatibleDevices()
    func connectById(_ id: String)
    func getConnectedBluetoothName() -> String?
    func cleanup()

    // MARK: - Network Management

    func requestWifiScan()
    func sendWifiCredentials(_ ssid: String, _ password: String)
    func forgetWifiNetwork(_ ssid: String)
    func sendHotspotState(_ enabled: Bool)
    func sendOtaStart()

    // MARK: - User Context (for crash reporting)

    func sendUserEmailToGlasses(_ email: String)

    // MARK: - Gallery

    func queryGalleryStatus()
    func sendGalleryMode()
}

extension SGCManager {
    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool) {
        sendJson(jsonOriginal, wakeUp: wakeUp, requireAck: true)
    }

    // MARK: - Default GlassesStore-backed property implementations

    var ready: Bool {
        get { GlassesStore.shared.get("glasses", "ready") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "ready", newValue) }
    }

    var appVersion: String {
        get { GlassesStore.shared.get("glasses", "appVersion") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "appVersion", newValue) }
    }

    var buildNumber: String {
        get { GlassesStore.shared.get("glasses", "buildNumber") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "buildNumber", newValue) }
    }

    var deviceModel: String {
        get { GlassesStore.shared.get("glasses", "deviceModel") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "deviceModel", newValue) }
    }

    var androidVersion: String {
        get { GlassesStore.shared.get("glasses", "androidVersion") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "androidVersion", newValue) }
    }

    var otaVersionUrl: String {
        get { GlassesStore.shared.get("glasses", "otaVersionUrl") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "otaVersionUrl", newValue) }
    }

    var firmwareVersion: String {
        get { GlassesStore.shared.get("glasses", "fwVersion") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "fwVersion", newValue) }
    }

    var btMacAddress: String {
        get { GlassesStore.shared.get("glasses", "btMacAddress") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "btMacAddress", newValue) }
    }

    var serialNumber: String {
        get { GlassesStore.shared.get("glasses", "serialNumber") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "serialNumber", newValue) }
    }

    var style: String {
        get { GlassesStore.shared.get("glasses", "style") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "style", newValue) }
    }

    var color: String {
        get { GlassesStore.shared.get("glasses", "color") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "color", newValue) }
    }

    var micEnabled: Bool {
        get { GlassesStore.shared.get("glasses", "micEnabled") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "micEnabled", newValue) }
    }

    var batteryLevel: Int {
        get { GlassesStore.shared.get("glasses", "batteryLevel") as? Int ?? -1 }
        set { GlassesStore.shared.apply("glasses", "batteryLevel", newValue) }
    }

    var headUp: Bool {
        get { GlassesStore.shared.get("glasses", "headUp") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "headUp", newValue) }
    }

    var charging: Bool {
        get { GlassesStore.shared.get("glasses", "charging") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "charging", newValue) }
    }

    var caseOpen: Bool {
        get { GlassesStore.shared.get("glasses", "caseOpen") as? Bool ?? true }
        set { GlassesStore.shared.apply("glasses", "caseOpen", newValue) }
    }

    var caseRemoved: Bool {
        get { GlassesStore.shared.get("glasses", "caseRemoved") as? Bool ?? true }
        set { GlassesStore.shared.apply("glasses", "caseRemoved", newValue) }
    }

    var caseCharging: Bool {
        get { GlassesStore.shared.get("glasses", "caseCharging") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "caseCharging", newValue) }
    }

    var caseBatteryLevel: Int {
        get { GlassesStore.shared.get("glasses", "caseBatteryLevel") as? Int ?? -1 }
        set { GlassesStore.shared.apply("glasses", "caseBatteryLevel", newValue) }
    }

    var wifiSsid: String {
        get { GlassesStore.shared.get("glasses", "wifiSsid") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "wifiSsid", newValue) }
    }

    var wifiConnected: Bool {
        get { GlassesStore.shared.get("glasses", "wifiConnected") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "wifiConnected", newValue) }
    }

    var wifiLocalIp: String {
        get { GlassesStore.shared.get("glasses", "wifiLocalIp") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "wifiLocalIp", newValue) }
    }

    var isHotspotEnabled: Bool {
        get { GlassesStore.shared.get("glasses", "hotspotEnabled") as? Bool ?? false }
        set { GlassesStore.shared.apply("glasses", "hotspotEnabled", newValue) }
    }

    var hotspotSsid: String {
        get { GlassesStore.shared.get("glasses", "hotspotSsid") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "hotspotSsid", newValue) }
    }

    var hotspotPassword: String {
        get { GlassesStore.shared.get("glasses", "hotspotPassword") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "hotspotPassword", newValue) }
    }

    var hotspotGatewayIp: String {
        get { GlassesStore.shared.get("glasses", "hotspotGatewayIp") as? String ?? "" }
        set { GlassesStore.shared.apply("glasses", "hotspotGatewayIp", newValue) }
    }
}
