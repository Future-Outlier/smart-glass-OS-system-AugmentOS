package com.mentra.core

import com.mentra.core.services.NotificationListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class CoreModule : Module() {
    private val bridge: Bridge by lazy { Bridge.getInstance() }

    override fun definition() = ModuleDefinition {
        Name("Core")

        // Define events that can be sent to JavaScript
        Events("CoreMessageEvent", "onChange")

        OnCreate {
            // Initialize Bridge with Android context and event callback
            Bridge.initialize(
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            ) { eventName, data -> sendEvent(eventName, data) }
        }

        // MARK: - Display Commands

        AsyncFunction("displayEvent") { params: Map<String, Any> ->
            MentraManager.getInstance()?.handle_display_event(params)
        }

        AsyncFunction("displayText") { params: Map<String, Any> ->
            MentraManager.getInstance()?.handle_display_text(params)
        }

        // MARK: - Connection Commands

        AsyncFunction("requestStatus") {
            MentraManager.getInstance()?.handle_request_status()
        }

        AsyncFunction("connectDefault") {
            MentraManager.getInstance()?.handle_connect_default()
        }

        AsyncFunction("connectByName") { deviceName: String ->
            MentraManager.getInstance()?.handle_connect_by_name(deviceName)
        }

        AsyncFunction("disconnect") {
            MentraManager.getInstance()?.handle_disconnect()
        }

        AsyncFunction("forget") {
            MentraManager.getInstance()?.handle_forget()
        }

        AsyncFunction("findCompatibleDevices") { modelName: String ->
            MentraManager.getInstance()?.handle_find_compatible_devices(modelName)
        }

        AsyncFunction("showDashboard") {
            MentraManager.getInstance()?.handle_show_dashboard()
        }

        // MARK: - WiFi Commands

        AsyncFunction("requestWifiScan") {
            MentraManager.getInstance()?.handle_request_wifi_scan()
        }

        AsyncFunction("sendWifiCredentials") { ssid: String, password: String ->
            MentraManager.getInstance()?.handle_send_wifi_credentials(ssid, password)
        }

        AsyncFunction("setHotspotState") { enabled: Boolean ->
            MentraManager.getInstance()?.handle_set_hotspot_state(enabled)
        }

        // MARK: - Gallery Commands

        AsyncFunction("queryGalleryStatus") {
            MentraManager.getInstance()?.handle_query_gallery_status()
        }

        AsyncFunction("photoRequest") { requestId: String, appId: String, size: String, webhookUrl: String, authToken: String ->
            MentraManager.getInstance()?.handle_photo_request(requestId, appId, size, webhookUrl, authToken)
        }

        // MARK: - Video Recording Commands

        AsyncFunction("startBufferRecording") {
            MentraManager.getInstance()?.handle_start_buffer_recording()
        }

        AsyncFunction("stopBufferRecording") {
            MentraManager.getInstance()?.handle_stop_buffer_recording()
        }

        AsyncFunction("saveBufferVideo") { requestId: String, durationSeconds: Int ->
            MentraManager.getInstance()?.handle_save_buffer_video(requestId, durationSeconds)
        }

        AsyncFunction("startVideoRecording") { requestId: String, save: Boolean ->
            MentraManager.getInstance()?.handle_start_video_recording(requestId, save)
        }

        AsyncFunction("stopVideoRecording") { requestId: String ->
            MentraManager.getInstance()?.handle_stop_video_recording(requestId)
        }

        // MARK: - RTMP Stream Commands

        AsyncFunction("startRtmpStream") { params: Map<String, Any> ->
            // MentraManager.getInstance()?.handle_start_rtmp_stream(params)
        }

        AsyncFunction("stopRtmpStream") {
            // MentraManager.getInstance()?.handle_stop_rtmp_stream()
        }

        AsyncFunction("keepRtmpStreamAlive") { params: Map<String, Any> ->
            // MentraManager.getInstance()?.handle_keep_rtmp_stream_alive(params)
        }

        // MARK: - Microphone Commands

        AsyncFunction("microphoneStateChange") { requiredDataStrings: List<String>, bypassVad: Boolean ->
            MentraManager.getInstance()?.handle_microphone_state_change(requiredDataStrings, bypassVad)
        }

        AsyncFunction("restartTranscriber") {
            MentraManager.getInstance()?.restartTranscriber()
        }

        // MARK: - RGB LED Control

        AsyncFunction("rgbLedControl") { requestId: String, packageName: String?, action: String, color: String?, ontime: Int, offtime: Int, count: Int ->
            // MentraManager.getInstance()?.handle_rgb_led_control(requestId, packageName, action, color, ontime, offtime, count)
        }

        // MARK: - Settings Commands

        AsyncFunction("updateSettings") { params: Map<String, Any> ->
            MentraManager.getInstance()?.handle_update_settings(params)
        }

        // MARK: - STT Commands

        AsyncFunction("setSttModelDetails") { path: String, languageCode: String ->
            // STTTools.setSttModelDetails(path, languageCode)
        }

        AsyncFunction("getSttModelPath") { ->
            // STTTools.getSttModelPath()
            ""
        }

        AsyncFunction("checkSttModelAvailable") { ->
            // STTTools.checkSTTModelAvailable()
            false
        }

        AsyncFunction("validateSttModel") { path: String ->
            // STTTools.validateSTTModel(path)
            false
        }

        AsyncFunction("extractTarBz2") { sourcePath: String, destinationPath: String ->
            // STTTools.extractTarBz2(sourcePath, destinationPath)
            false
        }

        // MARK: - Android-specific Commands

        AsyncFunction("getInstalledApps") {
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            NotificationListener.getInstance(context).getInstalledApps()
        }

        AsyncFunction("hasNotificationListenerPermission") {
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            NotificationListener.getInstance(context).hasNotificationListenerPermission()
        }
    }
}
