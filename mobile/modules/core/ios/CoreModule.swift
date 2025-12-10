import ExpoModulesCore
import Photos

public class CoreModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Core")

        // Define events that can be sent to JavaScript
        Events("CoreMessageEvent", "onChange")

        OnCreate {
            // Initialize Bridge with event callback
            Bridge.initialize { [weak self] eventName, data in
                self?.sendEvent(eventName, data)
            }
        }

        // MARK: - Display Commands

        AsyncFunction("displayEvent") { (params: [String: Any]) in
            CoreManager.shared.displayEvent(params)
        }

        AsyncFunction("displayText") { (params: [String: Any]) in
            CoreManager.shared.displayText(params)
        }

        // MARK: - Connection Commands

        AsyncFunction("getStatus") {
            CoreManager.shared.getStatus()
        }

        AsyncFunction("connectDefault") {
            CoreManager.shared.connectDefault()
        }

        AsyncFunction("connectByName") { (deviceName: String) in
            CoreManager.shared.handle_connect_by_name(deviceName)
        }

        AsyncFunction("connectSimulated") {
            CoreManager.shared.connectSimulated()
        }

        AsyncFunction("disconnect") {
            CoreManager.shared.disconnect()
        }

        AsyncFunction("forget") {
            CoreManager.shared.forget()
        }

        AsyncFunction("findCompatibleDevices") { (modelName: String) in
            CoreManager.shared.findCompatibleDevices(modelName)
        }

        AsyncFunction("showDashboard") {
            CoreManager.shared.showDashboard()
        }

        // MARK: - WiFi Commands

        AsyncFunction("requestWifiScan") {
            CoreManager.shared.requestWifiScan()
        }

        AsyncFunction("sendWifiCredentials") { (ssid: String, password: String) in
            CoreManager.shared.sendWifiCredentials(ssid, password)
        }

        AsyncFunction("setHotspotState") { (enabled: Bool) in
            CoreManager.shared.setHotspotState(enabled)
        }

        // MARK: - Gallery Commands

        AsyncFunction("queryGalleryStatus") {
            CoreManager.shared.queryGalleryStatus()
        }

        AsyncFunction("photoRequest") {
            (requestId: String, appId: String, size: String, webhookUrl: String?, authToken: String?, compress: String?) in
            CoreManager.shared.photoRequest(requestId, appId, size, webhookUrl, authToken, compress)
        }

        // MARK: - Video Recording Commands

        AsyncFunction("startBufferRecording") {
            CoreManager.shared.startBufferRecording()
        }

        AsyncFunction("stopBufferRecording") {
            CoreManager.shared.stopBufferRecording()
        }

        AsyncFunction("saveBufferVideo") { (requestId: String, durationSeconds: Int) in
            CoreManager.shared.saveBufferVideo(requestId, durationSeconds)
        }

        AsyncFunction("startVideoRecording") { (requestId: String, save: Bool) in
            CoreManager.shared.startVideoRecording(requestId, save)
        }

        AsyncFunction("stopVideoRecording") { (requestId: String) in
            CoreManager.shared.stopVideoRecording(requestId)
        }

        // MARK: - RTMP Stream Commands

        AsyncFunction("startRtmpStream") { (params: [String: Any]) in
            CoreManager.shared.handle_start_rtmp_stream(params)
        }

        AsyncFunction("stopRtmpStream") {
            CoreManager.shared.stopRtmpStream()
        }

        AsyncFunction("keepRtmpStreamAlive") { (params: [String: Any]) in
            CoreManager.shared.keepRtmpStreamAlive(params)
        }

        // MARK: - Microphone Commands

        AsyncFunction("setMicState") { (requiredDataStrings: [String], bypassVad: Bool) in
            let requiredData = SpeechRequiredDataType.fromStringArray(requiredDataStrings)
            CoreManager.shared.setMicState(requiredData, bypassVad)
        }

        AsyncFunction("restartTranscriber") {
            CoreManager.shared.restartTranscriber()
        }

        // MARK: - RGB LED Control

        AsyncFunction("rgbLedControl") { (requestId: String, packageName: String?, action: String, color: String?, ontime: Int, offtime: Int, count: Int) in
            CoreManager.shared.rgbLedControl(
                requestId: requestId,
                packageName: packageName,
                action: action,
                color: color,
                ontime: ontime,
                offtime: offtime,
                count: count
            )
        }

        // MARK: - Settings Commands

        AsyncFunction("updateSettings") { (params: [String: Any]) in
            CoreManager.shared.updateSettings(params)
        }

        // MARK: - STT Commands

        AsyncFunction("setSttModelDetails") { (path: String, languageCode: String) in
            STTTools.setSttModelDetails(path, languageCode)
        }

        AsyncFunction("getSttModelPath") { () -> String in
            return STTTools.getSttModelPath()
        }

        AsyncFunction("checkSttModelAvailable") { () -> Bool in
            return STTTools.checkSTTModelAvailable()
        }

        AsyncFunction("validateSttModel") { (path: String) -> Bool in
            return STTTools.validateSTTModel(path)
        }

        AsyncFunction("extractTarBz2") { (sourcePath: String, destinationPath: String) -> Bool in
            return STTTools.extractTarBz2(sourcePath: sourcePath, destinationPath: destinationPath)
        }

        // MARK: - Android Stubs

        AsyncFunction("getInstalledApps") { () -> Any in
            return false
        }

        AsyncFunction("hasNotificationListenerPermission") { () -> Any in
            return false
        }

        // Notification management stubs (iOS doesn't support these features)
        Function("setNotificationsEnabled") { (_: Bool) in
            // No-op on iOS
        }

        Function("getNotificationsEnabled") { () -> Bool in
            return false
        }

        Function("setNotificationsBlocklist") { (_: [String]) in
            // No-op on iOS
        }

        Function("getNotificationsBlocklist") { () -> [String] in
            return []
        }

        AsyncFunction("getInstalledAppsForNotifications") { () -> [[String: Any]] in
            return []
        }

        // MARK: - Media Library Commands

        AsyncFunction("saveToGalleryWithDate") { (filePath: String, captureTimeMillis: Int64?) -> [String: Any] in
            do {
                let fileURL = URL(fileURLWithPath: filePath)
                
                guard FileManager.default.fileExists(atPath: filePath) else {
                    return ["success": false, "error": "File does not exist"]
                }

                var assetIdentifier: String?
                let semaphore = DispatchSemaphore(value: 0)
                var resultError: Error?

                PHPhotoLibrary.shared().performChanges({
                    let creationRequest: PHAssetChangeRequest
                    let pathExtension = fileURL.pathExtension.lowercased()
                    
                    if ["mp4", "mov", "avi", "m4v"].contains(pathExtension) {
                        // Video
                        creationRequest = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)!
                    } else {
                        // Photo
                        creationRequest = PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: fileURL)!
                    }

                    // Set the creation date if provided
                    if let captureMillis = captureTimeMillis {
                        let captureDate = Date(timeIntervalSince1970: TimeInterval(captureMillis) / 1000.0)
                        creationRequest.creationDate = captureDate
                        Bridge.log("CoreModule: Setting creation date to: \(captureDate)")
                    }

                    assetIdentifier = creationRequest.placeholderForCreatedAsset?.localIdentifier
                }, completionHandler: { success, error in
                    resultError = error
                    semaphore.signal()
                })

                semaphore.wait()

                if let error = resultError {
                    Bridge.log("CoreModule: Error saving to gallery: \(error.localizedDescription)")
                    return ["success": false, "error": error.localizedDescription]
                }

                Bridge.log("CoreModule: Successfully saved to gallery with proper creation date")
                return ["success": true, "identifier": assetIdentifier ?? ""]
            } catch {
                Bridge.log("CoreModule: Exception saving to gallery: \(error.localizedDescription)")
                return ["success": false, "error": error.localizedDescription]
            }
        }
    }
}
