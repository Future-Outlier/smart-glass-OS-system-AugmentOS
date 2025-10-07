package com.mentra.mentra.sgcs

import com.mentra.mentra.Bridge
import com.mentra.mentra.utils.DeviceTypes

class Simulated : SGCManager() {

    // Device Information
    var type: String = DeviceTypes.SIMULATED
    var ready: Boolean = true
    var connectionState: String = "disconnected" // "disconnected" | "connected" | "connecting"
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
    var caseBatteryLevel: Int? = null

    // Network Status
    var wifiSsid: String = ""
    var wifiConnected: Boolean? = null
    var wifiLocalIp: String = ""
    var isHotspotEnabled: Boolean? = null
    var hotspotSsid: String = ""
    var hotspotPassword: String = ""
    var hotspotGatewayIp: String = ""

    // Audio Control
    override fun setMicEnabled(enabled: Boolean) {
        Bridge.log("setMicEnabled")
    }

    // Camera & Media
    override fun requestPhoto(
            requestId: String,
            appId: String,
            size: String,
            webhookUrl: String,
            authToken: String
    ) {
        Bridge.log("requestPhoto")
    }

    override fun startRtmpStream(message: Map<String, Any>) {
        Bridge.log("startRtmpStream")
    }

    override fun stopRtmpStream() {
        Bridge.log("stopRtmpStream")
    }

    override fun sendRtmpKeepAlive(message: Map<String, Any>) {
        Bridge.log("sendRtmpKeepAlive")
    }

    override fun startBufferRecording() {
        Bridge.log("startBufferRecording")
    }

    override fun stopBufferRecording() {
        Bridge.log("stopBufferRecording")
    }

    override fun saveBufferVideo(requestId: String, durationSeconds: Int) {
        Bridge.log("saveBufferVideo")
    }

    override fun startVideoRecording(requestId: String, save: Boolean) {
        Bridge.log("startVideoRecording")
    }

    override fun stopVideoRecording(requestId: String) {
        Bridge.log("stopVideoRecording")
    }

    // Button Settings
    override fun sendButtonPhotoSettings() {
        Bridge.log("sendButtonPhotoSettings")
    }

    override fun sendButtonModeSetting() {
        Bridge.log("sendButtonModeSetting")
    }

    override fun sendButtonVideoRecordingSettings() {
        Bridge.log("sendButtonVideoRecordingSettings")
    }

    override fun sendButtonCameraLedSetting() {
        Bridge.log("sendButtonCameraLedSetting")
    }

    // Display Control
    override fun setBrightness(level: Int, autoMode: Boolean) {
        Bridge.log("setBrightness")
    }

    override fun clearDisplay() {
        Bridge.log("clearDisplay")
    }

    override fun sendTextWall(text: String) {
        Bridge.log("sendTextWall")
    }

    override fun sendDoubleTextWall(top: String, bottom: String) {
        Bridge.log("sendDoubleTextWall")
    }

    override fun displayBitmap(base64ImageData: String): Boolean {
        Bridge.log("displayBitmap")
        return false
    }

    override fun showDashboard() {
        Bridge.log("showDashboard")
    }

    override fun setDashboardPosition(height: Int, depth: Int) {
        Bridge.log("setDashboardPosition")
    }

    // Device Control
    override fun setHeadUpAngle(angle: Int) {
        Bridge.log("setHeadUpAngle")
    }

    override fun getBatteryStatus() {
        Bridge.log("getBatteryStatus")
    }

    override fun setSilentMode(enabled: Boolean) {
        Bridge.log("setSilentMode")
    }

    override fun exit() {
        Bridge.log("exit")
    }

    // Connection Management
    override fun disconnect() {
        Bridge.log("disconnect")
    }

    override fun forget() {
        Bridge.log("forget")
    }

    override fun findCompatibleDevices() {
        Bridge.log("findCompatibleDevices")
    }

    override fun connectById(id: String) {
        Bridge.log("connectById")
    }

    override fun getConnectedBluetoothName(): String {
        Bridge.log("getConnectedBluetoothName")
        return ""
    }

    override fun cleanup() {
        Bridge.log("cleanup")
    }

    // Network Management
    override fun requestWifiScan() {
        Bridge.log("requestWifiScan")
    }

    override fun sendWifiCredentials(ssid: String, password: String) {
        Bridge.log("sendWifiCredentials")
    }

    override fun sendHotspotState(enabled: Boolean) {
        Bridge.log("sendHotspotState")
    }

    // Gallery
    override fun queryGalleryStatus() {
        Bridge.log("queryGalleryStatus")
    }
}
