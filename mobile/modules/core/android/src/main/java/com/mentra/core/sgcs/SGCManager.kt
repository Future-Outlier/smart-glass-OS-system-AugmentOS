package com.mentra.core.sgcs

import com.mentra.core.utils.ConnTypes

abstract class SGCManager {
    // Hard coded device properties:
    @JvmField var type: String = ""
    @JvmField var hasMic: Boolean = false

    // Audio Control
    abstract fun setMicEnabled(enabled: Boolean)
    abstract fun sortMicRanking(list: MutableList<String>): MutableList<String>

    // Camera & Media
    abstract fun requestPhoto(
            requestId: String,
            appId: String,
            size: String,
            webhookUrl: String?,
            authToken: String?,
            compress: String?,
            silent: Boolean
    )
    abstract fun startRtmpStream(message: MutableMap<String, Any>)
    abstract fun stopRtmpStream()
    abstract fun sendRtmpKeepAlive(message: MutableMap<String, Any>)
    abstract fun startBufferRecording()
    abstract fun stopBufferRecording()
    abstract fun saveBufferVideo(requestId: String, durationSeconds: Int)
    abstract fun startVideoRecording(requestId: String, save: Boolean, silent: Boolean)
    abstract fun stopVideoRecording(requestId: String)

    // Button Settings
    abstract fun sendButtonPhotoSettings()
    abstract fun sendButtonModeSetting()
    abstract fun sendButtonVideoRecordingSettings()
    abstract fun sendButtonMaxRecordingTime()
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
    abstract fun sendRgbLedControl(
            requestId: String,
            packageName: String?,
            action: String,
            color: String?,
            ontime: Int,
            offtime: Int,
            count: Int
    )

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
    abstract fun forgetWifiNetwork(ssid: String)
    abstract fun sendHotspotState(enabled: Boolean)

    // User Context (for crash reporting)
    abstract fun sendUserEmailToGlasses(email: String)

    // Gallery
    abstract fun queryGalleryStatus()
    abstract fun sendGalleryMode()
}
