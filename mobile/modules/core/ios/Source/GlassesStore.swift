//
//  GlassesStore.swift
//  Core
//
//  Centralized observable state store for glasses and core settings
//

import Foundation

@MainActor
class GlassesStore {
    static let shared = GlassesStore()
    let store = ObservableStore()

    private init() {
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

    // Apply changes with side effects
    func apply(_ category: String, _ key: String, _ value: Any) {
        let oldValue = store.get(category, key)
        store.set(category, key, value)

        // Trigger hardware updates based on setting changes
        switch (category, key) {
        case ("glasses", "brightness"):
            let b = value as? Int ?? 50
            let auto = store.get("glasses", "auto_brightness") as? Bool ?? true
            Task {
                CoreManager.shared.sgc?.setBrightness(b, autoMode: auto)
                CoreManager.shared.sgc?.sendTextWall("Set brightness to \(b)%")
                try? await Task.sleep(nanoseconds: 800_000_000)  // 0.8 seconds
                CoreManager.shared.sgc?.clearDisplay()
            }

        case ("glasses", "auto_brightness"):
            let b = store.get("glasses", "brightness") as? Int ?? 50
            let auto = value as? Bool ?? true
            let autoBrightnessChanged = (oldValue as? Bool) != auto
            Task {
                CoreManager.shared.sgc?.setBrightness(b, autoMode: auto)
                if autoBrightnessChanged {
                    CoreManager.shared.sgc?.sendTextWall(
                        auto ? "Enabled auto brightness" : "Disabled auto brightness"
                    )
                    try? await Task.sleep(nanoseconds: 800_000_000)  // 0.8 seconds
                    CoreManager.shared.sgc?.clearDisplay()
                }
            }

        case ("glasses", "dashboard_height"), ("glasses", "dashboard_depth"):
            let h = store.get("glasses", "dashboard_height") as? Int ?? 4
            let d = store.get("glasses", "dashboard_depth") as? Int ?? 5
            Task { await CoreManager.shared.sgc?.setDashboardPosition(h, d) }

        case ("glasses", "head_up_angle"):
            if let angle = value as? Int {
                CoreManager.shared.sgc?.setHeadUpAngle(angle)
            }

        case ("glasses", "gallery_mode"):
            CoreManager.shared.sgc?.sendGalleryMode()

        case ("glasses", "screen_disabled"):
            if let disabled = value as? Bool {
                if disabled {
                    CoreManager.shared.sgc?.exit()
                } else {
                    CoreManager.shared.sgc?.clearDisplay()
                }
            }

        case ("glasses", "button_mode"):
            CoreManager.shared.sgc?.sendButtonModeSetting()

        case ("glasses", "button_photo_size"):
            CoreManager.shared.sgc?.sendButtonPhotoSettings()

        case ("glasses", "button_camera_led"):
            CoreManager.shared.sgc?.sendButtonCameraLedSetting()

        case ("glasses", "button_max_recording_time"):
            CoreManager.shared.sgc?.sendButtonMaxRecordingTime()

        case ("glasses", "button_video_width"), ("glasses", "button_video_height"),
            ("glasses", "button_video_fps"):
            CoreManager.shared.sgc?.sendButtonVideoRecordingSettings()

        case ("glasses", "preferred_mic"):
            if let mic = value as? String {
                CoreManager.shared.preferredMic = mic
                CoreManager.shared.micRanking = MicMap.map[mic] ?? MicMap.map["auto"]!
                CoreManager.shared.setMicState(
                    CoreManager.shared.shouldSendPcmData,
                    CoreManager.shared.shouldSendTranscript,
                    CoreManager.shared.bypassVad
                )
            }

        case ("glasses", "bypass_vad"):
            if let bypass = value as? Bool {
                CoreManager.shared.bypassVad = bypass
            }

        case ("glasses", "offline_mode"):
            if let offline = value as? Bool {
                CoreManager.shared.offlineMode = offline
                CoreManager.shared.setMicState(
                    CoreManager.shared.shouldSendPcmData,
                    CoreManager.shared.shouldSendTranscript,
                    CoreManager.shared.bypassVad
                )
            }

        case ("glasses", "contextual_dashboard"):
            if let enabled = value as? Bool {
                CoreManager.shared.contextualDashboard = enabled
            }

        case ("core", "power_saving_mode"):
            if let enabled = value as? Bool {
                CoreManager.shared.powerSavingMode = enabled
            }

        case ("core", "metric_system"):
            if let enabled = value as? Bool {
                CoreManager.shared.metricSystem = enabled
            }

        default:
            break
        }
    }
}
