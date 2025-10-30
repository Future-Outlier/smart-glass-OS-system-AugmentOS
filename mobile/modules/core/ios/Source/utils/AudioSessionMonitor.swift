//
//  AudioSessionMonitor.swift
//  AOS
//
//  Monitors iOS AVAudioSession for Bluetooth audio device connections
//  Used to detect when Mentra Live glasses are paired/connected for audio
//

import AVFoundation
import Foundation
import UIKit

class AudioSessionMonitor {
    // Singleton instance
    private static var instance: AudioSessionMonitor?

    // Current monitoring state
    private var isMonitoring = false
    private var devicePattern: String?
    private var callback: ((Bool, String?) -> Void)?

    private init() {
        Bridge.log("AudioMonitor: Initialized")
    }

    static func getInstance() -> AudioSessionMonitor {
        if instance == nil {
            instance = AudioSessionMonitor()
        }
        return instance!
    }

    /// Configure AVAudioSession for Bluetooth audio
    /// This must be called before checking availableInputs
    /// Returns true if configuration successful
    func configureAudioSession() -> Bool {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            Bridge.log("AudioMonitor: AVAudioSession configured for Bluetooth")
            return true
        } catch {
            Bridge.log("AudioMonitor: Failed to configure AVAudioSession: \(error)")
            return false
        }
    }

    /// Check if a Bluetooth audio device matching the pattern is currently the active audio route
    /// Returns true if device is actively routing audio
    func isAudioDeviceConnected(devicePattern: String) -> Bool {
        let session = AVAudioSession.sharedInstance()
        let outputs = session.currentRoute.outputs

        for output in outputs {
            if output.portType == .bluetoothHFP || output.portType == .bluetoothA2DP {
                if output.portName.contains(devicePattern) {
                    Bridge.log("AudioMonitor: Found active audio device: \(output.portName)")
                    return true
                }
            }
        }

        Bridge.log("AudioMonitor: No active audio device matching '\(devicePattern)'")
        return false
    }

    /// Try to set a Bluetooth device matching the pattern as the preferred audio output device
    /// This works for both already-active and paired-but-inactive devices
    /// Returns true if device was found and set as preferred (or already active)
    func setAsPreferredAudioOutputDevice(devicePattern: String) -> Bool {
        do {
            let session = AVAudioSession.sharedInstance()

            // Check if already active
            if isAudioDeviceConnected(devicePattern: devicePattern) {
                Bridge.log("AudioMonitor: Device '\(devicePattern)' already active")
                return true
            }

            // Try to find in availableInputs (includes paired devices)
            guard let availableInputs = session.availableInputs else {
                Bridge.log("AudioMonitor: No available inputs")
                return false
            }

            let bluetoothInput = availableInputs.first { input in
                input.portType == .bluetoothHFP &&
                    input.portName.contains(devicePattern)
            }

            guard let btInput = bluetoothInput else {
                Bridge.log("AudioMonitor: Bluetooth HFP device '\(devicePattern)' not found in availableInputs")
                return false
            }

            // Set as preferred input (this routes both input AND output for HFP devices)
            try session.setPreferredInput(btInput)

            Bridge.log("AudioMonitor: ✅ Set '\(btInput.portName)' as preferred audio output device")
            return true

        } catch {
            Bridge.log("AudioMonitor: Failed to set preferred audio output device: \(error)")
            return false
        }
    }

    /// Start monitoring for audio route changes
    /// Callback will be called when device matching pattern connects/disconnects
    func startMonitoring(devicePattern: String, callback: @escaping (Bool, String?) -> Void) {
        guard !isMonitoring else {
            Bridge.log("AudioMonitor: Already monitoring")
            return
        }

        self.devicePattern = devicePattern
        self.callback = callback

        // Register for route change notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        // Register for app foreground notifications
        // This handles the case where user pairs in Settings and returns to app
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppBecameActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        isMonitoring = true
        Bridge.log("AudioMonitor: Started monitoring for '\(devicePattern)'")
    }

    /// Stop monitoring for audio route changes
    func stopMonitoring() {
        guard isMonitoring else {
            Bridge.log("AudioMonitor: Not currently monitoring")
            return
        }

        NotificationCenter.default.removeObserver(
            self,
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        NotificationCenter.default.removeObserver(
            self,
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )

        isMonitoring = false
        devicePattern = nil
        callback = nil

        Bridge.log("AudioMonitor: Stopped monitoring")
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
              let pattern = devicePattern
        else {
            return
        }

        Bridge.log("AudioMonitor: Route change detected: \(reason.rawValue)")

        switch reason {
        case .newDeviceAvailable:
            // When a new device becomes available, try to set it as preferred
            // This handles the case where user pairs in Settings and returns to app
            Bridge.log("AudioMonitor: New device available, attempting to activate '\(pattern)'")

            // IMPORTANT: Reconfigure the session to refresh availableInputs
            // This is crucial after returning from Settings where user may have paired
            _ = configureAudioSession()

            if setAsPreferredAudioOutputDevice(devicePattern: pattern) {
                let session = AVAudioSession.sharedInstance()
                let deviceName = session.currentRoute.outputs.first?.portName
                Bridge.log("AudioMonitor: ✅ Successfully activated newly paired device '\(pattern)'")
                callback?(true, deviceName)
            } else {
                Bridge.log("AudioMonitor: New device available but not matching '\(pattern)'")
            }

        case .oldDeviceUnavailable:
            // Check if our device disconnected
            if !isAudioDeviceConnected(devicePattern: pattern) {
                Bridge.log("AudioMonitor: Device '\(pattern)' disconnected")
                callback?(false, nil)
            }

        default:
            break
        }
    }

    @objc private func handleAppBecameActive() {
        guard let pattern = devicePattern else { return }

        Bridge.log("AudioMonitor: App became active, checking for paired device '\(pattern)'")

        // Reconfigure session now that we're in foreground
        guard configureAudioSession() else {
            Bridge.log("AudioMonitor: Failed to configure session in foreground")
            return
        }

        // Try to activate the device
        if setAsPreferredAudioOutputDevice(devicePattern: pattern) {
            let session = AVAudioSession.sharedInstance()
            let deviceName = session.currentRoute.outputs.first?.portName
            Bridge.log("AudioMonitor: ✅ Activated device after returning from Settings: '\(pattern)'")
            callback?(true, deviceName)
        } else {
            Bridge.log("AudioMonitor: Device '\(pattern)' still not paired after returning to foreground")
        }
    }
}
