import ExpoModulesCore
import Photos

public class CoreModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Crust")

        // Define events that can be sent to JavaScript
        Events("crust_event", "onChange")

        OnCreate {
            // Initialize Bridge with event callback
            Bridge.initialize { [weak self] eventName, data in
                self?.sendEvent(eventName, data)
            }
        }

        // MARK: - STT Commands

        // AsyncFunction("setSttModelDetails") { (path: String, languageCode: String) in
        //     STTTools.setSttModelDetails(path, languageCode)
        // }

        // AsyncFunction("getSttModelPath") { () -> String in
        //     return STTTools.getSttModelPath()
        // }

        // AsyncFunction("checkSttModelAvailable") { () -> Bool in
        //     return STTTools.checkSTTModelAvailable()
        // }

        // AsyncFunction("validateSttModel") { (path: String) -> Bool in
        //     return STTTools.validateSTTModel(path)
        // }

        // AsyncFunction("extractTarBz2") { (sourcePath: String, destinationPath: String) -> Bool in
        //     return STTTools.extractTarBz2(sourcePath: sourcePath, destinationPath: destinationPath)
        // }

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

        AsyncFunction("saveToGalleryWithDate") {
            (filePath: String, captureTimeMillis: Int64?) -> [String: Any] in
            let fileURL = URL(fileURLWithPath: filePath)

            guard FileManager.default.fileExists(atPath: filePath) else {
                return ["success": false, "error": "File does not exist"]
            }

            var assetIdentifier: String?
            let semaphore = DispatchSemaphore(value: 0)
            var resultError: Error?

            PHPhotoLibrary.shared().performChanges {
                let creationRequest: PHAssetChangeRequest
                let pathExtension = fileURL.pathExtension.lowercased()

                if ["mp4", "mov", "avi", "m4v"].contains(pathExtension) {
                    // Video
                    creationRequest = PHAssetChangeRequest.creationRequestForAssetFromVideo(
                        atFileURL: fileURL)!
                } else {
                    // Photo
                    creationRequest = PHAssetChangeRequest.creationRequestForAssetFromImage(
                        atFileURL: fileURL)!
                }

                // Set the creation date if provided
                if let captureMillis = captureTimeMillis {
                    let captureDate = Date(
                        timeIntervalSince1970: TimeInterval(captureMillis) / 1000.0)
                    creationRequest.creationDate = captureDate
                    Bridge.log("CoreModule: Setting creation date to: \(captureDate)")
                }

                assetIdentifier = creationRequest.placeholderForCreatedAsset?.localIdentifier
            } completionHandler: { _, error in
                resultError = error
                semaphore.signal()
            }

            semaphore.wait()

            if let error = resultError {
                Bridge.log("CoreModule: Error saving to gallery: \(error.localizedDescription)")
                return ["success": false, "error": error.localizedDescription]
            }

            Bridge.log("CoreModule: Successfully saved to gallery with proper creation date")
            return ["success": true, "identifier": assetIdentifier ?? ""]
        }
    }
}
