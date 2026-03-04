import AVFoundation
import CoreImage
import Foundation

/// Gyroscope-based video stabilizer.
/// Uses IMU sidecar data to apply motion-compensated frame warping,
/// correcting rotation jitter in videos.
///
/// Phase 1: rotation correction (pan/tilt/roll) using gyro integration
/// + exponential moving average smoothing.
class VideoStabilizer {
  private static let TAG = "VideoStabilizer"
  private static let SMOOTH_FACTOR = 0.85

  struct ImuSample {
    let timeMs: Double
    let ax: Double
    let ay: Double
    let az: Double
    let gx: Double
    let gy: Double
    let gz: Double
  }

  /// Stabilize a video using IMU sidecar data.
  /// - Parameters:
  ///   - inputPath: Path to the input MP4 video
  ///   - imuPath: Path to the IMU sidecar JSON file
  ///   - outputPath: Path to write the stabilized MP4
  /// - Returns: Processing time in milliseconds, or -1 on failure
  static func stabilize(inputPath: String, imuPath: String, outputPath: String) -> Int64 {
    let startTime = CFAbsoluteTimeGetCurrent()

    // Parse IMU data
    guard let imuSamples = parseImuData(imuPath), !imuSamples.isEmpty else {
      Bridge.log("\(TAG): No IMU data available")
      return -1
    }
    Bridge.log("\(TAG): Loaded \(imuSamples.count) IMU samples")

    // Integrate gyro data to get cumulative rotation (3 axes)
    var cumulativeRoll = [Double](repeating: 0, count: imuSamples.count)
    var cumulativePitch = [Double](repeating: 0, count: imuSamples.count)
    var cumulativeYaw = [Double](repeating: 0, count: imuSamples.count)

    for i in 1..<imuSamples.count {
      var dt = (imuSamples[i].timeMs - imuSamples[i - 1].timeMs) / 1000.0
      if dt <= 0 || dt > 0.1 { dt = 0.01 }

      cumulativeRoll[i] = cumulativeRoll[i - 1] + imuSamples[i].gx * dt
      cumulativePitch[i] = cumulativePitch[i - 1] + imuSamples[i].gy * dt
      cumulativeYaw[i] = cumulativeYaw[i - 1] + imuSamples[i].gz * dt
    }

    // Smooth with bidirectional EMA
    let smoothRoll = smoothEma(cumulativeRoll)
    let smoothPitch = smoothEma(cumulativePitch)
    let smoothYaw = smoothEma(cumulativeYaw)

    // Correction = smooth - actual
    var corrRoll = [Double](repeating: 0, count: imuSamples.count)
    var corrPitch = [Double](repeating: 0, count: imuSamples.count)
    var corrYaw = [Double](repeating: 0, count: imuSamples.count)
    for i in 0..<imuSamples.count {
      corrRoll[i] = smoothRoll[i] - cumulativeRoll[i]
      corrPitch[i] = smoothPitch[i] - cumulativePitch[i]
      corrYaw[i] = smoothYaw[i] - cumulativeYaw[i]
    }

    // Setup AVAsset reader/writer pipeline
    let inputURL = URL(fileURLWithPath: inputPath)
    let outputURL = URL(fileURLWithPath: outputPath)

    // Remove output if it exists
    try? FileManager.default.removeItem(at: outputURL)

    let asset = AVAsset(url: inputURL)

    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      Bridge.log("\(TAG): No video track found")
      return -1
    }

    let videoSize = videoTrack.naturalSize
    let frameRate = videoTrack.nominalFrameRate
    let videoDuration = CMTimeGetSeconds(asset.duration)
    let imuDurationMs = imuSamples.last?.timeMs ?? 1.0

    Bridge.log(
      "\(TAG): Video \(Int(videoSize.width))x\(Int(videoSize.height)) fps=\(frameRate) duration=\(videoDuration)s"
    )

    // Setup reader
    guard let reader = try? AVAssetReader(asset: asset) else {
      Bridge.log("\(TAG): Failed to create AVAssetReader")
      return -1
    }

    let readerSettings: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    let readerOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: readerSettings)
    reader.add(readerOutput)

    // Setup writer
    guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
      Bridge.log("\(TAG): Failed to create AVAssetWriter")
      return -1
    }

    let writerSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(videoSize.width),
      AVVideoHeightKey: Int(videoSize.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: Int(videoTrack.estimatedDataRate),
        AVVideoMaxKeyFrameIntervalKey: 30,
      ],
    ]
    let videoFormatHint = videoTrack.formatDescriptions.first.map { $0 as! CMFormatDescription }
    let writerInput = AVAssetWriterInput(
      mediaType: .video, outputSettings: writerSettings, sourceFormatHint: videoFormatHint)
    writerInput.transform = videoTrack.preferredTransform

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: writerInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: Int(videoSize.width),
        kCVPixelBufferHeightKey as String: Int(videoSize.height),
      ]
    )
    writer.add(writerInput)

    // Copy audio track if present
    var audioWriterInput: AVAssetWriterInput?
    var audioReaderOutput: AVAssetReaderTrackOutput?
    if let audioTrack = asset.tracks(withMediaType: .audio).first {
      let audioOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: nil)
      reader.add(audioOutput)
      audioReaderOutput = audioOutput

      let audioFormatHint = audioTrack.formatDescriptions.first.map { $0 as! CMFormatDescription }
      let audioInput = AVAssetWriterInput(
        mediaType: .audio, outputSettings: nil, sourceFormatHint: audioFormatHint)
      writer.add(audioInput)
      audioWriterInput = audioInput
    }

    // Start processing
    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    var frameCount = 0

    // Process video frames
    let videoGroup = DispatchGroup()
    videoGroup.enter()

    writerInput.requestMediaDataWhenReady(on: DispatchQueue(label: "videoStabilizer.video")) {
      while writerInput.isReadyForMoreMediaData {
        guard let sampleBuffer = readerOutput.copyNextSampleBuffer() else {
          writerInput.markAsFinished()
          videoGroup.leave()
          return
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let frameTimeMs = CMTimeGetSeconds(presentationTime) * 1000.0

        // Find correction for this frame
        let ratio = imuDurationMs > 0 ? frameTimeMs / imuDurationMs : 0
        let imuIdx = max(0, min(Int(ratio * Double(imuSamples.count - 1)), imuSamples.count - 1))

        let rollCorr = corrRoll[imuIdx]
        let pitchCorr = corrPitch[imuIdx]
        let yawCorr = corrYaw[imuIdx]

        // If correction is negligible, pass through without re-rendering
        if abs(rollCorr) < 0.001 && abs(pitchCorr) < 0.001 && abs(yawCorr) < 0.001 {
          if adaptor.assetWriterInput.isReadyForMoreMediaData,
            let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
          {
            adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
          }
        } else {
          // Apply roll + pitch + yaw correction via affine transform
          guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
          let ciImage = CIImage(cvPixelBuffer: pixelBuffer)

          // rollCorr: Z-axis rotation around center
          // pitchCorr: horizontal shift (small-angle approx)
          // yawCorr: vertical shift (small-angle approx)
          let cx = videoSize.width / 2
          let cy = videoSize.height / 2
          let transform = CGAffineTransform.identity
            .translatedBy(x: cx, y: cy)
            .rotated(by: CGFloat(-rollCorr))
            .translatedBy(x: CGFloat(-pitchCorr) * cx, y: CGFloat(yawCorr) * cy)
            .translatedBy(x: -cx, y: -cy)

          let transformed = ciImage.transformed(by: transform)

          // Crop back to original size (transform may expand bounds)
          let cropped = transformed.cropped(to: CGRect(
            x: transformed.extent.origin.x + (transformed.extent.width - videoSize.width) / 2,
            y: transformed.extent.origin.y + (transformed.extent.height - videoSize.height) / 2,
            width: videoSize.width,
            height: videoSize.height
          ))

          // Render to pixel buffer
          if let pool = adaptor.pixelBufferPool {
            var outputBuffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &outputBuffer)
            if let outBuf = outputBuffer {
              ciContext.render(cropped, to: outBuf)
              adaptor.append(outBuf, withPresentationTime: presentationTime)
            }
          }
        }

        frameCount += 1
      }
    }

    // Process audio
    if let audioInput = audioWriterInput, let audioOutput = audioReaderOutput {
      let audioGroup = DispatchGroup()
      audioGroup.enter()

      audioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "videoStabilizer.audio")) {
        while audioInput.isReadyForMoreMediaData {
          guard let sampleBuffer = audioOutput.copyNextSampleBuffer() else {
            audioInput.markAsFinished()
            audioGroup.leave()
            return
          }
          audioInput.append(sampleBuffer)
        }
      }
      audioGroup.wait()
    }

    videoGroup.wait()

    // Finish writing
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
      semaphore.signal()
    }
    semaphore.wait()

    let elapsed = Int64((CFAbsoluteTimeGetCurrent() - startTime) * 1000)
    Bridge.log("\(TAG): Stabilization complete: \(frameCount) frames in \(elapsed)ms")
    return elapsed
  }

  // MARK: - Private Helpers

  private static func parseImuData(_ path: String) -> [ImuSample]? {
    guard let data = FileManager.default.contents(atPath: path),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let samples = json["samples"] as? [[Any]]
    else {
      return nil
    }

    return samples.compactMap { s -> ImuSample? in
      guard s.count >= 7 else { return nil }
      return ImuSample(
        timeMs: (s[0] as? NSNumber)?.doubleValue ?? 0,
        ax: (s[1] as? NSNumber)?.doubleValue ?? 0,
        ay: (s[2] as? NSNumber)?.doubleValue ?? 0,
        az: (s[3] as? NSNumber)?.doubleValue ?? 0,
        gx: (s[4] as? NSNumber)?.doubleValue ?? 0,
        gy: (s[5] as? NSNumber)?.doubleValue ?? 0,
        gz: (s[6] as? NSNumber)?.doubleValue ?? 0
      )
    }
  }

  private static func smoothEma(_ data: [Double]) -> [Double] {
    guard !data.isEmpty else { return data }
    var smooth = [Double](repeating: 0, count: data.count)
    smooth[0] = data[0]
    // Forward pass
    for i in 1..<data.count {
      smooth[i] = SMOOTH_FACTOR * smooth[i - 1] + (1 - SMOOTH_FACTOR) * data[i]
    }
    // Backward pass (zero-phase)
    for i in stride(from: data.count - 2, through: 0, by: -1) {
      smooth[i] = SMOOTH_FACTOR * smooth[i + 1] + (1 - SMOOTH_FACTOR) * smooth[i]
    }
    return smooth
  }
}
