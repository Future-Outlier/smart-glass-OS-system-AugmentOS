package com.mentra.mentra.sgcs

import com.mentra.mentra.utils.ConnTypes

abstract class SGCManager {
    // Device Information
    var type: String = ""
    var ready: Boolean = false
    var connectionState: String =
            ConnTypes.DISCONNECTED // "disconnected" | "connected" | "connecting"

    var glassesAppVersion: String = ""
    var glassesBuildNumber: String = ""
    var glassesDeviceModel: String = ""
    var glassesAndroidVersion: String = ""
    var glassesOtaVersionUrl: String = ""
    var glassesSerialNumber: String = ""
    var glassesStyle: String = ""
    var glassesColor: String = ""

    // Hardware Status
    var hasMic: Boolean = false
    var batteryLevel: Int = -1
    var isHeadUp: Boolean = false

    // Case Status
    var caseOpen: Boolean = false
    var caseRemoved: Boolean = false
    var caseCharging: Boolean = false
    var caseBatteryLevel: Int = -1

    // Network Status
    var wifiSsid: String = ""
    var wifiConnected: Boolean = false
    var wifiLocalIp: String = ""
    var isHotspotEnabled: Boolean = false
    var hotspotSsid: String = ""
    var hotspotPassword: String = ""
    var hotspotGatewayIp: String = ""

    // Audio Control
    abstract fun setMicEnabled(enabled: Boolean)

    // Camera & Media
    abstract fun requestPhoto(
            requestId: String,
            appId: String,
            size: String,
            webhookUrl: String?,
            authToken: String?
    )
    abstract fun stopRtmpStream()
    abstract fun sendRtmpKeepAlive(message: MutableMap<String, Any>)
    abstract fun startBufferRecording()
    abstract fun stopBufferRecording()
    abstract fun saveBufferVideo(requestId: String, durationSeconds: Int)
    abstract fun startVideoRecording(requestId: String, save: Boolean)
    abstract fun stopVideoRecording(requestId: String)

    // Button Settings
    abstract fun sendButtonPhotoSettings()
    abstract fun sendButtonModeSetting()
    abstract fun sendButtonVideoRecordingSettings()
    abstract fun sendButtonCameraLedSetting()

    // Display Control
    abstract fun setBrightness(level: Int, autoMode: Boolean)
    abstract fun clearDisplay()
    abstract fun sendTextWall(text: String)
    abstract fun sendDoubleTextWall(top: String, bottom: String)
    abstract fun displayBitmap(base64ImageData: String): Boolean
    abstract fun showDashboard()
    abstract fun setDashboardPosition(height: Int, depth: Int)

    // Device Control
    abstract fun setHeadUpAngle(angle: Int)
    abstract fun getBatteryStatus()
    abstract fun setSilentMode(enabled: Boolean)
    abstract fun exit()

    // Connection Management
    abstract fun disconnect()
    abstract fun forget()
    abstract fun findCompatibleDevices()
    abstract fun connectById(id: String)
    abstract fun getConnectedBluetoothName(): String
    abstract fun cleanup()

    // Network Management
    abstract fun requestWifiScan()
    abstract fun sendWifiCredentials(ssid: String, password: String)
    abstract fun sendHotspotState(enabled: Boolean)

    // Gallery
    abstract fun queryGalleryStatus()
}
