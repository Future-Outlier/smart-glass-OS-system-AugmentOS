package com.augmentos.asg_client.camera;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureFailure;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.MeteringRectangle;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.util.Range;
import android.util.Rational;
import android.util.Size;
import android.view.Surface;
import android.view.WindowManager;

import com.augmentos.asg_client.utils.WakeLockManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.lifecycle.LifecycleService;

import com.augmentos.asg_client.R;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class CameraNeo extends LifecycleService {
    private static final String TAG = "CameraNeo";
    private static final String CHANNEL_ID = "CameraNeoServiceChannel";
    private static final int NOTIFICATION_ID = 1;

    // Camera variables
    private CameraDevice cameraDevice = null;
    private CaptureRequest.Builder previewBuilder; // Separate builder for preview
    private CameraCaptureSession cameraCaptureSession;
    private ImageReader imageReader;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private Semaphore cameraOpenCloseLock = new Semaphore(1);
    private Size jpegSize;
    private String cameraId;

    // Target photo resolution (4:3 landscape orientation)
    private static final int TARGET_WIDTH = 1440;
    private static final int TARGET_HEIGHT = 1080;

    // Auto-exposure settings for better photo quality - now dynamic
    private static final int JPEG_QUALITY = 90; // High quality JPEG
    private static final int JPEG_ORIENTATION = 270; // Standard orientation

    // Camera characteristics for dynamic auto-exposure
    private int[] availableAeModes;
    private Range<Integer> exposureCompensationRange;
    private Rational exposureCompensationStep;
    private Range<Integer>[] availableFpsRanges;
    private Range<Integer> selectedFpsRange;

    // AE state machine - proper finite-state implementation with sensor stability
    private enum ShotState { IDLE, WAITING_PRECAPTURE, WAITING_CONVERGED, WAITING_SENSOR_STABLE, SHOOTING }
    private volatile ShotState shotState = ShotState.IDLE;
    private long precaptureStartTimeNs;
    private static final long MAX_WAIT_NS = 2_800_000_000L; // 0.8 second timeout

    // Sensor stability tracking - wait for actual exposure values to stabilize
    private int syncLatencyFrames = 2; // reasonable fallback for unknown devices
    private long lastExposureTime = -1L;
    private int lastIso = -1;
    private int stableCounter = 0;

    // Single instance of AE monitoring callback for consistency
    private final AeMonitoringCaptureCallback aeMonitoringCallback = new AeMonitoringCaptureCallback();

    // User-settable exposure compensation (apply BEFORE capture, not during)
    private int userExposureCompensation = 0;

    // Callback and execution handling
    private final Executor executor = Executors.newSingleThreadExecutor();

    // Intent action definitions (MOVED TO TOP)
    public static final String ACTION_TAKE_PHOTO = "com.augmentos.camera.ACTION_TAKE_PHOTO";
    public static final String EXTRA_PHOTO_FILE_PATH = "com.augmentos.camera.EXTRA_PHOTO_FILE_PATH";
    public static final String ACTION_START_VIDEO_RECORDING = "com.augmentos.camera.ACTION_START_VIDEO_RECORDING";
    public static final String ACTION_STOP_VIDEO_RECORDING = "com.augmentos.camera.ACTION_STOP_VIDEO_RECORDING";
    public static final String EXTRA_VIDEO_FILE_PATH = "com.augmentos.camera.EXTRA_VIDEO_FILE_PATH";
    public static final String EXTRA_VIDEO_ID = "com.augmentos.camera.EXTRA_VIDEO_ID";

    // Callback interface for photo capture
    public interface PhotoCaptureCallback {
        void onPhotoCaptured(String filePath);
        void onPhotoError(String errorMessage);
    }

    // Static callback for photo capture
    private static PhotoCaptureCallback sPhotoCallback;

    // For compatibility with CameraRecordingService
    private static String lastPhotoPath;

    // Video recording components
    private MediaRecorder mediaRecorder;
    private Surface recorderSurface;
    private boolean isRecording = false;
    private String currentVideoId;
    private String currentVideoPath;
    private static VideoRecordingCallback sVideoCallback;
    private long recordingStartTime;
    private Timer recordingTimer;
    private Size videoSize; // To store selected video size

    // Static instance for checking camera status
    private static CameraNeo sInstance;

    /**
     * Interface for video recording callbacks
     */
    public interface VideoRecordingCallback {
        void onRecordingStarted(String videoId);

        void onRecordingProgress(String videoId, long durationMs);

        void onRecordingStopped(String videoId, String filePath);

        void onRecordingError(String videoId, String errorMessage);
    }

    /**
     * Get the path to the most recently captured photo
     * Added for compatibility with CameraRecordingService
     */
    public static String getLastPhotoPath() {
        return lastPhotoPath;
    }

    /**
     * Check if the camera is currently in use for photo capture or video recording.
     * This relies on the service instance being available.
     *
     * @return true if the camera is active, false otherwise.
     */
    public static boolean isCameraInUse() {
        if (sInstance != null) {
            // Check if a photo capture session is active (e.g., cameraDevice is open and not for video)
            // or if video recording is active.
            boolean photoSessionActive = (sInstance.cameraDevice != null && sInstance.imageReader != null && !sInstance.isRecording);
            return photoSessionActive || sInstance.isRecording;
        }
        return false; // Service not running or instance not set
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "CameraNeo Camera2 service created");
        createNotificationChannel();
        showNotification("Camera Service", "Service is running");
        startBackgroundThread();
        sInstance = this; // Set static instance
    }

    /**
     * Take a picture and get notified through callback when complete
     *
     * @param context Application context
     * @param filePath File path to save the photo
     * @param callback Callback to be notified when photo is captured
     */
    public static void takePictureWithCallback(Context context, String filePath, PhotoCaptureCallback callback) {
        sPhotoCallback = callback;

        Intent intent = new Intent(context, CameraNeo.class);
        intent.setAction(ACTION_TAKE_PHOTO);
        intent.putExtra(EXTRA_PHOTO_FILE_PATH, filePath);
        context.startForegroundService(intent);
    }

    /**
     * Start video recording and get notified through callback
     *
     * @param context  Application context
     * @param videoId  Unique ID for this video recording session
     * @param filePath File path to save the video
     * @param callback Callback for recording events
     */
    public static void startVideoRecording(Context context, String videoId, String filePath, VideoRecordingCallback callback) {
        sVideoCallback = callback;

        Intent intent = new Intent(context, CameraNeo.class);
        intent.setAction(ACTION_START_VIDEO_RECORDING);
        intent.putExtra(EXTRA_VIDEO_ID, videoId);
        intent.putExtra(EXTRA_VIDEO_FILE_PATH, filePath);
        context.startForegroundService(intent);
    }

    /**
     * Stop the current video recording session
     *
     * @param context Application context
     * @param videoId ID of the video recording session to stop (must match active session)
     */
    public static void stopVideoRecording(Context context, String videoId) {
        Intent intent = new Intent(context, CameraNeo.class);
        intent.setAction(ACTION_STOP_VIDEO_RECORDING);
        intent.putExtra(EXTRA_VIDEO_ID, videoId);
        context.startForegroundService(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            Log.d(TAG, "CameraNeo received action: " + action);

            switch (action) {
                case ACTION_TAKE_PHOTO:
                    String photoFilePath = intent.getStringExtra(EXTRA_PHOTO_FILE_PATH);
                    if (photoFilePath == null || photoFilePath.isEmpty()) {
                        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                        photoFilePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
                    }
                    setupCameraAndTakePicture(photoFilePath);
                    break;
                case ACTION_START_VIDEO_RECORDING:
                    currentVideoId = intent.getStringExtra(EXTRA_VIDEO_ID);
                    currentVideoPath = intent.getStringExtra(EXTRA_VIDEO_FILE_PATH);
                    if (currentVideoPath == null || currentVideoPath.isEmpty()) {
                        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                        currentVideoPath = getExternalFilesDir(null) + File.separator + "VID_" + timeStamp + ".mp4";
                    }
                    setupCameraAndStartRecording(currentVideoId, currentVideoPath);
                    break;
                case ACTION_STOP_VIDEO_RECORDING:
                    String videoIdToStop = intent.getStringExtra(EXTRA_VIDEO_ID);
                    stopCurrentVideoRecording(videoIdToStop);
                    break;
            }
        }
        return START_STICKY;
    }

    private void setupCameraAndTakePicture(String filePath) {
        wakeUpScreen();
        openCameraInternal(filePath, false); // false indicates not for video
    }

    private void setupCameraAndStartRecording(String videoId, String filePath) {
        if (isRecording) {
            notifyVideoError(videoId, "Already recording another video.");
            return;
        }
        wakeUpScreen();
        currentVideoId = videoId;
        currentVideoPath = filePath;
        openCameraInternal(filePath, true); // true indicates for video
    }

    private void stopCurrentVideoRecording(String videoIdToStop) {
        if (!isRecording) {
            Log.w(TAG, "Stop recording requested, but not currently recording.");
            // Optionally notify error or just ignore if it's a common race condition
            if (sVideoCallback != null && videoIdToStop != null) {
                sVideoCallback.onRecordingError(videoIdToStop, "Not recording");
            }
            return;
        }
        if (videoIdToStop == null || !videoIdToStop.equals(currentVideoId)) {
            Log.w(TAG, "Stop recording requested for ID " + videoIdToStop + " but current is " + currentVideoId);
            if (sVideoCallback != null && videoIdToStop != null) {
                sVideoCallback.onRecordingError(videoIdToStop, "Video ID mismatch");
            }
            return;
        }

        try {
            if (mediaRecorder != null) {
                mediaRecorder.stop();
                mediaRecorder.reset();
            }
            Log.d(TAG, "Video recording stopped for: " + currentVideoId);
            if (sVideoCallback != null) {
                sVideoCallback.onRecordingStopped(currentVideoId, currentVideoPath);
            }
        } catch (RuntimeException stopErr) {
            Log.e(TAG, "MediaRecorder.stop() failed", stopErr);
            if (sVideoCallback != null) {
                sVideoCallback.onRecordingError(currentVideoId, "Failed to stop recorder: " + stopErr.getMessage());
            }
            // Still try to clean up even if stop failed
        } finally {
            isRecording = false;
            if (recordingTimer != null) {
                recordingTimer.cancel();
                recordingTimer = null;
            }
            closeCamera();
            stopSelf();
        }
    }

    @SuppressLint("MissingPermission")
    private void openCameraInternal(String filePath, boolean forVideo) {
        CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) {
            Log.e(TAG, "Could not get camera manager");
            if (forVideo) notifyVideoError(currentVideoId, "Camera service unavailable");
            else notifyPhotoError("Camera service unavailable");
            stopSelf();
            return;
        }

        try {
            // First check if camera permission is granted
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                int cameraPermission = checkSelfPermission(android.Manifest.permission.CAMERA);
                if (cameraPermission != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "Camera permission not granted");
                    if (forVideo) notifyVideoError(currentVideoId, "Camera permission not granted");
                    else notifyPhotoError("Camera permission not granted");
                    stopSelf();
                    return;
                }
            }

            String[] cameraIds = manager.getCameraIdList();

            // Find the back camera (primary camera)
            for (String id : cameraIds) {
                CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
                if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    this.cameraId = id;
                    break;
                }
            }

            // If no back camera found, use the first available camera
            if (this.cameraId == null && cameraIds.length > 0) {
                this.cameraId = cameraIds[0];
                Log.d(TAG, "No back camera found, using camera ID: " + this.cameraId);
            }

            // Verify that we have a valid camera ID
            if (this.cameraId == null) {
                if (forVideo) notifyVideoError(currentVideoId, "No suitable camera found");
                else notifyPhotoError("No suitable camera found");
                stopSelf();
                return;
            }

            // Get characteristics for the selected camera
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(this.cameraId);

            // Query camera capabilities for dynamic auto-exposure
            queryCameraCapabilities(characteristics);

            // Check if this camera supports JPEG format
            StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) {
                if (forVideo)
                    notifyVideoError(currentVideoId, "Camera " + this.cameraId + " doesn't support configuration maps");
                else
                    notifyPhotoError("Camera " + this.cameraId + " doesn't support configuration maps");
                stopSelf();
                return;
            }

            // Find the closest available JPEG size to our target
            Size[] jpegSizes = map.getOutputSizes(ImageFormat.JPEG);
            if (jpegSizes == null || jpegSizes.length == 0) {
                if (forVideo)
                    notifyVideoError(currentVideoId, "Camera doesn't support JPEG format");
                else notifyPhotoError("Camera doesn't support JPEG format");
                stopSelf();
                return;
            }

            // Log available sizes
            Log.d(TAG, "Available JPEG sizes for camera " + this.cameraId + ":");
            for (Size size : jpegSizes) {
                Log.d(TAG, "  " + size.getWidth() + "x" + size.getHeight());
            }

            jpegSize = chooseOptimalSize(jpegSizes, TARGET_WIDTH, TARGET_HEIGHT);
            Log.d(TAG, "Selected JPEG size: " + jpegSize.getWidth() + "x" + jpegSize.getHeight());

            // If this is for video, set up video size too
            if (forVideo) {
                // Find a suitable video size
                Size[] videoSizes = map.getOutputSizes(MediaRecorder.class);

                if (videoSizes == null || videoSizes.length == 0) {
                    notifyVideoError(currentVideoId, "Camera doesn't support MediaRecorder");
                    stopSelf();
                    return;
                }

                // Log available video sizes
                Log.d(TAG, "Available video sizes for camera " + this.cameraId + ":");
                for (Size size : videoSizes) {
                    Log.d(TAG, "  " + size.getWidth() + "x" + size.getHeight());
                }

                // Default to 720p if available, otherwise find closest
                int targetVideoWidth = 1280;
                int targetVideoHeight = 720;
                videoSize = chooseOptimalSize(videoSizes, targetVideoWidth, targetVideoHeight);
                Log.d(TAG, "Selected video size: " + videoSize.getWidth() + "x" + videoSize.getHeight());

                // Initialize MediaRecorder
                setupMediaRecorder(currentVideoPath);
            }

            // Setup ImageReader for JPEG data
            imageReader = ImageReader.newInstance(
                    jpegSize.getWidth(), jpegSize.getHeight(),
                    ImageFormat.JPEG, 2);

            imageReader.setOnImageAvailableListener(reader -> {
                // Only process images when we're actually shooting, not during precapture metering
                if (shotState != ShotState.SHOOTING) {
                    Log.d(TAG, "ImageReader triggered during " + shotState + " state, ignoring (this is normal during AE metering)");
                    // Consume the image to prevent backing up the queue
                    try (Image image = reader.acquireLatestImage()) {
                        // Just consume and discard
                    }
                    return;
                }

                // Process the captured JPEG (only when in SHOOTING state)
                Log.d(TAG, "Processing final photo capture...");
                try (Image image = reader.acquireLatestImage()) {
                    if (image == null) {
                        Log.e(TAG, "Acquired image is null");
                        notifyPhotoError("Failed to acquire image data");
                        unlockAeAndResumePreview();
                        stopSelf();
                        return;
                    }

                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.remaining()];
                    buffer.get(bytes);

                    // Save the image data to the file
                    boolean success = saveImageDataToFile(bytes, filePath);

                    if (success) {
                        lastPhotoPath = filePath;
                        notifyPhotoCaptured(filePath);
                        Log.d(TAG, "Photo saved successfully: " + filePath);
                    } else {
                        notifyPhotoError("Failed to save image");
                    }

                    // Proper cleanup after photo processing
                    unlockAeAndResumePreview();

                    // Clean up resources and stop service
                    closeCamera();
                    stopSelf();
                } catch (Exception e) {
                    Log.e(TAG, "Error handling image data", e);
                    notifyPhotoError("Error processing photo: " + e.getMessage());
                    unlockAeAndResumePreview();
                    closeCamera();
                    stopSelf();
                }
            }, backgroundHandler);

            // Open the camera
            if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
                throw new RuntimeException("Time out waiting to lock camera opening.");
            }

            Log.d(TAG, "Opening camera ID: " + this.cameraId);
            manager.openCamera(this.cameraId, forVideo ? videoStateCallback : photoStateCallback, backgroundHandler);

        } catch (CameraAccessException e) {
            // Handle camera access exceptions more specifically
            Log.e(TAG, "Camera access exception: " + e.getReason(), e);
            String errorMsg = "Could not access camera";

            // Check for specific error reasons
            if (e.getReason() == CameraAccessException.CAMERA_DISABLED) {
                errorMsg = "Camera disabled by policy - please check camera permissions in Settings";
                // Try to recover by restarting the camera service
                Log.d(TAG, "Attempting to restart camera service in safe mode");
                restartCameraServiceIfNeeded();
            } else if (e.getReason() == CameraAccessException.CAMERA_ERROR) {
                errorMsg = "Camera device encountered an error";
            } else if (e.getReason() == CameraAccessException.CAMERA_IN_USE) {
                errorMsg = "Camera is already in use by another app";
                // Try to close other camera sessions
                releaseCameraResources();
            }

            if (forVideo) notifyVideoError(currentVideoId, errorMsg);
            else notifyPhotoError(errorMsg);
            stopSelf();
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted while trying to lock camera", e);
            notifyPhotoError("Camera operation interrupted");
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Error setting up camera", e);
            notifyPhotoError("Error setting up camera: " + e.getMessage());
            stopSelf();
        }
    }

    /**
     * Setup MediaRecorder for video recording
     */
    private void setupMediaRecorder(String filePath) {
        try {
            if (mediaRecorder == null) {
                mediaRecorder = new MediaRecorder();
            } else {
                mediaRecorder.reset();
            }

            // Set up media recorder sources and formats
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);

            // Set output format
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);

            // Set output file
            mediaRecorder.setOutputFile(filePath);

            // Set video encoding parameters
            mediaRecorder.setVideoEncodingBitRate(10000000); // 10Mbps
            mediaRecorder.setVideoFrameRate(30);
            mediaRecorder.setVideoSize(videoSize.getWidth(), videoSize.getHeight());
            mediaRecorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);

            // Set audio encoding parameters
            mediaRecorder.setAudioEncodingBitRate(128000);
            mediaRecorder.setAudioSamplingRate(44100);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);

            // Set standard orientation
            mediaRecorder.setOrientationHint(JPEG_ORIENTATION);

            // Prepare the recorder
            mediaRecorder.prepare();

            // Get the surface from the recorder
            recorderSurface = mediaRecorder.getSurface();

            Log.d(TAG, "MediaRecorder setup complete for: " + filePath);
        } catch (Exception e) {
            Log.e(TAG, "Error setting up MediaRecorder", e);
            if (mediaRecorder != null) {
                mediaRecorder.release();
                mediaRecorder = null;
            }
            notifyVideoError(currentVideoId, "Failed to set up video recorder: " + e.getMessage());
        }
    }

    /**
     * Save image data to file
     */
    private boolean saveImageDataToFile(byte[] data, String filePath) {
        try {
            File file = new File(filePath);

            // Ensure parent directory exists
            File parentDir = file.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            // Write image data to file
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(data);
            }

            Log.d(TAG, "Saved image to: " + filePath);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error saving image", e);
            return false;
        }
    }

    /**
     * Camera state callback for Camera2 API
     */
    private final CameraDevice.StateCallback photoStateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device opened successfully");
            cameraOpenCloseLock.release();
            cameraDevice = camera;
            createCameraSessionInternal(false); // false for photo
        }

        @Override
        public void onDisconnected(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device disconnected");
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            notifyPhotoError("Camera disconnected");
            stopSelf();
        }

        @Override
        public void onError(@NonNull CameraDevice camera, int error) {
            Log.e(TAG, "Camera device error: " + error);
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            notifyPhotoError("Camera device error: " + error);
            stopSelf();
        }
    };

    private final CameraDevice.StateCallback videoStateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device opened successfully");
            cameraOpenCloseLock.release();
            cameraDevice = camera;
            createCameraSessionInternal(true); // true for video
        }

        @Override
        public void onDisconnected(@NonNull CameraDevice camera) {
            Log.d(TAG, "Camera device disconnected");
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            notifyVideoError(currentVideoId, "Camera disconnected");
            stopSelf();
        }

        @Override
        public void onError(@NonNull CameraDevice camera, int error) {
            Log.e(TAG, "Camera device error: " + error);
            cameraOpenCloseLock.release();
            camera.close();
            cameraDevice = null;
            notifyVideoError(currentVideoId, "Camera device error: " + error);
            stopSelf();
        }
    };

    private void createCameraSessionInternal(boolean forVideo) {
        try {
            if (cameraDevice == null) {
                Log.e(TAG, "Camera device is null in createCameraSessionInternal");
                if (forVideo) notifyVideoError(currentVideoId, "Camera not initialized");
                else notifyPhotoError("Camera not initialized");
                stopSelf();
                return;
            }

            List<Surface> surfaces = new ArrayList<>();
            if (forVideo) {
                if (recorderSurface == null) {
                    notifyVideoError(currentVideoId, "Recorder surface null");
                    stopSelf();
                    return;
                }
                surfaces.add(recorderSurface);
                previewBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
                previewBuilder.addTarget(recorderSurface);
            } else {
                if (imageReader == null || imageReader.getSurface() == null) {
                    notifyPhotoError("ImageReader surface null");
                    stopSelf();
                    return;
                }
                surfaces.add(imageReader.getSurface());
                previewBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                previewBuilder.addTarget(imageReader.getSurface());
            }

            // Configure auto-exposure settings for better photo quality
            previewBuilder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
            previewBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);

            // Use dynamic FPS range to prevent long exposure times that cause overexposure
            previewBuilder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, selectedFpsRange);

            // Apply user exposure compensation BEFORE capture (not during)
            previewBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, userExposureCompensation);

            // Use center-weighted metering for better subject exposure
            previewBuilder.set(CaptureRequest.CONTROL_AE_REGIONS, new MeteringRectangle[]{
                new MeteringRectangle(0, 0, jpegSize.getWidth(), jpegSize.getHeight(), MeteringRectangle.METERING_WEIGHT_MAX)
            });

            // Enable continuous autofocus for better focus
            previewBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);

            // Set auto white balance
            previewBuilder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);

            // Enhanced image quality settings
            previewBuilder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
            previewBuilder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);

            if (!forVideo) {
                // Photo-specific settings
                previewBuilder.set(CaptureRequest.JPEG_QUALITY, (byte) JPEG_QUALITY);
                previewBuilder.set(CaptureRequest.JPEG_ORIENTATION, JPEG_ORIENTATION);
            }

            CameraCaptureSession.StateCallback sessionStateCallback = new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(@NonNull CameraCaptureSession session) {
                    cameraCaptureSession = session;
                    if (forVideo) {
                        startRecordingInternal();
                    } else {
                        // Start proper preview for photos with AE state monitoring
                        startPreviewWithAeMonitoring();
                    }
                }

                @Override
                public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                    Log.e(TAG, "Failed to configure camera session for " + (forVideo ? "video" : "photo"));
                    if (forVideo)
                        notifyVideoError(currentVideoId, "Failed to configure camera for video");
                    else notifyPhotoError("Failed to configure camera for photo");
                    stopSelf();
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                List<OutputConfiguration> outputConfigurations = new ArrayList<>();
                for (Surface surface : surfaces) {
                    outputConfigurations.add(new OutputConfiguration(surface));
                }
                SessionConfiguration config = new SessionConfiguration(SessionConfiguration.SESSION_REGULAR, outputConfigurations, executor, sessionStateCallback);
                cameraDevice.createCaptureSession(config);
            } else {
                cameraDevice.createCaptureSession(surfaces, sessionStateCallback, backgroundHandler);
            }
        } catch (CameraAccessException e) {
            Log.e(TAG, "Camera access exception in createCameraSessionInternal", e);
            if (forVideo) notifyVideoError(currentVideoId, "Camera access error");
            else notifyPhotoError("Camera access error");
            stopSelf();
        } catch (IllegalStateException e) {
            Log.e(TAG, "Illegal state in createCameraSessionInternal", e);
            if (forVideo) notifyVideoError(currentVideoId, "Camera illegal state");
            else notifyPhotoError("Camera illegal state");
            stopSelf();
        }
    }

    private void startRecordingInternal() {
        if (cameraDevice == null || cameraCaptureSession == null || mediaRecorder == null) {
            notifyVideoError(currentVideoId, "Cannot start recording, camera not ready.");
            return;
        }
        try {
            cameraCaptureSession.setRepeatingRequest(previewBuilder.build(), null, backgroundHandler);
            mediaRecorder.start();
            isRecording = true;
            recordingStartTime = System.currentTimeMillis();
            if (sVideoCallback != null) {
                sVideoCallback.onRecordingStarted(currentVideoId);
            }
            // Start progress timer if callback is interested
            if (sVideoCallback != null) {
                recordingTimer = new Timer();
                recordingTimer.schedule(new TimerTask() {
                    @Override
                    public void run() {
                        if (isRecording && sVideoCallback != null) {
                            long duration = System.currentTimeMillis() - recordingStartTime;
                            sVideoCallback.onRecordingProgress(currentVideoId, duration);
                        }
                    }
                }, 1000, 1000); // Update every second
            }
            Log.d(TAG, "Video recording started for: " + currentVideoId);
        } catch (CameraAccessException | IllegalStateException e) {
            Log.e(TAG, "Failed to start video recording", e);
            notifyVideoError(currentVideoId, "Failed to start recording: " + e.getMessage());
            isRecording = false;
        }
    }

        /**
     * Choose the optimal size from available choices based on desired dimensions.
     * Finds the size with the smallest total difference between requested and available dimensions.
     *
     * @param choices Available size options
     * @param desiredWidth Target width
     * @param desiredHeight Target height
     * @return The closest matching size, or null if no choices available
     */
    private Size chooseOptimalSize(Size[] choices, int desiredWidth, int desiredHeight) {
        if (choices == null || choices.length == 0) {
            Log.w(TAG, "No size choices available");
            return null;
        }

        // First, try to find an exact match
        for (Size option : choices) {
            if (option.getWidth() == desiredWidth && option.getHeight() == desiredHeight) {
                Log.d(TAG, "Found exact size match: " + option.getWidth() + "x" + option.getHeight());
                return option;
            }
        }

        // No exact match found, find the size with smallest total dimensional difference
        Log.d(TAG, "No exact match found, finding closest size to " + desiredWidth + "x" + desiredHeight);

        Size bestSize = choices[0];
        int smallestDifference = Integer.MAX_VALUE;

        for (Size option : choices) {
            int widthDiff = Math.abs(option.getWidth() - desiredWidth);
            int heightDiff = Math.abs(option.getHeight() - desiredHeight);
            int totalDifference = widthDiff + heightDiff;

            Log.d(TAG, "Size " + option.getWidth() + "x" + option.getHeight() +
                  " difference: " + totalDifference + " (width: " + widthDiff + ", height: " + heightDiff + ")");

            if (totalDifference < smallestDifference) {
                smallestDifference = totalDifference;
                bestSize = option;
            }
        }

        Log.d(TAG, "Selected optimal size: " + bestSize.getWidth() + "x" + bestSize.getHeight() +
              " (total difference: " + smallestDifference + ")");

        return bestSize;
    }

    private void notifyVideoError(String videoId, String errorMessage) {
        if (sVideoCallback != null && videoId != null) {
            executor.execute(() -> sVideoCallback.onRecordingError(videoId, errorMessage));
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (isRecording) {
            stopCurrentVideoRecording(currentVideoId);
        }
        closeCamera();
        stopBackgroundThread();
        releaseWakeLocks();
        sInstance = null;
    }

    private void notifyPhotoCaptured(String filePath) {
        if (sPhotoCallback != null) {
            executor.execute(() -> sPhotoCallback.onPhotoCaptured(filePath));
        }
    }

    private void notifyPhotoError(String errorMessage) {
        if (sPhotoCallback != null) {
            executor.execute(() -> sPhotoCallback.onPhotoError(errorMessage));
        }
    }

    /**
     * Start background thread
     */
    private void startBackgroundThread() {
        backgroundThread = new HandlerThread("CameraNeoBackground");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    /**
     * Stop background thread
     */
    private void stopBackgroundThread() {
        if (backgroundThread != null) {
            backgroundThread.quitSafely();
            try {
                backgroundThread.join();
                backgroundThread = null;
                backgroundHandler = null;
            } catch (InterruptedException e) {
                Log.e(TAG, "Interrupted when stopping background thread", e);
            }
        }
    }

    /**
     * Close camera resources
     */
    private void closeCamera() {
        try {
            cameraOpenCloseLock.acquire();
            if (cameraCaptureSession != null) {
                cameraCaptureSession.close();
                cameraCaptureSession = null;
            }
            if (cameraDevice != null) {
                cameraDevice.close();
                cameraDevice = null;
            }
            if (imageReader != null) {
                imageReader.close();
                imageReader = null;
            }
            if (mediaRecorder != null) {
                mediaRecorder.release();
                mediaRecorder = null;
            }
            if (recorderSurface != null) {
                recorderSurface.release();
                recorderSurface = null;
            }
            releaseWakeLocks();
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted while closing camera", e);
        } finally {
            cameraOpenCloseLock.release();
        }
    }

    /**
     * Release wake locks to avoid battery drain
     */
    private void releaseWakeLocks() {
        // Use the WakeLockManager to release all wake locks
        WakeLockManager.releaseAllWakeLocks();
    }

    /**
     * Force the screen to turn on so camera can be accessed
     */
    private void wakeUpScreen() {
        Log.d(TAG, "Waking up screen for camera access");
        // Use the WakeLockManager to acquire both CPU and screen wake locks
        WakeLockManager.acquireFullWakeLockAndBringToForeground(this, 180000, 5000);
    }

    /**
     * Attempt to restart the camera service with different parameters if needed
     */
    private void restartCameraServiceIfNeeded() {
        try {
            // First, release all current camera resources
            releaseCameraResources();

            Log.d(TAG, "Camera service restart attempt made - waiting for system to release camera");

            // Implement retry mechanism with delay to handle policy-disabled errors
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                Log.d(TAG, "Attempting camera restart with delayed retry");

                // Try with a different camera ID if available
                CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (manager != null) {
                    try {
                        String[] cameraIds = manager.getCameraIdList();
                        // If we were using camera "0", try a different one if available
                        if (cameraIds.length > 1 && "0".equals(cameraId)) {
                            this.cameraId = "1";
                            Log.d(TAG, "Switching to alternate camera ID: " + this.cameraId);
                        }
                    } catch (CameraAccessException e) {
                        Log.e(TAG, "Error accessing camera during retry", e);
                    }
                }

                // Request camera focus - this can help on some devices by signaling
                // to the system that camera is needed
                wakeUpScreen();

                // Try releasing all app camera resources forcibly
                if (cameraDevice != null) {
                    cameraDevice.close();
                    cameraDevice = null;
                }

                if (cameraCaptureSession != null) {
                    cameraCaptureSession.close();
                    cameraCaptureSession = null;
                }

                System.gc(); // Request garbage collection
            }, 1000); // Short delay before retry
        } catch (Exception e) {
            Log.e(TAG, "Error in camera service restart", e);
        }
    }

    /**
     * Release all camera system resources
     */
    private void releaseCameraResources() {
        try {
            // Request to release system-wide camera resources
            closeCamera();

            // For policy-based restrictions, we need to ensure camera resources are fully released
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // On newer Android versions, encourage system resource release
                CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (manager != null) {
                    // Nothing we can directly do to force release, but we can
                    // make sure our resources are gone
                    if (cameraDevice != null) {
                        cameraDevice.close();
                        cameraDevice = null;
                    }
                    System.gc();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error releasing camera resources", e);
        }
    }

    // -----------------------------------------------------------------------------------
    // Notification handling
    // -----------------------------------------------------------------------------------

    private void showNotification(String title, String message) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(false);

        // Start in foreground
        startForeground(NOTIFICATION_ID, builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Camera Neo Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Query camera capabilities for dynamic auto-exposure
     */
    private void queryCameraCapabilities(CameraCharacteristics characteristics) {
        // Get available AE modes
        availableAeModes = characteristics.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_MODES);
        if (availableAeModes == null) {
            availableAeModes = new int[]{CaptureRequest.CONTROL_AE_MODE_ON};
        }

        // Get exposure compensation range and step
        exposureCompensationRange = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
        if (exposureCompensationRange == null) {
            exposureCompensationRange = Range.create(-2, 2); // Default range
        }

        exposureCompensationStep = characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);
        if (exposureCompensationStep == null) {
            exposureCompensationStep = new Rational(1, 6); // Default 1/6 EV step
        }

        // Get available FPS ranges
        availableFpsRanges = characteristics.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        if (availableFpsRanges == null || availableFpsRanges.length == 0) {
            selectedFpsRange = Range.create(30, 30); // Default to 30fps
        } else {
            // Choose optimal FPS range - prefer 30fps for photos, allow higher max for flexibility
            selectedFpsRange = chooseOptimalFpsRange(availableFpsRanges);
        }

        // Cache sync latency for sensor stability tracking
        Integer latency = characteristics.get(CameraCharacteristics.SYNC_MAX_LATENCY);
        if (latency != null && latency != CameraCharacteristics.SYNC_MAX_LATENCY_UNKNOWN) {
            syncLatencyFrames = latency;
        }

        Log.d(TAG, "Camera capabilities - AE modes: " + java.util.Arrays.toString(availableAeModes));
        Log.d(TAG, "Exposure compensation range: " + exposureCompensationRange + ", step: " + exposureCompensationStep);
        Log.d(TAG, "Selected FPS range: " + selectedFpsRange);
        Log.d(TAG, "Sync latency (frames): " + syncLatencyFrames);
    }

    /**
     * Choose optimal FPS range for photo capture
     */
    private Range<Integer> chooseOptimalFpsRange(Range<Integer>[] ranges) {
        // Prefer ranges that include 30fps and don't go too low (prevents long exposure times)
        for (Range<Integer> range : ranges) {
            if (range.contains(30) && range.getLower() >= 15) {
                return range;
            }
        }

        // Fallback: choose range with highest minimum FPS
        Range<Integer> best = ranges[0];
        for (Range<Integer> range : ranges) {
            if (range.getLower() > best.getLower()) {
                best = range;
            }
        }
        return best;
    }

    /**
     * Start preview with AE monitoring - called when camera session is ready
     */
    private void startPreviewWithAeMonitoring() {
        try {
            // Start repeating preview request with AE monitoring
            cameraCaptureSession.setRepeatingRequest(previewBuilder.build(),
                aeMonitoringCallback, backgroundHandler);

            // Trigger the capture sequence immediately
            startPrecaptureSequence();

        } catch (CameraAccessException e) {
            Log.e(TAG, "Error starting preview with AE monitoring", e);
            notifyPhotoError("Error starting preview: " + e.getMessage());
            closeCamera();
            stopSelf();
        }
    }

    /**
     * Start the proper three-phase precapture sequence
     */
    private void startPrecaptureSequence() {
        try {
            // Phase 1: Reset state and start waiting for PRECAPTURE
            shotState = ShotState.WAITING_PRECAPTURE;
            precaptureStartTimeNs = System.nanoTime();

            // Reset sensor stability tracking for new shot
            stableCounter = 0;
            lastExposureTime = -1L;
            lastIso = -1;

            // Create a fresh precapture request (separate from preview)
            CaptureRequest.Builder precaptureBuilder =
                cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            // Add ImageReader surface for metering (but callback will check state before saving)
            precaptureBuilder.addTarget(imageReader.getSurface());

            // Copy settings from preview
            precaptureBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            precaptureBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            precaptureBuilder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, selectedFpsRange);
            precaptureBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, userExposureCompensation);

            // Trigger precapture sequence
            precaptureBuilder.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER,
                CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_START);

            cameraCaptureSession.capture(precaptureBuilder.build(),
                aeMonitoringCallback, backgroundHandler);

            Log.d(TAG, "Precapture sequence started, waiting for AE_STATE_PRECAPTURE...");

        } catch (CameraAccessException e) {
            Log.e(TAG, "Error starting precapture sequence", e);
            notifyPhotoError("Error starting precapture sequence: " + e.getMessage());
            closeCamera();
            stopSelf();
        }
    }

    /**
     * Proper three-phase AE state machine capture callback
     */
    private class AeMonitoringCaptureCallback extends CameraCaptureSession.CaptureCallback {
        @Override
        public void onCaptureCompleted(@NonNull CameraCaptureSession session,
                                     @NonNull CaptureRequest request,
                                     @NonNull TotalCaptureResult result) {

            Integer aeState = result.get(CaptureResult.CONTROL_AE_STATE);
            Log.d(TAG, "AE Callback - Current shotState: " + shotState + ", AE_STATE: " +
                 (aeState != null ? getAeStateName(aeState) : "null"));

            if (aeState == null) {
                Log.w(TAG, "AE_STATE is null, cannot proceed with state machine");
                return;
            }

            switch (shotState) {
                case WAITING_PRECAPTURE:
                    Log.d(TAG, "Phase 1: Waiting for PRECAPTURE, current AE state: " + getAeStateName(aeState));
                    // Phase 1: Wait for AE_STATE_PRECAPTURE
                    if (aeState == CaptureResult.CONTROL_AE_STATE_PRECAPTURE) {
                        shotState = ShotState.WAITING_CONVERGED;
                        Log.d(TAG, "Phase 1 complete: AE_STATE_PRECAPTURE reached, now waiting for convergence...");
                    }
                    // Check for timeout
                    if ((System.nanoTime() - precaptureStartTimeNs) > MAX_WAIT_NS) {
                        Log.w(TAG, "Timeout waiting for PRECAPTURE, proceeding anyway");
                        shotState = ShotState.WAITING_CONVERGED;
                    }
                    break;

                case WAITING_CONVERGED:
                    Log.d(TAG, "Phase 2: Waiting for CONVERGED, current AE state: " + getAeStateName(aeState));
                    // Phase 2: Wait for AE_STATE_CONVERGED or FLASH_REQUIRED
                    boolean converged = (aeState == CaptureResult.CONTROL_AE_STATE_CONVERGED ||
                                       aeState == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED);
                    boolean timeout = (System.nanoTime() - precaptureStartTimeNs) > MAX_WAIT_NS;

                    if (converged || timeout) {
                        Log.d(TAG, "Phase 2 complete: AE converged (" + getAeStateName(aeState) +
                             (timeout ? " with timeout)" : ")") + ", now waiting for sensor stability...");
                        shotState = ShotState.WAITING_SENSOR_STABLE;
                    }
                    break;

                case WAITING_SENSOR_STABLE:
                    // Phase 3: Wait for sensor exposure values to actually stabilize
                    if (aeState == CaptureResult.CONTROL_AE_STATE_CONVERGED ||
                        aeState == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED) {

                        Long exposureTime = result.get(CaptureResult.SENSOR_EXPOSURE_TIME);
                        Integer isoSensitivity = result.get(CaptureResult.SENSOR_SENSITIVITY);

                        if (exposureTime != null && isoSensitivity != null) {
                            if (exposureTime == lastExposureTime && isoSensitivity == lastIso) {
                                // Values are stable, increment counter
                                if (++stableCounter >= syncLatencyFrames) {
                                    Log.d(TAG, "Phase 3 complete: Sensor exposure stable for " + syncLatencyFrames +
                                         " frames (exp=" + exposureTime + "ns, ISO=" + isoSensitivity + "), locking and shooting...");
                                    lockAndShoot();
                                } else {
                                    Log.d(TAG, "Sensor stability check: " + stableCounter + "/" + syncLatencyFrames +
                                         " (exp=" + exposureTime + "ns, ISO=" + isoSensitivity + ")");
                                }
                            } else {
                                // Values changed, reset counter
                                stableCounter = 0;
                                lastExposureTime = exposureTime;
                                lastIso = isoSensitivity;
                                Log.d(TAG, "Sensor values changed, resetting stability counter (exp=" +
                                     exposureTime + "ns, ISO=" + isoSensitivity + ")");
                            }
                        }
                    }

                    // Check for timeout in this phase too
                    if ((System.nanoTime() - precaptureStartTimeNs) > MAX_WAIT_NS) {
                        Log.w(TAG, "Timeout waiting for sensor stability, proceeding anyway");
                        lockAndShoot();
                    }
                    break;

                case SHOOTING:
                    // Phase 4: Already shooting, just log
                    Log.d(TAG, "Phase 4: Photo capture in progress...");
                    break;

                default:
                    // Should not happen
                    break;
            }
        }

        @Override
        public void onCaptureFailed(@NonNull CameraCaptureSession session,
                                  @NonNull CaptureRequest request,
                                  @NonNull CaptureFailure failure) {
            Log.e(TAG, "Capture failed during AE sequence: " + failure.getReason());
            notifyPhotoError("AE sequence failed: " + failure.getReason());
            unlockAeAndResumePreview(); // Cleanup on failure
            closeCamera();
            stopSelf();
        }
    }

    /**
     * Get human-readable AE state name for logging
     */
    private String getAeStateName(int aeState) {
        switch (aeState) {
            case CaptureResult.CONTROL_AE_STATE_INACTIVE: return "INACTIVE";
            case CaptureResult.CONTROL_AE_STATE_SEARCHING: return "SEARCHING";
            case CaptureResult.CONTROL_AE_STATE_CONVERGED: return "CONVERGED";
            case CaptureResult.CONTROL_AE_STATE_LOCKED: return "LOCKED";
            case CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED: return "FLASH_REQUIRED";
            case CaptureResult.CONTROL_AE_STATE_PRECAPTURE: return "PRECAPTURE";
            default: return "UNKNOWN(" + aeState + ")";
        }
    }

    /**
     * Phase 3: Lock AE and shoot the photo
     */
    private void lockAndShoot() {
        try {
            shotState = ShotState.SHOOTING;

            // Step 1: Lock exposure on preview
            CaptureRequest.Builder lockBuilder =
                cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            lockBuilder.addTarget(imageReader.getSurface());
            lockBuilder.set(CaptureRequest.CONTROL_AE_LOCK, true);
            lockBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            lockBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            lockBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, userExposureCompensation);

            cameraCaptureSession.capture(lockBuilder.build(), null, backgroundHandler);

            // Step 2: JPEG capture with locked AE
            CaptureRequest.Builder stillBuilder =
                cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            stillBuilder.addTarget(imageReader.getSurface());

            // Copy locked AE settings
            stillBuilder.set(CaptureRequest.CONTROL_AE_LOCK, true);
            stillBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            stillBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            stillBuilder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);
            stillBuilder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, userExposureCompensation);

            // High quality settings
            stillBuilder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
            stillBuilder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);
            stillBuilder.set(CaptureRequest.JPEG_QUALITY, (byte) JPEG_QUALITY);
            stillBuilder.set(CaptureRequest.JPEG_ORIENTATION, JPEG_ORIENTATION);

            // Capture the final photo
            cameraCaptureSession.capture(stillBuilder.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(@NonNull CameraCaptureSession session,
                                             @NonNull CaptureRequest request,
                                             @NonNull TotalCaptureResult result) {
                    Log.d(TAG, "Photo capture completed successfully");
                    // Cleanup will happen in ImageReader callback after JPEG is processed
                }

                @Override
                public void onCaptureFailed(@NonNull CameraCaptureSession session,
                                          @NonNull CaptureRequest request,
                                          @NonNull CaptureFailure failure) {
                    Log.e(TAG, "Photo capture failed: " + failure.getReason());
                    notifyPhotoError("Photo capture failed: " + failure.getReason());
                    unlockAeAndResumePreview();
                    closeCamera();
                    stopSelf();
                }
            }, backgroundHandler);

        } catch (CameraAccessException e) {
            Log.e(TAG, "Error during lockAndShoot", e);
            notifyPhotoError("Error capturing photo: " + e.getMessage());
            unlockAeAndResumePreview();
            closeCamera();
            stopSelf();
        }
    }

    /**
     * Cleanup: unlock AE and resume preview (called after photo or on error)
     */
    private void unlockAeAndResumePreview() {
        try {
            if (cameraCaptureSession == null) return;

            CaptureRequest.Builder unlockBuilder =
                cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            unlockBuilder.addTarget(imageReader.getSurface());
            unlockBuilder.set(CaptureRequest.CONTROL_AE_LOCK, false);
            unlockBuilder.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER,
                CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_CANCEL);
            unlockBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            unlockBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);

            cameraCaptureSession.setRepeatingRequest(unlockBuilder.build(), null, backgroundHandler);
            shotState = ShotState.IDLE;

            Log.d(TAG, "AE unlocked and preview resumed");

        } catch (CameraAccessException e) {
            Log.e(TAG, "Error unlocking AE", e);
        }
    }
}
