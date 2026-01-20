package com.mentra.core

import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

/**
 * Centralized observable state store for glasses and core settings
 */
object GlassesStore {
    val store = ObservableStore()

    init {
        // Set defaults for glasses settings
        store.set("glasses", "brightness", 50)
        store.set("glasses", "auto_brightness", true)
        store.set("glasses", "dashboard_height", 4)
        store.set("glasses", "dashboard_depth", 5)
        store.set("glasses", "head_up_angle", 30)
        store.set("glasses", "contextual_dashboard", true)
        store.set("glasses", "gallery_mode", false)
        store.set("glasses", "screen_disabled", false)
        store.set("glasses", "button_mode", "photo")
        store.set("glasses", "button_photo_size", "medium")
        store.set("glasses", "button_camera_led", true)
        store.set("glasses", "button_max_recording_time", 10)
        store.set("glasses", "button_video_width", 1280)
        store.set("glasses", "button_video_height", 720)
        store.set("glasses", "button_video_fps", 30)
        store.set("glasses", "preferred_mic", "auto")
        store.set("glasses", "bypass_vad", true)
        store.set("glasses", "offline_mode", false)
        store.set("glasses", "battery_level", -1)
        store.set("glasses", "is_connected", false)
        store.set("glasses", "device_model", "")
        store.set("glasses", "firmware_version", "")
        store.set("glasses", "mic_enabled", false)
        store.set("glasses", "btc_connected", false)

        // Set defaults for core settings
        store.set("core", "is_searching", false)
        store.set("core", "power_saving_mode", false)
        store.set("core", "metric_system", false)
    }

    @OptIn(DelicateCoroutinesApi::class)
    fun apply(category: String, key: String, value: Any) {
        val oldValue = store.get(category, key)
        store.set(category, key, value)

        // Trigger hardware updates based on setting changes
        when (category to key) {
            "glasses" to "brightness" -> {
                val b = value as? Int ?: 50
                val auto = store.get("glasses", "auto_brightness") as? Boolean ?: true
                GlobalScope.launch(Dispatchers.Main) {
                    CoreManager.instance?.sgc?.setBrightness(b, auto)
                    CoreManager.instance?.sgc?.sendTextWall("Set brightness to $b%")
                    delay(800)  // 0.8 seconds
                    CoreManager.instance?.sgc?.clearDisplay()
                }
            }

            "glasses" to "auto_brightness" -> {
                val b = store.get("glasses", "brightness") as? Int ?: 50
                val auto = value as? Boolean ?: true
                val autoBrightnessChanged = (oldValue as? Boolean) != auto
                GlobalScope.launch(Dispatchers.Main) {
                    CoreManager.instance?.sgc?.setBrightness(b, auto)
                    if (autoBrightnessChanged) {
                        CoreManager.instance?.sgc?.sendTextWall(
                            if (auto) "Enabled auto brightness" else "Disabled auto brightness"
                        )
                        delay(800)  // 0.8 seconds
                        CoreManager.instance?.sgc?.clearDisplay()
                    }
                }
            }

            "glasses" to "dashboard_height",
            "glasses" to "dashboard_depth" -> {
                val h = store.get("glasses", "dashboard_height") as? Int ?: 4
                val d = store.get("glasses", "dashboard_depth") as? Int ?: 5
                GlobalScope.launch(Dispatchers.Main) {
                    CoreManager.instance?.sgc?.setDashboardPosition(h, d)
                }
            }

            "glasses" to "head_up_angle" ->
                CoreManager.instance?.sgc?.setHeadUpAngle(value as Int)

            "glasses" to "gallery_mode" ->
                CoreManager.instance?.sgc?.sendGalleryMode()

            "glasses" to "screen_disabled" -> {
                if (value as Boolean) CoreManager.instance?.sgc?.exit()
                else CoreManager.instance?.sgc?.clearDisplay()
            }

            "glasses" to "button_mode" ->
                CoreManager.instance?.sgc?.sendButtonModeSetting()

            "glasses" to "button_photo_size" ->
                CoreManager.instance?.sgc?.sendButtonPhotoSettings()

            "glasses" to "button_camera_led" ->
                CoreManager.instance?.sgc?.sendButtonCameraLedSetting()

            "glasses" to "button_max_recording_time" ->
                CoreManager.instance?.sgc?.sendButtonMaxRecordingTime()

            "glasses" to "button_video_width",
            "glasses" to "button_video_height",
            "glasses" to "button_video_fps" ->
                CoreManager.instance?.sgc?.sendButtonVideoRecordingSettings()

            "glasses" to "preferred_mic" -> {
                val mic = value as? String ?: "auto"
                CoreManager.instance?.preferredMic = mic
                CoreManager.instance?.micRanking = MicMap.map[mic] ?: MicMap.map["auto"]!!
                CoreManager.instance?.setMicState(
                    CoreManager.instance?.shouldSendPcmData ?: false,
                    CoreManager.instance?.shouldSendTranscript ?: false,
                    CoreManager.instance?.bypassVad ?: true
                )
            }

            "glasses" to "bypass_vad" -> {
                CoreManager.instance?.bypassVad = value as Boolean
            }

            "glasses" to "offline_mode" -> {
                CoreManager.instance?.offlineMode = value as Boolean
                CoreManager.instance?.setMicState(
                    CoreManager.instance?.shouldSendPcmData ?: false,
                    CoreManager.instance?.shouldSendTranscript ?: false,
                    CoreManager.instance?.bypassVad ?: true
                )
            }

            "glasses" to "contextual_dashboard" -> {
                CoreManager.instance?.contextualDashboard = value as Boolean
            }

            "core" to "power_saving_mode" -> {
                CoreManager.instance?.powerSavingMode = value as Boolean
            }

            "core" to "metric_system" -> {
                CoreManager.instance?.metricSystem = value as Boolean
            }
        }
    }
}
