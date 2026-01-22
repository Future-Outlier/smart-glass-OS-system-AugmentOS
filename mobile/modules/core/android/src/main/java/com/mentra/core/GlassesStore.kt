package com.mentra.core

import com.mentra.core.utils.MicMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Centralized observable state store for glasses and core settings
 */
object GlassesStore {
    
    val store = ObservableStore()
    
    init {
        // SETTINGS are snake_case
        // CORE STATE is camelCase
        
        // GLASSES STATE:
        store.set("glasses", "batteryLevel", -1)
        store.set("glasses", "connected", false)
        store.set("glasses", "connectionState", "disconnected")
        store.set("glasses", "deviceModel", "")
        store.set("glasses", "firmwareVersion", "")
        store.set("glasses", "micEnabled", false)
        store.set("glasses", "btcConnected", false)
        store.set("glasses", "caseRemoved", true)
        store.set("glasses", "caseOpen", true)
        store.set("glasses", "caseCharging", false)
        store.set("glasses", "caseBatteryLevel", -1)
        store.set("glasses", "serialNumber", "")
        store.set("glasses", "style", "")
        store.set("glasses", "color", "")
        store.set("glasses", "wifiSsid", "")
        store.set("glasses", "wifiConnected", false)
        store.set("glasses", "wifiLocalIp", "")
        store.set("glasses", "hotspotEnabled", false)
        store.set("glasses", "hotspotSsid", "")
        store.set("glasses", "hotspotPassword", "")
        store.set("glasses", "hotspotGatewayIp", "")
        store.set("glasses", "bluetoothName", "")
        
        // CORE STATE:
        store.set("core", "systemMicUnavailable", false)
        store.set("core", "isHeadUp", false)
        store.set("core", "searching", false)
        store.set("core", "micEnabled", false)
        store.set("core", "currentMic", "")
        store.set("core", "searchResults", emptyList<Any>())

        // CORE SETTINGS:
        store.set("core", "default_wearable", "")
        store.set("core", "pending_wearable", "")
        store.set("core", "device_name", "")
        store.set("core", "device_address", "")
        store.set("core", "offline_mode", false)
        store.set("core", "screen_disabled", false)
        store.set("core", "mic_ranking", MicMap.map["auto"]!!)
        store.set("core", "preferred_mic", "auto")
        store.set("core", "power_saving_mode", false)
        store.set("core", "always_on_status_bar", false)
        store.set("core", "enforce_local_transcription", false)
        store.set("core", "sensing_enabled", true)
        store.set("core", "metric_system", false)
        store.set("core", "brightness", 50)
        store.set("core", "auto_brightness", true)
        store.set("core", "dashboard_height", 4)
        store.set("core", "dashboard_depth", 5)
        store.set("core", "head_up_angle", 30)
        store.set("core", "contextual_dashboard", true)
        store.set("core", "gallery_mode", false)
        store.set("core", "screen_disabled", false)
        store.set("core", "button_mode", "photo")
        store.set("core", "button_photo_size", "medium")
        store.set("core", "button_camera_led", true)
        store.set("core", "button_max_recording_time", 10)
        store.set("core", "button_video_width", 1280)
        store.set("core", "button_video_height", 720)
        store.set("core", "button_video_fps", 30)
        store.set("core", "preferred_mic", "auto")
        store.set("core", "lc3_frame_size", 20)
    }
    
    fun get(category: String, key: String): Any? {
        return store.get(category, key)
    }
    
    fun set(category: String, key: String, value: Any) {
        store.set(category, key, value)
    }
    
    /**
     * Apply changes with side effects
     */
    fun apply(category: String, key: String, value: Any) {
        val oldValue = store.get(category, key)
        store.set(category, key, value)
        
        // Trigger hardware updates based on setting changes
        when (category to key) {
            "core" to "lc3_frame_size" -> {
                if (value is Int) {
                    if (value != 20 && value != 40 && value != 60) {
                        Bridge.log("MAN: Invalid LC3 frame size $value, must be 20, 40, or 60. Using default 20.")
                        store.set("core", "lc3_frame_size", 20)
                        return
                    }
                    Bridge.log("MAN: LC3 frame size set to $value bytes (${value * 800 / 1000}kbps)")
                }
            }
            "core" to "isHeadUp" -> {
                (value as? Boolean)?.let { isHeadUp ->
                    // sendCurrentState()
                    CoreManager.instance.sendCurrentState()
                    Bridge.sendHeadUp(isHeadUp)
                }
            }
            "core" to "brightness" -> {
                val b = (value as? Int) ?: 50
                val auto = (store.get("core", "auto_brightness") as? Boolean) ?: true
                CoroutineScope(Dispatchers.Main).launch {
                    CoreManager.instance.sgc?.setBrightness(b, auto)
                    CoreManager.instance.sgc?.sendTextWall("Set brightness to $b%")
                    delay(800) // 0.8 seconds
                    CoreManager.instance.sgc?.clearDisplay()
                }
            }
            
            "core" to "auto_brightness" -> {
                val b = (store.get("core", "brightness") as? Int) ?: 50
                val auto = (value as? Boolean) ?: true
                val autoBrightnessChanged = (oldValue as? Boolean) != auto
                CoroutineScope(Dispatchers.Main).launch {
                    CoreManager.instance.sgc?.setBrightness(b, auto)
                    if (autoBrightnessChanged) {
                        CoreManager.instance.sgc?.sendTextWall(
                            if (auto) "Enabled auto brightness" else "Disabled auto brightness"
                        )
                        delay(800) // 0.8 seconds
                        CoreManager.instance.sgc?.clearDisplay()
                    }
                }
            }
            
            "core" to "dashboard_height",
            "core" to "dashboard_depth" -> {
                val h = (store.get("glasses", "dashboard_height") as? Int) ?: 4
                val d = (store.get("glasses", "dashboard_depth") as? Int) ?: 5
                CoroutineScope(Dispatchers.Main).launch {
                    CoreManager.instance.sgc?.setDashboardPosition(h, d)
                }
            }
            
            "core" to "head_up_angle" -> {
                (value as? Int)?.let { angle ->
                    CoreManager.instance.sgc?.setHeadUpAngle(angle)
                }
            }
            
            "core" to "gallery_mode" -> {
                CoreManager.instance.sgc?.sendGalleryMode()
            }
            
            "core" to "screen_disabled" -> {
                (value as? Boolean)?.let { disabled ->
                    if (disabled) {
                        CoreManager.instance.sgc?.exit()
                    } else {
                        CoreManager.instance.sgc?.clearDisplay()
                    }
                }
            }
            
            "core" to "button_mode" -> {
                CoreManager.instance.sgc?.sendButtonModeSetting()
            }
            
            "core" to "button_photo_size" -> {
                CoreManager.instance.sgc?.sendButtonPhotoSettings()
            }
            
            "core" to "button_camera_led" -> {
                CoreManager.instance.sgc?.sendButtonCameraLedSetting()
            }
            
            "core" to "button_max_recording_time" -> {
                CoreManager.instance.sgc?.sendButtonMaxRecordingTime()
            }
            
            "core" to "button_video_width",
            "core" to "button_video_height",
            "core" to "button_video_fps" -> {
                CoreManager.instance.sgc?.sendButtonVideoRecordingSettings()
            }
            
            "core" to "preferred_mic" -> {
                (value as? String)?.let { mic ->
                    apply("core", "mic_ranking", MicMap.map[mic] ?: MicMap.map["auto"]!!)
                    CoreManager.instance.setMicState(
                        (store.get("core", "should_send_pcm_data") as? Boolean) ?: false,
                        (store.get("core", "should_send_transcript") as? Boolean) ?: false,
                        (store.get("core", "bypass_vad") as? Boolean) ?: true
                    )
                }
            }
            
            "core" to "offline_mode" -> {
                (value as? Boolean)?.let { offline ->
                    CoreManager.instance.setMicState(
                        (store.get("core", "should_send_pcm_data") as? Boolean) ?: false,
                        (store.get("core", "should_send_transcript") as? Boolean) ?: false,
                        (store.get("core", "bypass_vad") as? Boolean) ?: true
                    )
                }
            }
            
            "core" to "enforce_local_transcription" -> {
                (value as? Boolean)?.let { enabled ->
                    CoreManager.instance.setMicState(
                        (store.get("core", "should_send_pcm_data") as? Boolean) ?: false,
                        (store.get("core", "should_send_transcript") as? Boolean) ?: false,
                        (store.get("core", "bypass_vad") as? Boolean) ?: true
                    )
                }
            }
            
            "core" to "default_wearable" -> {
                (value as? String)?.let { wearable ->
                    Bridge.saveSetting("default_wearable", wearable)
                }
            }

            "core" to "device_name" -> {
                // Device name changed - no additional action needed
            }
        }
    }
}