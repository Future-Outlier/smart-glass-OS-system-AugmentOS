package com.augmentos.asg_client;

// ---------------------------------------------------------------------------------
// Below are the imports you likely need; if your project requires others, keep them:
// ---------------------------------------------------------------------------------
import static com.augmentos.asg_client.AsgConstants.asgServiceNotificationId;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

import androidx.core.app.NotificationCompat;
import androidx.preference.PreferenceManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import com.augmentos.asg_client.streaming.RtmpStreamingService;
import com.augmentos.augmentos_core.AugmentosService;
import com.augmentos.asg_client.bluetooth.BluetoothManagerFactory;
import com.augmentos.asg_client.bluetooth.BluetoothStateListener;
import com.augmentos.asg_client.bluetooth.IBluetoothManager;
import com.augmentos.asg_client.camera.MediaCaptureService;
import com.augmentos.asg_client.camera.MediaUploadQueueManager;
import com.augmentos.asg_client.network.INetworkManager;
import com.augmentos.asg_client.network.NetworkManagerFactory;
import com.augmentos.asg_client.network.NetworkStateListener; // Make sure this is the correct import path for your library
import com.augmentos.augmentos_core.smarterglassesmanager.camera.CameraRecordingService;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;

/**
 * This is the FULL AsgClientService code that:
 * 1) Runs in the foreground.
 * 2) Starts and binds to AugmentosService so we can get its instance.
 * 3) Cleans up properly when stopped or destroyed.
 *
 * "NOTHING LEFT OUT" – all functionality is shown below.
 */
public class AsgClientService extends Service implements NetworkStateListener, BluetoothStateListener {

    // ---------------------------------------------
    // Constants & Class Fields
    // ---------------------------------------------
    public static final String TAG = "AugmentOS_AsgClientService";

    // Actions for starting/stopping service
    public static final String ACTION_START_CORE = "ACTION_START_CORE";
    public static final String ACTION_STOP_CORE = "ACTION_STOP_CORE";
    public static final String ACTION_START_FOREGROUND_SERVICE = "MY_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "MY_ACTION_STOP_FOREGROUND_SERVICE";
    public static final String ACTION_START_OTA_UPDATER = "ACTION_START_OTA_UPDATER";
    // Add the restart action constant
    public static final String ACTION_RESTART_SERVICE = "com.augmentos.asg_client.ACTION_RESTART_SERVICE";
    public static final String ACTION_RESTART_COMPLETE = "com.augmentos.asg_client.ACTION_RESTART_COMPLETE";
    public static final String ACTION_RESTART_CAMERA = "com.augmentos.asg_client.ACTION_RESTART_CAMERA";
    
    // OTA Update progress actions
    public static final String ACTION_DOWNLOAD_PROGRESS = "com.augmentos.otaupdater.ACTION_DOWNLOAD_PROGRESS";
    public static final String ACTION_INSTALLATION_PROGRESS = "com.augmentos.otaupdater.ACTION_INSTALLATION_PROGRESS";

    // Notification channel info
    private final String notificationAppName = "ASG Client";
    private final String notificationDescription = "Running in foreground";
    private final String myChannelId = "asg_client";

    // Binder for any clients that bind to AsgClientService (optional usage)
    private final IBinder binder = new LocalBinder();

    // Reference to the AugmentosService we bind to
    private AugmentosService augmentosService = null;
    private boolean isAugmentosBound = false;

    // Network management
    private static final int WIFI_SETUP_PORT = 8088;
    private INetworkManager networkManager;

    // Bluetooth management
    private IBluetoothManager bluetoothManager;

    // Microphone management for non-K900 devices
    private com.augmentos.asg_client.audio.GlassesMicrophoneManager glassesMicrophoneManager;
    private boolean isK900Device = false;

    // Photo queue manager for handling offline media uploads
    private MediaUploadQueueManager mMediaQueueManager;

    // Media capture service
    private MediaCaptureService mMediaCaptureService;

    // 1. Add enum for photo capture mode at the top of the class
    private enum PhotoCaptureMode {
        SAVE_LOCALLY,
        CLOUD
    }

    // 2. Add a field to store the current mode
    private PhotoCaptureMode currentPhotoMode = PhotoCaptureMode.CLOUD;

    // Service health monitoring
    private static final String ACTION_HEARTBEAT = "com.augmentos.asg_client.ACTION_HEARTBEAT";
    private static final String ACTION_HEARTBEAT_ACK = "com.augmentos.asg_client.ACTION_HEARTBEAT_ACK";
    private static final long HEARTBEAT_TIMEOUT_MS = 10000; // 10 seconds
    private static final long RECOVERY_TIMEOUT_MS = 60000; // 1 minute
    private static final long RECOVERY_HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds during recovery

    private Handler heartbeatHandler;
    private long lastHeartbeatTime = 0;
    private boolean isInRecoveryMode = false;
    private int missedHeartbeats = 0;

    // WiFi state change debouncing
    private static final long WIFI_STATE_DEBOUNCE_MS = 1000; // 1 second debounce
    private Handler wifiDebounceHandler;
    private Runnable wifiDebounceRunnable;
    private boolean lastWifiState = false;
    private boolean pendingWifiState = false;
    
    // Battery status tracking
    private int glassesBatteryLevel = -1; // -1 means unknown
    private boolean glassesCharging = false;
    
    // Track last broadcasted battery status to avoid redundant broadcasts
    private int lastBroadcastedBatteryLevel = -1;
    private boolean lastBroadcastedCharging = false;
    // Battery status tracking
    private int batteryVoltage = -1;
    private int batteryPercentage = -1;

    // Receiver for handling restart requests from OTA updater
    private BroadcastReceiver restartReceiver;
    
    // Receiver for handling OTA update progress from OTA updater
    private BroadcastReceiver otaProgressReceiver;

    // ---------------------------------------------
    // ServiceConnection for the AugmentosService
    // ---------------------------------------------
    private final ServiceConnection augmentosConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "onServiceConnected: AugmentosService is connected");
            // We have the binder from AugmentosService, so cast and get the instance
            AugmentosService.LocalBinder binder = (AugmentosService.LocalBinder) service;
            augmentosService = binder.getService();
            isAugmentosBound = true;

            Log.d(TAG, "AugmentosService is bound and ready for action!");

            // Check if we're connected to WiFi
            if (networkManager != null && networkManager.isConnectedToWifi()) {
                Log.d(TAG, "We have WiFi connectivity - ready to connect to backend");
                onWifiConnected();
            } else {
                Log.d(TAG, "No WiFi connectivity detected - waiting for user to provide credentials via hotspot");
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "onServiceDisconnected: AugmentosService disconnected");
            isAugmentosBound = false;
            augmentosService = null;
        }
    };

    // ---------------------------------------------
    // LocalBinder: allows this service to be bound
    // ---------------------------------------------
    public class LocalBinder extends Binder {
        public AsgClientService getService() {
            return AsgClientService.this;
        }
    }

    // ---------------------------------------------
    // Lifecycle Methods
    // ---------------------------------------------
    public AsgClientService() {
        // Empty constructor
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AsgClientService onCreate");

        // Enable WiFi when service starts
        openWifi(this, true);

        // Start OTA Updater after 5 seconds
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "Starting OTA Updater MainActivity after delay");
            Intent otaIntent = new Intent();
            otaIntent.setClassName("com.augmentos.otaupdater", "com.augmentos.otaupdater.MainActivity");
            otaIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(otaIntent);
        }, 5000); // 5 seconds delay

        // Send version info after 3 seconds
//        new Handler(Looper.getMainLooper()).postDelayed(() -> {
//            Log.d(TAG, "Sending version info after delay");
            sendVersionInfo();
//        }, 3000); // 3 seconds delay

        // Register restart receiver
        registerRestartReceiver();

        // Register OTA progress receiver
        registerOtaProgressReceiver();

        // Initialize the network manager
        initializeNetworkManager();

        // Initialize the bluetooth manager
        initializeBluetoothManager();

        // Initialize the photo queue manager
        initializeMediaQueueManager();

        // Initialize the photo capture service
        initializeMediaCaptureService();

        // Initialize streaming callbacks
        initializeStreamingCallbacks();

        // Initialize WiFi debouncing
        initializeWifiDebouncing();

        // Register service health monitor with both actions
        IntentFilter heartbeatFilter = new IntentFilter();
        heartbeatFilter.addAction(ACTION_HEARTBEAT);
        heartbeatFilter.addAction("com.augmentos.otaupdater.ACTION_HEARTBEAT"); // For backward compatibility
        registerReceiver(heartbeatReceiver, heartbeatFilter);
        Log.d(TAG, "Registered service health monitor with actions: " + ACTION_HEARTBEAT);

        // Start RTMP streaming for testing
        //startRtmpStreaming();

        // Recording test code (kept from original)
        // this.recordFor5Seconds();

        // DEBUG: Start the debug photo upload timer for VPS
        //startDebugVpsPhotoUploadTimer();

        // Register OTA download complete receiver
        // IntentFilter filter = new IntentFilter("com.augmentos.otaupdater.ACTION_OTA_DOWNLOAD_COMPLETE");
        // registerReceiver(otaDownloadReceiver, filter);

        //SysControl.disablePackageViaAdb(getApplicationContext(), "com.xy.fakelauncher");
        //SysControl.disablePackage(getApplicationContext(), "com.xy.fakelauncher");
        SysControl.uninstallPackage(getApplicationContext(), "com.lhs.btserver");
        SysControl.uninstallPackageViaAdb(getApplicationContext(), "com.lhs.btserver");
    }

    private final BroadcastReceiver heartbeatReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            //Log.d(TAG, "@#$$% Received broadcast with action: " + action);

            if (ACTION_HEARTBEAT.equals(action) || "com.augmentos.otaupdater.ACTION_HEARTBEAT".equals(action)) {
                lastHeartbeatTime = System.currentTimeMillis();
                //Log.d(TAG, "Service heartbeat received at " + lastHeartbeatTime);

                // Send acknowledgment back to monitor
                Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
                ackIntent.setPackage("com.augmentos.otaupdater");
                sendBroadcast(ackIntent);
                //Log.d(TAG, "Service heartbeat acknowledged and sent back to OTA Updater");
            }
        }
    };

    /**
     * Initialize streaming callbacks for RTMP status updates
     */
    private void initializeStreamingCallbacks() {
        // Register for streaming status callbacks
        com.augmentos.asg_client.streaming.RtmpStreamingService.setStreamingStatusCallback(streamingStatusCallback);
        Log.d(TAG, "Registered RTMP streaming callbacks");
    }

    /**
     * Initialize WiFi state change debouncing mechanism
     */
    private void initializeWifiDebouncing() {
        wifiDebounceHandler = new Handler(Looper.getMainLooper());
        wifiDebounceRunnable = new Runnable() {
            @Override
            public void run() {
                // Only send if the pending state is different from the last sent state
                if (pendingWifiState != lastWifiState) {
                    Log.d(TAG, "🔄 WiFi debounce timeout - sending final state: " + (pendingWifiState ? "CONNECTED" : "DISCONNECTED"));
                    lastWifiState = pendingWifiState;
                    sendWifiStatusOverBle(pendingWifiState);
                }
            }
        };
        Log.d(TAG, "Initialized WiFi state change debouncing with " + WIFI_STATE_DEBOUNCE_MS + "ms timeout");
    }

    /**
     * Handle streaming events from the RtmpStreamingService
     */
    @org.greenrobot.eventbus.Subscribe(threadMode = org.greenrobot.eventbus.ThreadMode.MAIN)
    public void onStreamingEvent(com.augmentos.asg_client.streaming.StreamingEvent event) {
        if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Started) {
            Log.d(TAG, "RTMP streaming started successfully");
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Stopped) {
            Log.d(TAG, "RTMP streaming stopped");
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Error) {
            Log.e(TAG, "RTMP streaming error: " + ((com.augmentos.asg_client.streaming.StreamingEvent.Error) event).getMessage());
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Connected) {
            Log.d(TAG, "RTMP connection established");
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.ConnectionFailed) {
            Log.e(TAG, "RTMP connection failed: " + ((com.augmentos.asg_client.streaming.StreamingEvent.ConnectionFailed) event).getMessage());
        }
    }

    /**
     * Initialize the media queue manager
     */
    private void initializeMediaQueueManager() {
        if (mMediaQueueManager == null) {
            mMediaQueueManager = new MediaUploadQueueManager(getApplicationContext());

            // Set up queue callback
            mMediaQueueManager.setMediaQueueCallback(new MediaUploadQueueManager.MediaQueueCallback() {
                @Override
                public void onMediaQueued(String requestId, String filePath, int mediaType) {
                    Log.d(TAG, "Media queued: " + requestId + ", path: " + filePath + ", type: " +
                            (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "photo" : "video"));
                }

                @Override
                public void onMediaUploaded(String requestId, String url, int mediaType) {
                    String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                    Log.d(TAG, mediaTypeName + " uploaded from queue: " + requestId + ", URL: " + url);
                    // Send notification to phone if connected
                    sendMediaSuccessResponse(requestId, url, mediaType);
                }

                @Override
                public void onMediaUploadFailed(String requestId, String error, int mediaType) {
                    String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                    Log.d(TAG, mediaTypeName + " upload failed from queue: " + requestId + ", error: " + error);
                    // We don't send error notifications to avoid spamming the phone
                }
            });

            // Process the queue in case there are queued items from previous sessions
            mMediaQueueManager.processQueue();
        }
    }


    /**
     * Initialize the media capture service
     */
    private void initializeMediaCaptureService() {
        if (mMediaCaptureService == null) {
            if (mMediaQueueManager == null) {
                initializeMediaQueueManager();
            }

            mMediaCaptureService = new MediaCaptureService(getApplicationContext(), mMediaQueueManager) {
                @Override
                protected void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
                    // Override to delegate to parent class
                    AsgClientService.this.sendMediaSuccessResponse(requestId, mediaUrl, mediaType);
                }

                @Override
                protected void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
                    // Override to delegate to parent class
                    AsgClientService.this.sendMediaErrorResponse(requestId, errorMessage, mediaType);
                }
            };

            // Set the media capture listener
            mMediaCaptureService.setMediaCaptureListener(mediaCaptureListener);
        }
    }

    /**
     * Get the media queue manager instance
     *
     * @return MediaUploadQueueManager instance
     */
    public MediaUploadQueueManager getMediaQueueManager() {
        if (mMediaQueueManager == null) {
            initializeMediaQueueManager();
        }
        return mMediaQueueManager;
    }

    /**
     * Get the media capture service instance
     *
     * @return MediaCaptureService instance
     */
    public MediaCaptureService getMediaCaptureService() {
        if (mMediaCaptureService == null) {
            initializeMediaCaptureService();
        }
        return mMediaCaptureService;
    }

    /**
     * Initialize the network manager and set up callbacks
     */
    private void initializeNetworkManager() {
        // Create the network manager using the factory
        networkManager = NetworkManagerFactory.getNetworkManager(getApplicationContext());

        // Add a listener for network state changes (using the service itself as the listener)
        networkManager.addWifiListener(this);

        // Initialize the network manager
        networkManager.initialize();
    }

    /**
     * Initialize the bluetooth manager and set up callbacks
     */
    private void initializeBluetoothManager() {
        // Enhanced logging
        Log.e(TAG, "==========================================================");
        Log.e(TAG, "== INITIALIZING BLUETOOTH MANAGER");
        Log.e(TAG, "== Thread: " + Thread.currentThread().getId());
        Log.e(TAG, "==========================================================");

        // Create the bluetooth manager using the factory
        bluetoothManager = BluetoothManagerFactory.getBluetoothManager(getApplicationContext());

        // Enhanced logging about which manager was created
        Log.e(TAG, "==========================================================");
        Log.e(TAG, "== BLUETOOTH MANAGER CREATED");
        Log.e(TAG, "== Class: " + bluetoothManager.getClass().getName());
        Log.e(TAG, "== Simple name: " + bluetoothManager.getClass().getSimpleName());
        Log.e(TAG, "==========================================================");

        // Check if we're on a K900 device
        isK900Device = bluetoothManager.getClass().getSimpleName().contains("K900");
        Log.d(TAG, "Device type detected: " + (isK900Device ? "K900" : "Standard Android"));

        // If not a K900 device, initialize the glasses microphone manager
        if (!isK900Device) {
            //initializeGlassesMicrophoneManager();
        }

        // Add a listener for bluetooth state changes (using the service itself as the listener)
        bluetoothManager.addBluetoothListener(this);

        // Initialize the bluetooth manager
        bluetoothManager.initialize();
    }

    /**
     * Initialize the glasses microphone manager (only for non-K900 devices)
     * Passes the existing bluetoothManager instance to ensure thread safety
     */
    private void initializeGlassesMicrophoneManager() {
        if (glassesMicrophoneManager != null) {
            // Already initialized
            return;
        }

        try {
            Log.d(TAG, "Initializing glasses microphone manager for non-K900 device");
            Log.d(TAG, "Thread ID: " + Thread.currentThread().getId() + ", Thread name: " + Thread.currentThread().getName());

            // Pass the existing bluetoothManager instance instead of creating a new one
            glassesMicrophoneManager = new com.augmentos.asg_client.audio.GlassesMicrophoneManager(
                    getApplicationContext(), bluetoothManager);

            // Set up a callback for LC3 encoded audio data if needed
            glassesMicrophoneManager.setLC3DataCallback(lc3Data -> {
                // This callback is optional - we already send data directly through BLE in the manager
                //Log.d(TAG, "Received LC3 encoded audio data: " + lc3Data.length + " bytes");
            });

            Log.d(TAG, "Successfully initialized glasses microphone manager with shared bluetoothManager");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing glasses microphone manager", e);
            glassesMicrophoneManager = null;
        }
    }

    /**
     * Called when WiFi is connected
     */
    private void onWifiConnected() {
        Log.d(TAG, "Connected to WiFi network");

        // If the AugmentOS service is bound, connect to the backend
        if (isAugmentosBound && augmentosService != null) {
            Log.d(TAG, "AugmentOS service is available, connecting to backend...");
            // Add code to connect to backend service here
            // For example:
            // augmentosService.connectToBackend();
        }
    }

    /**
     * This is where we handle start commands, like ACTION_START_CORE or ACTION_STOP_CORE.
     * We also start/stop or bind/unbind AugmentosService here.
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        // CRITICAL: Ensure we call startForeground immediately on API 26+ to avoid ANR
        // This is a safety measure to ensure we're always starting in foreground mode
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            createNotificationChannel();
            startForeground(asgServiceNotificationId, updateNotification());
            Log.d(TAG, "Pre-emptively called startForeground to avoid background execution errors");
        }

        if (intent == null || intent.getAction() == null) {
            Log.e(TAG, "Received null intent or null action");
            return START_STICKY;
        }

        String action = intent.getAction();
        Bundle extras = intent.getExtras(); // Not used, but available if needed

        switch (action) {
            case ACTION_START_CORE:
            case ACTION_START_FOREGROUND_SERVICE:
                Log.d(TAG, "AsgClientService onStartCommand -> starting foreground");
                createNotificationChannel();
                startForeground(asgServiceNotificationId, updateNotification());

                // 1) Start AugmentosService in the background/foreground
                //    so it's alive even if we unbind.
                Intent augmentosIntent = new Intent(this, AugmentosService.class);
                augmentosIntent.setAction(AugmentosService.ACTION_START_CORE);
                break;

            case ACTION_RESTART_SERVICE:
                Log.d(TAG, "AsgClientService onStartCommand -> restart request received");
                createNotificationChannel();
                startForeground(asgServiceNotificationId, updateNotification());

                // Register the restart receiver if not already registered
                registerRestartReceiver();

                // Initialize components if not already done
                if (!isInitialized()) {
                    Log.d(TAG, "Initializing components after restart");
                    safelyInitializeComponents();
                }

                // Send restart complete broadcast
                Intent completeIntent = new Intent(ACTION_RESTART_COMPLETE);
                completeIntent.setPackage("com.augmentos.otaupdater");
                sendBroadcast(completeIntent);
                Log.d(TAG, "✅ Sent restart complete broadcast");

                // Send heartbeat acknowledgment to confirm restart
                Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
                ackIntent.setPackage("com.augmentos.otaupdater");
                sendBroadcast(ackIntent);
                Log.d(TAG, "✅ Sent heartbeat acknowledgment to OTA updater after restart");
                break;

            case ACTION_STOP_CORE:
            case ACTION_STOP_FOREGROUND_SERVICE:
                Log.d(TAG, "AsgClientService onStartCommand -> stopping foreground");
                stopForeground(true);
                stopSelf();

                // If we're bound to AugmentosService, unbind
                if (isAugmentosBound) {
                    unbindService(augmentosConnection);
                    isAugmentosBound = false;
                }

                // Optionally also stop AugmentosService entirely
                // if you want it fully shut down:
                stopService(new Intent(this, AugmentosService.class));
                break;

            case ACTION_RESTART_CAMERA:
                Log.d(TAG, "AsgClientService onStartCommand -> camera restart request received");

                // Request camera reset by running adb commands to reset camera service
                try {
                    // Try to reset camera permissions first
                    SysControl.injectAdbCommand(getApplicationContext(), "pm grant " + getPackageName() + " android.permission.CAMERA");

                    // Try to kill camera service processes to force a reset
                    SysControl.injectAdbCommand(getApplicationContext(), "kill $(pidof cameraserver)");

                    // Also try to kill media server as it sometimes helps
                    SysControl.injectAdbCommand(getApplicationContext(), "kill $(pidof mediaserver)");

                    Log.d(TAG, "Camera service reset commands sent");
                } catch (Exception e) {
                    Log.e(TAG, "Error attempting to reset camera service", e);
                }
                break;

            default:
                Log.d(TAG, "Unknown action received in onStartCommand: " + action);
                break;
        }

        return START_STICKY;
    }

    private void recordFor5Seconds(){
        // This method is no longer used, but kept for reference
        // Would need to implement using CameraNeo if needed
    }
    /**
     * Creates or updates our foreground notification channel and returns the
     * Notification object used by startForeground().
     */
    private Notification updateNotification() {
        Context context = getApplicationContext();

        // This PendingIntent leads to MainActivity if user taps the notification
        PendingIntent action = PendingIntent.getActivity(
                context,
                0,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_MUTABLE
        );

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            // Fallback - if manager is null, we can't create a channel, but we can build a basic notification
            return new NotificationCompat.Builder(this, myChannelId)
                    .setContentTitle(notificationAppName)
                    .setContentText(notificationDescription)
                    .setSmallIcon(com.augmentos.augmentos_core.R.drawable.ic_launcher_foreground)
                    .setOngoing(true)
                    .build();
        }

        // For Android O+, create or update notification channel
        NotificationChannel channel = new NotificationChannel(
                myChannelId,
                notificationAppName,
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(notificationDescription);
        manager.createNotificationChannel(channel);

        // Build the actual notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, myChannelId)
                .setContentIntent(action)
                .setContentTitle(notificationAppName)
                .setContentText(notificationDescription)
                .setSmallIcon(com.augmentos.augmentos_core.R.drawable.ic_launcher_foreground)
                .setTicker("...")
                .setOngoing(true);

        return builder.build();
    }


    /**
     * Called when we're destroyed. Good place to unbind from services if needed.
     */
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AsgClientService onDestroy");

        // Unregister service health monitor
        try {
            unregisterReceiver(heartbeatReceiver);
            Log.d(TAG, "Unregistered service health monitor");
        } catch (IllegalArgumentException e) {
            // Receiver was not registered
            Log.w(TAG, "Service health monitor was not registered");
        }

        // Unregister restart receiver
        try {
            if (restartReceiver != null) {
                unregisterReceiver(restartReceiver);
                Log.d(TAG, "Unregistered restart receiver");
            }
        } catch (IllegalArgumentException e) {
            // Receiver was not registered
            Log.w(TAG, "Restart receiver was not registered");
        }

        // Unregister OTA progress receiver
        try {
            if (otaProgressReceiver != null) {
                unregisterReceiver(otaProgressReceiver);
                Log.d(TAG, "Unregistered OTA progress receiver");
            }
        } catch (IllegalArgumentException e) {
            // Receiver was not registered
            Log.w(TAG, "OTA progress receiver was not registered");
        }

        // If still bound to AugmentosService, unbind
        if (isAugmentosBound) {
            unbindService(augmentosConnection);
            isAugmentosBound = false;
        }

        // Unregister streaming callback
        com.augmentos.asg_client.streaming.RtmpStreamingService.setStreamingStatusCallback(null);

        // Stop RTMP streaming if active
        try {
            org.greenrobot.eventbus.EventBus.getDefault().post(
                    new com.augmentos.asg_client.streaming.StreamingCommand.Stop()
            );

            // Also use the static method as a backup
            com.augmentos.asg_client.streaming.RtmpStreamingService.stopStreaming(this);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping RTMP streaming", e);
        }

        // Unregister from EventBus
        if (org.greenrobot.eventbus.EventBus.getDefault().isRegistered(this)) {
            org.greenrobot.eventbus.EventBus.getDefault().unregister(this);
        }

        // Clean up WiFi debouncing
        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
            wifiDebounceHandler = null;
            wifiDebounceRunnable = null;
        }

        // Shutdown the network manager if it's initialized
        if (networkManager != null) {
            networkManager.shutdown();
        }

        // Shutdown the bluetooth manager if it's initialized
        if (bluetoothManager != null) {
            // Remove this service as a listener first
            bluetoothManager.removeBluetoothListener(this);
            // Then shutdown the bluetooth manager
            bluetoothManager.shutdown();
        }

        // Clean up the glasses microphone manager if it's initialized
        if (glassesMicrophoneManager != null) {
            glassesMicrophoneManager.destroy();
            glassesMicrophoneManager = null;
        }

        // No need to clean up MediaQueueManager as it's stateless and file-based

        super.onDestroy();
        unregisterReceiver(otaDownloadReceiver);

        if (heartbeatHandler != null) {
            heartbeatHandler.removeCallbacksAndMessages(null);
        }
        try {
            unregisterReceiver(heartbeatReceiver);
        } catch (IllegalArgumentException e) {
            // Receiver might not be registered
        }
    }

    // ---------------------------------------------
    // Binding and Binder logic
    // ---------------------------------------------
    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "AsgClientService onBind -> returning binder");
        return binder;
    }

    // ---------------------------------------------
    // Example public method to use AugmentosService
    // ---------------------------------------------
    public void doSomethingWithAugmentos() {
        if (isAugmentosBound && augmentosService != null) {
            // For example, call some method on AugmentosService
            // augmentosService.sendStatusToBackend();
            Log.d(TAG, "Called a method on the bound AugmentosService!");
        } else {
            Log.w(TAG, "AugmentosService is not bound yet.");
        }
    }

    /**
     * If needed, you can check whether we're bound to AugmentosService,
     * or retrieve the instance (e.g. for Activity usage).
     */
    public AugmentosService getAugmentosService() {
        return augmentosService;
    }

    public boolean isAugmentosServiceBound() {
        return isAugmentosBound;
    }

    /**
     * Method for activities to check if we're connected to WiFi
     */
    public boolean isConnectedToWifi() {
        return networkManager != null && networkManager.isConnectedToWifi();
    }

    /**
     * Method for activities to check if a Bluetooth device is connected
     */
    public boolean isBluetoothConnected() {
        return bluetoothManager != null && bluetoothManager.isConnected();
    }

    /**
     * Method for activities to start Bluetooth advertising
     */
    public void startBluetoothAdvertising() {
        if (bluetoothManager != null) {
            bluetoothManager.startAdvertising();
        }
    }

    /**
     * Method for activities to stop Bluetooth advertising
     */
    public void stopBluetoothAdvertising() {
        if (bluetoothManager != null) {
            bluetoothManager.stopAdvertising();
        }
    }

    /**
     * Method for activities to manually disconnect from a Bluetooth device
     */
    public void disconnectBluetooth() {
        if (bluetoothManager != null) {
            bluetoothManager.disconnect();
        }
    }

    /**
     * Method for activities to send data over Bluetooth
     * @return true if data was sent successfully, false otherwise
     */
    public boolean sendBluetoothData(byte[] data) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            return bluetoothManager.sendData(data);
        }
        return false;
    }
    
    /**
     * Get the current battery level of the connected glasses
     * @return battery level as percentage (0-100), or -1 if unknown
     */
    public int getGlassesBatteryLevel() {
        return glassesBatteryLevel;
    }
    
    /**
     * Check if the connected glasses are currently charging
     * @return true if charging, false if not charging or unknown
     */
    public boolean isGlassesCharging() {
        return glassesCharging;
    }
    
    /**
     * Get the current battery status as a formatted string
     * @return formatted battery status string
     */
    public String getGlassesBatteryStatusString() {
        if (glassesBatteryLevel == -1) {
            return "Unknown";
        }
        return glassesBatteryLevel + "% " + (glassesCharging ? "(charging)" : "(not charging)");
    }
    
    /**
     * Broadcast battery status to OTA updater only if the status has changed
     * @param level Battery level (0-100)
     * @param charging Whether the glasses are charging
     * @param timestamp Timestamp of the battery reading
     */
    private void broadcastBatteryStatusToOtaUpdater(int level, boolean charging, long timestamp) {
        // Check if battery status has changed from last broadcast
        if (level == lastBroadcastedBatteryLevel && charging == lastBroadcastedCharging) {
            Log.d(TAG, "🔋 Battery status unchanged - skipping broadcast: " + level + "% " + (charging ? "(charging)" : "(not charging)"));
            return;
        }
        
        try {
            Intent batteryIntent = new Intent(AsgConstants.ACTION_GLASSES_BATTERY_STATUS);
            batteryIntent.setPackage("com.augmentos.otaupdater");
            batteryIntent.putExtra("battery_level", level);
            batteryIntent.putExtra("charging", charging);
            batteryIntent.putExtra("timestamp", timestamp);
            
            sendBroadcast(batteryIntent);
            Log.d(TAG, "📡 Broadcasted battery status to OTA updater: " + level + "% " + (charging ? "(charging)" : "(not charging)"));
            
            // Update last broadcasted values
            lastBroadcastedBatteryLevel = level;
            lastBroadcastedCharging = charging;
            
        } catch (Exception e) {
            Log.e(TAG, "Error broadcasting battery status to OTA updater", e);
        }
    }

    /**
     * Send download progress to connected phone via BLE
     */
    private void sendDownloadProgressOverBle(String status, int progress, long bytesDownloaded, long totalBytes, String errorMessage, long timestamp) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject downloadProgress = new JSONObject();
                downloadProgress.put("type", "ota_download_progress");
                downloadProgress.put("status", status);
                downloadProgress.put("progress", progress);
                downloadProgress.put("bytes_downloaded", bytesDownloaded);
                downloadProgress.put("total_bytes", totalBytes);
                if (errorMessage != null) {
                    downloadProgress.put("error_message", errorMessage);
                }
                downloadProgress.put("timestamp", timestamp);
                
                // Convert to string and send via BLE
                String jsonString = downloadProgress.toString();
                Log.d(TAG, "📥 Sending download progress via BLE: " + status + " - " + progress + "%");
                bluetoothManager.sendData(jsonString.getBytes());
                
            } catch (JSONException e) {
                Log.e(TAG, "Error creating download progress JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send download progress - not connected to BLE device");
        }
    }

    /**
     * Send installation progress to connected phone via BLE
     */
    private void sendInstallationProgressOverBle(String status, String apkPath, String errorMessage, long timestamp) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject installationProgress = new JSONObject();
                installationProgress.put("type", "ota_installation_progress");
                installationProgress.put("status", status);
                installationProgress.put("apk_path", apkPath);
                if (errorMessage != null) {
                    installationProgress.put("error_message", errorMessage);
                }
                installationProgress.put("timestamp", timestamp);
                
                // Convert to string and send via BLE
                String jsonString = installationProgress.toString();
                Log.d(TAG, "🔧 Sending installation progress via BLE: " + status + " - " + apkPath);
                bluetoothManager.sendData(jsonString.getBytes());
                
            } catch (JSONException e) {
                Log.e(TAG, "Error creating installation progress JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send installation progress - not connected to BLE device");
        }
    }

    /**
     * Testing method that manually starts the WiFi setup process
     * This can be called from an activity for testing purposes
     */
    public void testWifiSetup() {
        if (networkManager != null) {
            // Force hotspot to start with default config
            networkManager.startHotspot(null, null);
        }
    }

    /**
     * Try to connect to a specific WiFi network
     * This can be called from an activity for testing purposes
     */
    public void testConnectToWifi(String ssid, String password) {
        if (networkManager != null) {
            networkManager.connectToWifi(ssid, password);
        }
    }

    // ---------------------------------------------
    // NetworkStateListener Interface Methods
    // ---------------------------------------------

    /**
     * Handle WiFi state changes with debouncing
     */
    @Override
    public void onWifiStateChanged(boolean isConnected) {
        Log.d(TAG, "🔄 WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED") + " (debouncing...)");

        // Update pending state
        pendingWifiState = isConnected;

        // Cancel any existing timeout
        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
            Log.d(TAG, "Cancelled existing WiFi status send timeout");
        }

        // Schedule new timeout
        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            wifiDebounceHandler.postDelayed(wifiDebounceRunnable, WIFI_STATE_DEBOUNCE_MS);
            Log.d(TAG, "⏰ Scheduled WiFi status send in " + WIFI_STATE_DEBOUNCE_MS + "ms");
        }

        // Handle immediate actions that don't need debouncing
        if (isConnected) {
            // Handle connection
            onWifiConnected();

            // Process photo upload queue when connection is restored
            if (mMediaQueueManager != null && !mMediaQueueManager.isQueueEmpty()) {
                Log.d(TAG, "WiFi connected - processing media upload queue");
                mMediaQueueManager.processQueue();
            }
        } else {
            // Handle disconnection
            Log.d(TAG, "WiFi disconnected");
        }
    }

    /**
     * Handle hotspot state changes
     */
    @Override
    public void onHotspotStateChanged(boolean isEnabled) {
        Log.d(TAG, "Hotspot state changed: " + (isEnabled ? "ENABLED" : "DISABLED"));
        // We don't need to report hotspot state via BLE
    }

    /**
     * Handle WiFi credentials received through setup
     */
    @Override
    public void onWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.d(TAG, "WiFi credentials received for network: " + ssid);
        // After receiving credentials, we'll likely connect to WiFi,
        // and onWifiStateChanged will be called, which will send status via BLE
    }

    /**
     * Send current WiFi status to AugmentOS Core via Bluetooth
     */
    private void sendWifiStatusOverBle(boolean isConnected) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject wifiStatus = new JSONObject();
                wifiStatus.put("type", "wifi_status");
                wifiStatus.put("connected", isConnected);

                // Include SSID if connected
                if (isConnected && networkManager != null) {
                    String ssid = networkManager.getCurrentWifiSsid();
                    if (ssid != null && !ssid.isEmpty()) {
                        wifiStatus.put("ssid", ssid);
                    } else {
                        wifiStatus.put("ssid", "unknown");
                    }
                    
                    // Add local IP address
                    String localIp = networkManager.getLocalIpAddress();
                    if (localIp != null && !localIp.isEmpty()) {
                        wifiStatus.put("local_ip", localIp);
                    } else {
                        wifiStatus.put("local_ip", "");
                    }
                } else {
                    wifiStatus.put("ssid", "");
                    wifiStatus.put("local_ip", "");
                }

                // Convert to string
                String jsonString = wifiStatus.toString();
                Log.d(TAG, "Formatted WiFi status message: " + jsonString);

                // Convert JSON to bytes and send
                bluetoothManager.sendData(jsonString.getBytes());

                Log.d(TAG, "Sent WiFi status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi status JSON", e);
            }
        }
    }

    private void sendBatteryStatusOverBle() {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("type", "battery_status");
                obj.put("charging", batteryVoltage > 3900);
                obj.put("percent", batteryPercentage);
                String jsonString = obj.toString();
                Log.d(TAG, "Formatted battery status message: " + jsonString);
                bluetoothManager.sendData(jsonString.getBytes());
                Log.d(TAG, "Sent battery status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating battery status JSON", e);
            }
        }
    }

    /**
     * Send WiFi scan results to AugmentOS Core via Bluetooth
     */
    private void sendWifiScanResultsOverBle(List<String> networks) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject scanResults = new JSONObject();
                scanResults.put("type", "wifi_scan_result");

                // Add the networks as a JSON array
                JSONArray networksArray = new JSONArray();
                for (String network : networks) {
                    networksArray.put(network);
                }
                scanResults.put("networks", networksArray);

                // Convert to string
                String jsonString = scanResults.toString();
                Log.d(TAG, "Formatted WiFi scan results: " + jsonString);

                // Convert JSON to bytes and send
                bluetoothManager.sendData(jsonString.getBytes());

                Log.d(TAG, "Sent WiFi scan results via BLE. Found " + networks.size() + " networks.");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi scan results JSON", e);
            }
        }
    }

    // ---------------------------------------------
    // BluetoothStateListener Interface Methods
    // ---------------------------------------------

    /**
     * Called when Bluetooth connection state changes
     */
    @Override
    public void onConnectionStateChanged(boolean connected) {
        Log.d(TAG, "Bluetooth connection state changed: " + (connected ? "CONNECTED" : "DISCONNECTED"));

        if (connected) {
            Log.d(TAG, "Bluetooth device connected - ready for data exchange");

            // When Bluetooth connects, send the current WiFi status
            // Adding a 3 second delay before sending WiFi status
            if (networkManager != null) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    boolean wifiConnected = networkManager.isConnectedToWifi();
//                    Log.d(TAG, "WiFi status after 3s delay: " + (wifiConnected ? "CONNECTED" : "DISCONNECTED"));
                    sendWifiStatusOverBle(wifiConnected);
//                    Log.d(TAG, "Sent WiFi status after 3s delay: " + (wifiConnected ? "CONNECTED" : "DISCONNECTED"));
                }, 3000); // 3 second delay
            }

            // For non-K900 devices, start the microphone to stream audio
            if (false && !isK900Device && glassesMicrophoneManager != null) {
                Log.d(TAG, "Starting microphone streaming for non-K900 device");
                glassesMicrophoneManager.startRecording();
            }

            sendVersionInfo();

            // Start mock OTA progress simulation after 5 seconds
            // new Handler(Looper.getMainLooper()).postDelayed(() -> {
            //     Log.d(TAG, "🚀 Starting mock OTA progress simulation");
            //     startMockOtaProgressSimulation();
            // }, 2000); // 5 second delay

            // Notify any components that care about bluetooth status
            // For example, you could send a broadcast, update UI, etc.
        } else {
            Log.d(TAG, "Bluetooth device disconnected");

            // For non-K900 devices, stop the microphone when disconnected
            if (!isK900Device && glassesMicrophoneManager != null) {
                Log.d(TAG, "Stopping microphone streaming for non-K900 device");
                glassesMicrophoneManager.stopRecording();
            }

            // You might want to attempt reconnection here, or notify components
        }
    }

    /**
     * Called when data is received over Bluetooth (from either K900 or standard implementation)
     */
    @Override
    public void onDataReceived(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Received empty data packet from Bluetooth");
            return;
        }

        Log.d(TAG, "Received " + data.length + " bytes from Bluetooth");

        // Process the data

        // First, log the data for debugging (only in development)
        StringBuilder hexData = new StringBuilder();
        for (byte b : data) {
            hexData.append(String.format("%02X ", b));
        }
        Log.d(TAG, "Bluetooth data: " + hexData.toString());

        // Check if this is a message with ##...## format (K900 BES2700 protocol)
        if (data.length > 4 && data[0] == 0x23 && data[1] == 0x23) {
            Log.d(TAG, "🔍 Detected ##...## protocol formatted message");

            // Look for end marker ($$)
            int endMarkerPos = -1;
            for (int i = 4; i < data.length - 1; i++) {
                if (data[i] == 0x24 && data[i+1] == 0x24) {
                    endMarkerPos = i;
                    break;
                }
            }

            if (endMarkerPos > 0) {
                Log.d(TAG, "🔍 Found end marker at position: " + endMarkerPos);

                // Extract the command code and log it
                byte commandType = data[2];
                Log.d(TAG, "🔍 Command type byte: 0x" + String.format("%02X", commandType));

                // Extract length (assuming little-endian 2 bytes)
                int length = (data[3] & 0xFF);
                if (data.length > 4) {
                    length |= ((data[4] & 0xFF) << 8);
                }
                Log.d(TAG, "🔍 Payload length from header: " + length);

                // Extract payload (assuming it starts at position 5)
                int payloadStart = 5;
                int payloadLength = endMarkerPos - payloadStart;
                Log.d(TAG, "🔍 Actual payload length: " + payloadLength);

                // Only process if payload length looks correct
                if (payloadLength > 0) {
                    // Check if payload is JSON (starts with '{')
                    if (data[payloadStart] == '{') {
                        try {
                            // Extract the JSON string
                            String jsonStr = new String(data, payloadStart, payloadLength, "UTF-8");
                            Log.d(TAG, "✅ Extracted JSON from ##...$$: " + jsonStr);

                            // Parse the JSON
                            JSONObject jsonObject = new JSONObject(jsonStr);

                            // Extract the "C" field value, which we'll pass to the JSON processor
                            // This simplifies our approach - we just use the C field regardless
                            // of whether it's part of a command or our direct data
                            processJsonCommand(jsonObject);
                            return;
                        } catch (Exception e) {
                            Log.e(TAG, "❌ Error parsing JSON from ##...$$: " + e.getMessage());
                        }
                    } else {
                        Log.d(TAG, "⚠️ Payload doesn't start with '{': 0x" + String.format("%02X", data[payloadStart]));
                    }
                } else {
                    Log.e(TAG, "❌ Invalid payload length: " + payloadLength);
                }
            } else {
                Log.e(TAG, "❌ End marker not found in ##...## message");
            }

            // If extraction failed, fall through to standard processing
            Log.d(TAG, "⚠️ Failed to extract JSON from ##...## message, trying standard processing");
        }

        // Check if this is a JSON message (starts with '{')
        if (data.length > 0 && data[0] == '{') {
            try {
                String jsonStr = new String(data, "UTF-8");
                Log.d(TAG, "Received JSON data: " + jsonStr);
                JSONObject jsonObject = new JSONObject(jsonStr);
                processJsonCommand(jsonObject);
                return;
            } catch (Exception e) {
                Log.e(TAG, "Error parsing JSON data", e);
                // Fall through to binary command processing
            }
        }
    }

    /**
     * Process JSON commands received via Bluetooth
     */
    private void processJsonCommand(JSONObject json) {
        try {
            // If this is our direct data format (only C field), extract the JSON from it
            JSONObject dataToProcess = json;
            if (json.has("C")) {
                String dataPayload = json.optString("C", "");
                Log.d(TAG, "📦 Detected direct data format! Payload: " + dataPayload);

                // Try to parse the payload as JSON
                try {
                    dataToProcess = new JSONObject(dataPayload);
                    Log.d(TAG, "📦 Successfully parsed payload as JSON");
                } catch (JSONException e) {
                    Log.d(TAG, "📦 Payload is not valid JSON, treating as ODM format");
                    // If not valid JSON, it's ODM format - pass the full JSON object
                    parseK900Command(json);
                    return;
                }
            }

            // Check for message ID and send ACK if present
            long messageId = dataToProcess.optLong("mId", -1);
            if (messageId != -1) {
                // Send ACK response
                sendAckResponse(messageId);
                Log.d(TAG, "📤 Sent ACK for message ID: " + messageId);
            } else {
                Log.d(TAG, "📦 No message ID found in payload");
            }

            // Process the data (either original or extracted from C field)
            String type = dataToProcess.optString("type", "");
            Log.d(TAG, "Processing JSON message type: " + type);

            switch (type) {
                case "phone_ready":
                    // Phone is connected and ready - respond that we're also ready
                    Log.d(TAG, "📱 Received phone_ready message - sending glasses_ready response");

                    try {
                        // Create a glasses_ready response
                        JSONObject response = new JSONObject();
                        response.put("type", "glasses_ready");
                        response.put("timestamp", System.currentTimeMillis());

                        // Convert to string
                        String jsonResponse = response.toString();
                        Log.d(TAG, "Formatted glasses_ready response: " + jsonResponse);

                        // Send the response back
                        if (bluetoothManager != null && bluetoothManager.isConnected()) {
                            bluetoothManager.sendData(jsonResponse.getBytes());
                            Log.d(TAG, "✅ Sent glasses_ready response to phone");

                            // Automatically send WiFi status after glasses_ready
                            Log.d(TAG, "📶 Auto-sending WiFi status after glasses_ready");
                            if (networkManager != null) {
                                // Add a small delay to ensure glasses_ready is processed first
                                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                    boolean wifiConnected = networkManager.isConnectedToWifi();
                                    sendWifiStatusOverBle(wifiConnected);
                                    Log.d(TAG, "✅ Auto-sent WiFi status: " + (wifiConnected ? "CONNECTED" : "DISCONNECTED"));
                                }, 500); // 500ms delay to ensure glasses_ready is processed
                            }
                        }
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating glasses_ready response", e);
                    }
                    break;

                case "auth_token":
                    // Handle authentication token
                    String coreToken = dataToProcess.optString("coreToken", "");
                    if (!coreToken.isEmpty()) {
                        Log.d(TAG, "Received coreToken from AugmentOS Core");
                        saveCoreToken(coreToken);

                        // Send acknowledgment
                        sendTokenStatusResponse(true);
                    } else {
                        Log.e(TAG, "Received empty coreToken");
                        sendTokenStatusResponse(false);
                    }
                    break;

                case "take_photo":
                    String requestId = dataToProcess.optString("requestId", "");
                    String webhookUrl = dataToProcess.optString("webhookUrl", "");

                    if (requestId.isEmpty()) {
                        Log.e(TAG, "Cannot take photo - missing requestId");
                        return;
                    }

                    // Generate a temporary file path for the photo
                    String timeStamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(new java.util.Date());
                    String photoFilePath = getExternalFilesDir(null) + java.io.File.separator + "IMG_" + timeStamp + ".jpg";

                    Log.d(TAG, "Taking photo with requestId: " + requestId);
                    Log.d(TAG, "Photo will be saved to: " + photoFilePath);

                    // Take the photo using MediaCaptureService with webhook URL
                    mMediaCaptureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl);
                    break;

                case "start_video_recording":
                    String videoRequestId = dataToProcess.optString("requestId", "");

                    if (videoRequestId.isEmpty()) {
                        Log.e(TAG, "Cannot start video recording - missing requestId");
                        sendVideoRecordingStatusResponse(false, "missing_request_id", null);
                        return;
                    }

                    MediaCaptureService captureService = getMediaCaptureService();
                    if (captureService == null) {
                        Log.e(TAG, "Media capture service is not initialized");
                        sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                        return;
                    }

                    // Check if already recording
                    if (captureService.isRecordingVideo()) {
                        Log.d(TAG, "Already recording video, ignoring start command");
                        sendVideoRecordingStatusResponse(true, "already_recording", null);
                        return;
                    }

                    Log.d(TAG, "Starting video recording with requestId: " + videoRequestId);

                    // Start video recording
                    captureService.handleVideoButtonPress();

                    // Send success response
                    sendVideoRecordingStatusResponse(true, "recording_started", null);
                    break;

                case "stop_video_recording":
                    captureService = getMediaCaptureService();
                    if (captureService == null) {
                        Log.e(TAG, "Media capture service is not initialized");
                        sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                        return;
                    }

                    // Check if actually recording
                    if (!captureService.isRecordingVideo()) {
                        Log.d(TAG, "Not currently recording, ignoring stop command");
                        sendVideoRecordingStatusResponse(false, "not_recording", null);
                        return;
                    }

                    Log.d(TAG, "Stopping video recording");

                    // Stop the recording
                    captureService.stopVideoRecording();

                    // Send success response
                    sendVideoRecordingStatusResponse(true, "recording_stopped", null);
                    break;

                case "get_video_recording_status":
                    captureService = getMediaCaptureService();
                    if (captureService == null) {
                        Log.e(TAG, "Media capture service is not initialized");
                        sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                        return;
                    }

                    boolean isRecording = captureService.isRecordingVideo();
                    Log.d(TAG, "Video recording status requested: " + (isRecording ? "RECORDING" : "NOT RECORDING"));

                    try {
                        JSONObject status = new JSONObject();
                        status.put("recording", isRecording);

                        // If recording, include duration information
                        if (isRecording) {
                            // Get duration in milliseconds from MediaCaptureService
                            long durationMs = captureService.getRecordingDurationMs();
                            status.put("duration_ms", durationMs);

                            // Also include formatted duration for convenience
                            String formattedDuration = formatDuration(durationMs);
                            status.put("duration_formatted", formattedDuration);
                        }

                        // Send the status response
                        sendVideoRecordingStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating video recording status response", e);
                        sendVideoRecordingStatusResponse(false, "json_error", e.getMessage());
                    }
                    break;

                case "start_rtmp_stream":
                    Log.d(TAG, "RTMP streaming requested via BLE command");
                    String rtmpUrl = dataToProcess.optString("rtmpUrl", "");

                    if (rtmpUrl.isEmpty()) {
                        Log.e(TAG, "Cannot start RTMP stream - missing rtmpUrl");
                        sendRtmpStatusResponse(false, "missing_rtmp_url", null);
                        break;
                    }

                    // Check WiFi connection first
                    if (networkManager == null || !networkManager.isConnectedToWifi()) {
                        Log.e(TAG, "Cannot start RTMP stream - no WiFi connection");
                        sendRtmpStatusResponse(false, "no_wifi_connection", null);
                        break;
                    }

                    // Check if already streaming
                    if (com.augmentos.asg_client.streaming.RtmpStreamingService.isStreaming()) {
                        Log.d(TAG, "RTMP stream already active - stopping current stream first");
                        com.augmentos.asg_client.streaming.RtmpStreamingService.stopStreaming(this);
                        // Short delay to ensure resources are released
                        try {
                            Thread.sleep(500);
                        } catch (InterruptedException e) {
                        }
                    }

                    // Parse and log video settings if provided
                    if (dataToProcess.has("video")) {
                        try {
                            JSONObject videoConfig = dataToProcess.getJSONObject("video");
                            int bitrate = videoConfig.optInt("bitrate", 2000000);
                            int width = videoConfig.optInt("width", 640);
                            int height = videoConfig.optInt("height", 480);
                            int fps = videoConfig.optInt("fps", 30);

                            Log.d(TAG, "RTMP video config - bitrate: " + bitrate +
                                    ", resolution: " + width + "x" + height +
                                    ", fps: " + fps);

                            // TODO: In the future, these could be passed to configure the stream quality
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing video config: " + e.getMessage());
                        }
                    }

                    // Parse and log audio settings if provided
                    if (dataToProcess.has("audio")) {
                        try {
                            JSONObject audioConfig = dataToProcess.getJSONObject("audio");
                            int bitrate = audioConfig.optInt("bitrate", 128000);
                            int sampleRate = audioConfig.optInt("sampleRate", 44100);
                            boolean stereo = audioConfig.optBoolean("stereo", true);

                            Log.d(TAG, "RTMP audio config - bitrate: " + bitrate +
                                    ", sampleRate: " + sampleRate +
                                    ", stereo: " + stereo);
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing audio config: " + e.getMessage());
                        }
                    }

                    // Start streaming with the specified URL (callback already registered)
                    try {
                        // Extract streamId if provided
                        String streamId = dataToProcess.optString("streamId", "");

                        // Pass streamId to the service
                        com.augmentos.asg_client.streaming.RtmpStreamingService.startStreaming(this, rtmpUrl, streamId);

                        Log.d(TAG, "RTMP streaming started with URL: " + rtmpUrl +
                                (streamId.isEmpty() ? "" : " and streamId: " + streamId));
                    } catch (Exception e) {
                        Log.e(TAG, "Error starting RTMP streaming", e);
                        sendRtmpStatusResponse(false, "exception", e.getMessage());
                    }
                    break;

                case "stop_rtmp_stream":
                    Log.d(TAG, "RTMP streaming stop requested via BLE command");

                    if (com.augmentos.asg_client.streaming.RtmpStreamingService.isStreaming()) {
                        com.augmentos.asg_client.streaming.RtmpStreamingService.stopStreaming(this);
                        sendRtmpStatusResponse(true, "stopping", null);
                    } else {
                        sendRtmpStatusResponse(false, "not_streaming", null);
                    }
                    break;

                case "get_rtmp_status":
                    Log.d(TAG, "RTMP status requested via BLE command");

                    boolean isStreaming = com.augmentos.asg_client.streaming.RtmpStreamingService.isStreaming();
                    boolean isReconnecting = com.augmentos.asg_client.streaming.RtmpStreamingService.isReconnecting();

                    try {
                        JSONObject status = new JSONObject();
                        status.put("streaming", isStreaming);

                        if (isReconnecting) {
                            status.put("reconnecting", true);
                            status.put("attempt", com.augmentos.asg_client.streaming.RtmpStreamingService.getReconnectAttempt());
                        }

                        // Send the status response
                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP status response", e);
                        sendRtmpStatusResponse(false, "json_error", e.getMessage());
                    }
                    break;

                case "keep_rtmp_stream_alive":
                    Log.d(TAG, "Received RTMP keep-alive message");

                    String streamId = dataToProcess.optString("streamId", "");
                    String ackId = dataToProcess.optString("ackId", "");

                    if (!streamId.isEmpty() && !ackId.isEmpty()) {
                        // Try to reset the timeout for this stream
                        boolean streamIdValid = com.augmentos.asg_client.streaming.RtmpStreamingService.resetStreamTimeout(streamId);

                        if (streamIdValid) {
                            // Send ACK response back to cloud
                            sendKeepAliveAck(streamId, ackId);
                            Log.d(TAG, "Processed keep-alive for stream: " + streamId + ", ackId: " + ackId);
                        } else {
                            // Unknown stream ID - kill current stream and request restart
                            Log.e(TAG, "Received keep-alive for unknown stream ID: " + streamId + " - terminating current stream");
                            com.augmentos.asg_client.streaming.RtmpStreamingService.stopStreaming(this);

                            // Send error status to cloud to request proper restart
                            try {
                                JSONObject errorStatus = new JSONObject();
                                errorStatus.put("type", "rtmp_stream_status");
                                errorStatus.put("status", "error");
                                errorStatus.put("error", "Unknown stream ID - please send start_rtmp_stream command");
                                errorStatus.put("receivedStreamId", streamId);
                                String statusString = errorStatus.toString();
                                sendBluetoothData(statusString.getBytes(StandardCharsets.UTF_8));
                                Log.d(TAG, "Sent stream error status for unknown stream ID");
                            } catch (JSONException e) {
                                Log.e(TAG, "Error creating stream error status", e);
                            }
                        }
                    } else {
                        Log.w(TAG, "Keep-alive message missing streamId or ackId");
                    }
                    break;

                case "set_wifi_credentials":
                    Log.d(TAG, "Received set_wifi_credentials command");
                    // Handle WiFi configuration command if needed
                    String ssid = dataToProcess.optString("ssid", "");
                    String password = dataToProcess.optString("password", "");
                    if (!ssid.isEmpty()) {
                        Log.d(TAG, "Connecting to WiFi network: " + ssid);
                        if (networkManager != null) {
                            networkManager.connectToWifi(ssid, password);
                        }
                    }
                    break;

                case "request_wifi_status":
                    Log.d(TAG, "Got a request for wifi status");
                    if (networkManager != null) {
                        Log.d(TAG, "requesting wifi status");
                        boolean wifiConnected = networkManager.isConnectedToWifi();
                        sendWifiStatusOverBle(wifiConnected);
                    }
                    break;

                case "request_wifi_scan":
                    Log.d(TAG, "Got a request to scan for WiFi networks");
                    if (networkManager != null) {
                        Log.d(TAG, "Starting WiFi scan");
                        // Perform WiFi scan in a background thread
                        new Thread(() -> {
                            try {
                                List<String> networks = networkManager.scanWifiNetworks();
                                sendWifiScanResultsOverBle(networks);
                            } catch (Exception e) {
                                Log.e(TAG, "Error scanning for WiFi networks", e);
                                // Send empty list in case of error
                                sendWifiScanResultsOverBle(new ArrayList<>());
                            }
                        }).start();
                    } else {
                        Log.e(TAG, "Cannot scan for WiFi networks - networkManager is null");
                        sendWifiScanResultsOverBle(new ArrayList<>());
                    }
                    break;

                case "ping":
                    JSONObject pingResponse = new JSONObject();
                    pingResponse.put("type", "pong");
                    if(bluetoothManager != null && bluetoothManager.isConnected()) {
                        bluetoothManager.sendData(pingResponse.toString().getBytes());
                    }
                    break;

                case "request_battery_state":
                    break;
                    
                case "battery_status":
                    // Process battery status from glasses
                    int level = dataToProcess.optInt("level", -1);
                    boolean charging = dataToProcess.optBoolean("charging", false);
                    long timestamp = dataToProcess.optLong("timestamp", System.currentTimeMillis());
                    
                    // Store battery status locally
                    glassesBatteryLevel = level;
                    glassesCharging = charging;
                    
                    Log.d(TAG, "🔋 Received battery status from glasses: " + level + "% " + (charging ? "(charging)" : "(not charging)") + " at " + timestamp);
                    
                    // Broadcast battery status to OTA updater immediately
                    broadcastBatteryStatusToOtaUpdater(level, charging, timestamp);
                    break;

                case "set_mic_state":
                    break;

                case "set_mic_vad_state":
                    break;

                case "set_hotspot_state":
                    boolean hotspotEnabled = dataToProcess.optBoolean("enabled", false);

                    if(hotspotEnabled){
                        String hotspotSsid = dataToProcess.optString("ssid", "");
                        String hotspotPassword = dataToProcess.optString("password", "");
                        networkManager.startHotspot(hotspotSsid, hotspotPassword);
                    } else {
                        networkManager.stopHotspot();
                    }
                    break;
                case "request_version":
                case "cs_syvr":
                    Log.d(TAG, "📊 Received version request - sending version info");
                    sendVersionInfo();
                    break;
                case "":
                    Log.d(TAG, "Received data with no type field: " + dataToProcess);
                    break;
                case "ota_update_response":
                    boolean accepted = dataToProcess.optBoolean("accepted", false);
                    if (accepted) {
                        Log.d(TAG, "Received ota_update_response: accepted, proceeding with OTA installation");
                        // TODO: Trigger OTA installation here
                    } else {
                        Log.d(TAG, "Received ota_update_response: rejected by user");
                    }
                    break;

                case "set_photo_mode": {
                    String mode = dataToProcess.optString("mode", "save_locally");
                    switch (mode) {
                        case "save_locally":
                            currentPhotoMode = PhotoCaptureMode.SAVE_LOCALLY;
                            break;
                        case "cloud":
                            currentPhotoMode = PhotoCaptureMode.CLOUD;
                            break;
                    }
                    // Optionally send an ACK back to the phone
                    JSONObject ack = new JSONObject();
                    ack.put("type", "set_photo_mode_ack");
                    ack.put("mode", mode);
                    if (bluetoothManager != null && bluetoothManager.isConnected()) {
                        bluetoothManager.sendData(ack.toString().getBytes());
                    }
                    break;
                }

                default:
                    Log.w(TAG, "Unknown message type: " + type);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing JSON command", e);
        }
    }

    // These are plain text commands from the K900's MCU, usually from button presses on the device
    public void parseK900Command(String command){
        switch (command) {
            case "cs_pho":
                handleButtonPress(false);
                break;

            case "hm_htsp":
            case "mh_htsp":
                Log.d(TAG, "📦 Payload is hm_htsp or mh_htsp");
                networkManager.startHotspot("Mentra Live", "MentraLive");
                break;

            case "cs_vdo":
                handleButtonPress(true);
            case "hm_batv":
                //looks something like... {"C":"hm_batv","B":{"vt":4351,"pt":94}}
                Log.d(TAG, "got a hm_batv");
            default:
                Log.d(TAG, "📦 Unknown payload: " + command);
                break;
        }
    }

    // Overloaded version for ODM format JSON commands
    public void parseK900Command(JSONObject json) {
        try {
            String command = json.optString("C", "");
            JSONObject bData = json.optJSONObject("B");
            
            switch (command) {
                case "cs_pho":
                    handleButtonPress(false);
                    break;

                case "hm_htsp":
                case "mh_htsp":
                    Log.d(TAG, "📦 Payload is hm_htsp or mh_htsp");
                    networkManager.startHotspot("Mentra Live", "MentraLive");
                    break;

                case "cs_vdo":
                    handleButtonPress(true);
                    break;

                case "hm_batv":
                    Log.d(TAG, "got a hm_batv with data");
                    if (bData != null) {
                        int newBatteryPercentage = bData.optInt("pt", -1);
                        int newBatteryVoltage = bData.optInt("vt", -1);
                        
                        if (newBatteryPercentage != -1) {
                            this.batteryPercentage = newBatteryPercentage;
                            Log.d(TAG, "🔋 Battery percentage: " + batteryPercentage + "%");
                        }
                        if (newBatteryVoltage != -1) {
                            this.batteryVoltage = newBatteryVoltage;
                            Log.d(TAG, "🔋 Battery voltage: " + batteryVoltage + "mV");
                        }
                        
                        // Send battery status over BLE if we have valid data
                        if (batteryPercentage != -1 || batteryVoltage != -1) {
                            sendBatteryStatusOverBle();
                        }
                    } else {
                        Log.w(TAG, "hm_batv received but no B field data");
                    }
                    break;

                default:
                    Log.d(TAG, "📦 Unknown ODM payload: " + command);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing ODM command", e);
        }
    }

    private void handleButtonPress(boolean isLongPress) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject buttonObject = new JSONObject();
                buttonObject.put("type", "button_press");
                buttonObject.put("buttonId", "camera"); // Specify which button was pressed
                buttonObject.put("pressType", isLongPress ? "long" : "short"); // Use pressType field instead of overwriting type
                buttonObject.put("timestamp", System.currentTimeMillis());

                // Convert to string
                String jsonString = buttonObject.toString();
                Log.d(TAG, "Formatted button press response: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes());
            } catch (JSONException e) {
                Log.e(TAG, "Error creating button press response", e);
            }
        }
    }

    /**
     * Save the coreToken to SharedPreferences
     * This allows the ASG client to authenticate directly with the backend
     */
    private void saveCoreToken(String coreToken) {
        Log.d(TAG, "Saving coreToken to SharedPreferences");
        try {
            // Save to default SharedPreferences so it's accessible by all components
            SharedPreferences preferences = PreferenceManager.getDefaultSharedPreferences(getApplicationContext());
            SharedPreferences.Editor editor = preferences.edit();
            editor.putString("core_token", coreToken);
            editor.apply();

            Log.d(TAG, "CoreToken saved successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error saving coreToken", e);
        }
    }

    /**
     * Send a token status response back to AugmentOS Core
     */
    private void sendTokenStatusResponse(boolean success) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "token_status");
                response.put("success", success);
                response.put("timestamp", System.currentTimeMillis());

                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Formatted token status response: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes());

                Log.d(TAG, "Sent token status response: " + (success ? "SUCCESS" : "FAILED"));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating token status response", e);
            }
        }
    }

    private void sendVersionInfo() {
        Log.d(TAG, "📊 Sending version information");

        try {
            JSONObject versionInfo = new JSONObject();
            versionInfo.put("type", "version_info");
            versionInfo.put("timestamp", System.currentTimeMillis());
            String appVersion = "1.0.0";
            String buildNumber = "1";
            Log.d(TAG, "App version: " + appVersion + ", Build number: " + buildNumber);

            try {
                appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                buildNumber = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).versionCode);
            } catch (Exception e) {
                Log.e(TAG, "Error getting app version", e);
            }
            versionInfo.put("app_version", appVersion);
            versionInfo.put("build_number", buildNumber);
            versionInfo.put("device_model", android.os.Build.MODEL);
            versionInfo.put("android_version", android.os.Build.VERSION.RELEASE);

            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(versionInfo.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ Sent version info to phone");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating version info", e);
        }
    }

    /**
     * Take a photo and upload it to AugmentOS Cloud
     */
    /**
     * Start RTMP streaming for testing purposes
     */
    private void startRtmpStreaming() {
        try {
            Log.d(TAG, "Starting RTMP streaming service for testing");

            // Use the static convenience method to start streaming (callback already registered)
            com.augmentos.asg_client.streaming.RtmpStreamingService.startStreaming(
                    this,
                    "rtmp://10.0.0.22/s/streamKey"
            );

            Log.d(TAG, "RTMP streaming initialization complete");
        } catch (Exception e) {
            Log.e(TAG, "Error starting RTMP streaming service", e);
        }
    }

    /**
     * Stream status callback implementation
     */
    private final RtmpStreamingService.StreamingStatusCallback streamingStatusCallback =
            new RtmpStreamingService.StreamingStatusCallback() {
                @Override
                public void onStreamStarting(String rtmpUrl) {
                    Log.d(TAG, "RTMP Stream starting to: " + rtmpUrl);

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "initializing");
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP initializing status", e);
                    }
                }

                @Override
                public void onStreamStarted(String rtmpUrl) {
                    Log.d(TAG, "RTMP Stream successfully started to: " + rtmpUrl);

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "streaming");
                        status.put("rtmpUrl", rtmpUrl);
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }

                        // Add some basic stats if available
                        JSONObject stats = new JSONObject();
                        stats.put("bitrate", 1500000);  // Default values as placeholders
                        stats.put("fps", 30);
                        stats.put("droppedFrames", 0);
                        stats.put("duration", 0);
                        status.put("stats", stats);

                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP streaming status", e);
                    }
                }

                @Override
                public void onStreamStopped() {
                    Log.d(TAG, "RTMP Stream stopped");

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "stopped");
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP stopped status", e);
                    }
                }

                @Override
                public void onReconnecting(int attempt, int maxAttempts, String reason) {
                    Log.d(TAG, "RTMP Stream reconnecting: attempt " + attempt + " of " + maxAttempts + " (reason: " + reason + ")");

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "reconnecting");
                        status.put("attempt", attempt);
                        status.put("maxAttempts", maxAttempts);
                        status.put("reason", reason);
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP reconnecting status", e);
                    }
                }

                @Override
                public void onReconnected(String rtmpUrl, int attempt) {
                    Log.d(TAG, "RTMP Stream reconnected to " + rtmpUrl + " after " + attempt + " attempts");

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "streaming");
                        status.put("rtmpUrl", rtmpUrl);
                        status.put("reconnected", true);
                        status.put("attempts", attempt);
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(true, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP reconnected status", e);
                    }
                }

                @Override
                public void onReconnectFailed(int maxAttempts) {
                    Log.d(TAG, "RTMP Stream failed to reconnect after " + maxAttempts + " attempts");

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "error");
                        status.put("errorDetails", "Failed to reconnect after " + maxAttempts + " attempts");
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(false, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP reconnect failed status", e);
                    }
                }

                @Override
                public void onStreamError(String error) {
                    Log.e(TAG, "RTMP Stream error: " + error);

                    // Send status update via BLE
                    try {
                        JSONObject status = new JSONObject();
                        status.put("type", "rtmp_stream_status");
                        status.put("status", "error");
                        status.put("errorDetails", error);
                        // Add streamId if available
                        String streamId = com.augmentos.asg_client.streaming.RtmpStreamingService.getCurrentStreamId();
                        if (streamId != null && !streamId.isEmpty()) {
                            status.put("streamId", streamId);
                        }
                        sendRtmpStatusResponse(false, status);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating RTMP error status", e);
                    }
                }
            };

    // Media capture listener (delegated to MediaCaptureService)
    private final MediaCaptureService.MediaCaptureListener mediaCaptureListener =
            new MediaCaptureService.MediaCaptureListener() {
                @Override
                public void onPhotoCapturing(String requestId) {
                    Log.d(TAG, "Photo capturing started: " + requestId);
                }

                @Override
                public void onPhotoCaptured(String requestId, String filePath) {
                    Log.d(TAG, "Photo captured: " + requestId + ", path: " + filePath);
                }

                @Override
                public void onPhotoUploading(String requestId) {
                    Log.d(TAG, "Photo uploading: " + requestId);
                }

                @Override
                public void onPhotoUploaded(String requestId, String url) {
                    Log.d(TAG, "Photo uploaded: " + requestId + ", URL: " + url);
                }

                @Override
                public void onVideoRecordingStarted(String requestId, String filePath) {
                    Log.d(TAG, "Video recording started: " + requestId + ", path: " + filePath);
                }

                @Override
                public void onVideoRecordingStopped(String requestId, String filePath) {
                    Log.d(TAG, "Video recording stopped: " + requestId + ", path: " + filePath);
                }

                @Override
                public void onVideoUploading(String requestId) {
                    Log.d(TAG, "Video uploading: " + requestId);
                }

                @Override
                public void onVideoUploaded(String requestId, String url) {
                    Log.d(TAG, "Video uploaded: " + requestId + ", URL: " + url);
                }

                @Override
                public void onMediaError(String requestId, String error, int mediaType) {
                    String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                    Log.e(TAG, mediaTypeName + " error: " + requestId + ", error: " + error);
                }
            };

    /**
     * Send a success response for a media request
     */
    private void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
        try {
            JSONObject response = new JSONObject();

            if (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO) {
                response.put("type", "photo_response");
                response.put("photoUrl", mediaUrl);
            } else {
                response.put("type", "video_response");
                response.put("videoUrl", mediaUrl);
            }

            response.put("requestId", requestId);
            response.put("success", true);

            // Convert to string
            String jsonString = response.toString();
            Log.d(TAG, "Formatted media success response: " + jsonString);

            // Send the response back
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(jsonString.getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating media success response", e);
        }
    }

    /**
     * Send an error response for a media request
     */
    private void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
        try {
            JSONObject response = new JSONObject();

            if (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO) {
                response.put("type", "photo_response");
            } else {
                response.put("type", "video_response");
            }

            response.put("requestId", requestId);
            response.put("success", false);
            response.put("error", errorMessage);

            // Convert to string
            String jsonString = response.toString();
            Log.d(TAG, "Formatted media error response: " + jsonString);

            // Send the response back
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                bluetoothManager.sendData(jsonString.getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating media error response", e);
        }
    }

    /**
     * Send an RTMP status response via BLE
     *
     * @param success Whether the command succeeded
     * @param status  Status message or error code
     * @param details Additional details or error message
     */
    private void sendRtmpStatusResponse(boolean success, String status, String details) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "rtmp_status");
                response.put("success", success);
                response.put("status", status);

                if (details != null) {
                    response.put("details", details);
                }

                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Sending RTMP status: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating RTMP status response", e);
            }
        }
    }

    /**
     * Send an RTMP status response with a custom status object
     *
     * @param success      Whether the command succeeded
     * @param statusObject Custom status object with details
     */
    private void sendRtmpStatusResponse(boolean success, JSONObject statusObject) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                // Don't wrap - send the status object directly since it's already in correct format
                String jsonString = statusObject.toString();
                Log.d(TAG, "Sending RTMP status: " + jsonString);
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                Log.e(TAG, "Error sending RTMP status response", e);
            }
        }
    }

    /**
     * Send a keep-alive ACK response back to the cloud
     * @param streamId The stream ID
     * @param ackId The ACK ID to respond with
     */
    private void sendKeepAliveAck(String streamId, String ackId) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "keep_alive_ack");
                response.put("streamId", streamId);
                response.put("ackId", ackId);
                response.put("timestamp", System.currentTimeMillis());

                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Sending keep-alive ACK: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating keep-alive ACK response", e);
            }
        } else {
            Log.w(TAG, "Cannot send keep-alive ACK - no bluetooth connection");
        }
    }

    /**
     * Send a video recording status response via BLE
     *
     * @param success Whether the command succeeded
     * @param status  Status message or error code
     * @param details Additional details or error message
     */
    /**
     * Format milliseconds into a human-readable duration string (MM:SS)
     */
    private String formatDuration(long durationMs) {
        long seconds = (durationMs / 1000) % 60;
        long minutes = (durationMs / (1000 * 60)) % 60;
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    private void sendVideoRecordingStatusResponse(boolean success, String status, String details) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "video_recording_status");
                response.put("success", success);
                response.put("status", status);

                if (details != null) {
                    response.put("details", details);
                }

                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Sending video recording status: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating video recording status response", e);
            }
        }
    }

    /**
     * Send a video recording status response with a custom status object
     *
     * @param success      Whether the command succeeded
     * @param statusObject Custom status object with details
     */
    private void sendVideoRecordingStatusResponse(boolean success, JSONObject statusObject) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "video_recording_status");
                response.put("success", success);

                // Merge the status object fields into the response
                Iterator<String> keys = statusObject.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    response.put(key, statusObject.get(key));
                }

                // Convert to string
                String jsonString = response.toString();
                Log.d(TAG, "Sending video recording status: " + jsonString);

                // Send the JSON response
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating video recording status response", e);
            }
        }
    }

    /**
     * Register the restart receiver to handle restart requests from OTA updater
     */
    private void registerRestartReceiver() {
        if (restartReceiver == null) {
            restartReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (ACTION_RESTART_SERVICE.equals(intent.getAction())) {
                        Log.d(TAG, "Received restart request from OTA updater");

                        // Start in foreground if not already running
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            createNotificationChannel();
                            startForeground(asgServiceNotificationId, updateNotification());
                            Log.d(TAG, "Started foreground service in response to restart request");
                        }

                        // Send heartbeat acknowledgment
                        Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
                        ackIntent.setPackage("com.augmentos.otaupdater");
                        sendBroadcast(ackIntent);
                        Log.d(TAG, "Sent heartbeat acknowledgment to OTA updater");
                    }
                }
            };

            IntentFilter filter = new IntentFilter(ACTION_RESTART_SERVICE);
            registerReceiver(restartReceiver, filter);
            Log.d(TAG, "Registered restart receiver");
        }
    }

    /**
     * Register the OTA progress receiver to handle download and installation progress from OTA updater
     */
    private void registerOtaProgressReceiver() {
        if (otaProgressReceiver == null) {
            otaProgressReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    
                    if (ACTION_DOWNLOAD_PROGRESS.equals(action)) {
                        handleDownloadProgress(intent);
                    } else if (ACTION_INSTALLATION_PROGRESS.equals(action)) {
                        handleInstallationProgress(intent);
                    }
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_DOWNLOAD_PROGRESS);
            filter.addAction(ACTION_INSTALLATION_PROGRESS);
            registerReceiver(otaProgressReceiver, filter);
            Log.d(TAG, "Registered OTA progress receiver");
        }
    }

    /**
     * Handle download progress events from OTA updater
     */
    private void handleDownloadProgress(Intent intent) {
        try {
            String status = intent.getStringExtra("status");
            int progress = intent.getIntExtra("progress", 0);
            long bytesDownloaded = intent.getLongExtra("bytes_downloaded", 0);
            long totalBytes = intent.getLongExtra("total_bytes", 0);
            String errorMessage = intent.getStringExtra("error_message");
            long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

            Log.i(TAG, "📥 Received download progress: " + status + " - " + progress + "%");

            // Forward to BLE
            sendDownloadProgressOverBle(status, progress, bytesDownloaded, totalBytes, errorMessage, timestamp);

        } catch (Exception e) {
            Log.e(TAG, "Error handling download progress", e);
        }
    }

    /**
     * Handle installation progress events from OTA updater
     */
    private void handleInstallationProgress(Intent intent) {
        try {
            String status = intent.getStringExtra("status");
            String apkPath = intent.getStringExtra("apk_path");
            String errorMessage = intent.getStringExtra("error_message");
            long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

            Log.i(TAG, "🔧 Received installation progress: " + status + " - " + apkPath);

            // Forward to BLE
            sendInstallationProgressOverBle(status, apkPath, errorMessage, timestamp);

        } catch (Exception e) {
            Log.e(TAG, "Error handling installation progress", e);
        }
    }


    /**
     * Example method to send status data back to the connected device
     */
    private void sendStatusData() {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            // Create status data packet
            // Example: byte[] statusData = {0x04, 0x01, 0x00, 0x00}; // 0x04 = status response
            // bluetoothManager.sendData(statusData);
            Log.d(TAG, "Status data sent to connected device");
        } else {
            Log.w(TAG, "Cannot send status - no connected device");
        }
    }

    /**
     * Creates the channel once (used by updateNotification()).
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    myChannelId,
                    notificationAppName,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(notificationDescription);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Track whether we've been initialized to avoid duplicate initialization
     */
    private boolean mIsInitialized = false;

    /**
     * Check if the service has been initialized
     */
    private boolean isInitialized() {
        return mIsInitialized;
    }

    /**
     * Safely initialize core components with proper error handling
     */
    private void safelyInitializeComponents() {
        try {
            Log.e(TAG, "Starting initialization of core components");

            // Initialize the network manager
            try {
                initializeNetworkManager();
                Log.e(TAG, "Successfully initialized network manager");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize network manager: " + e.getMessage(), e);
            }

            // Initialize the bluetooth manager
            try {
                initializeBluetoothManager();
                Log.e(TAG, "Successfully initialized bluetooth manager");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize bluetooth manager: " + e.getMessage(), e);
            }

            // Initialize the media queue manager
            try {
                initializeMediaQueueManager();
                Log.e(TAG, "Successfully initialized media queue manager");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize media queue manager: " + e.getMessage(), e);
            }

            // Initialize the media capture service
            try {
                initializeMediaCaptureService();
                Log.e(TAG, "Successfully initialized media capture service");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize media capture service: " + e.getMessage(), e);
            }

            // Mark as initialized
            mIsInitialized = true;
            Log.e(TAG, "Core components initialization complete");

        } catch (Exception e) {
            Log.e(TAG, "Uncaught exception during initialization: " + e.getMessage(), e);
        }
    }

    /**
     * Log detailed information about service start
     */
    private void logServiceStartInfo(Intent intent, int startId) {
        try {
            Log.e(TAG, "==============================================");
            Log.e(TAG, "SERVICE START INFO");
            Log.e(TAG, "StartId: " + startId);
            Log.e(TAG, "Android version: " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
            Log.e(TAG, "Device: " + Build.MANUFACTURER + " " + Build.MODEL);
            Log.e(TAG, "Intent: " + (intent != null ? intent.toString() : "null"));
            Log.e(TAG, "Action: " + (intent != null ? intent.getAction() : "null"));
            if (intent != null && intent.getExtras() != null) {
                for (String key : intent.getExtras().keySet()) {
                    Log.e(TAG, "Extra: " + key + " = " + intent.getExtras().get(key));
                }
            }
            Log.e(TAG, "Thread ID: " + Thread.currentThread().getId());
            Log.e(TAG, "==============================================");
        } catch (Exception e) {
            Log.e(TAG, "Error logging service start info", e);
        }
    }

    /**
     * Record service start in SharedPreferences
     */
    private void recordServiceStart(String action, Bundle extras) {
        try {
            SharedPreferences prefs = getSharedPreferences("boot_stats", MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            // Increment counter
            int serviceStartCount = prefs.getInt("service_start_count", 0) + 1;
            editor.putInt("service_start_count", serviceStartCount);

            // Record details
            editor.putString("last_service_action", action);
            editor.putLong("last_service_start_time", System.currentTimeMillis());

            // Extract any info from extras
            if (extras != null) {
                if (extras.containsKey("boot_source")) {
                    editor.putString("last_service_boot_source", extras.getString("boot_source"));
                }
                if (extras.containsKey("boot_time")) {
                    editor.putLong("last_service_boot_time", extras.getLong("boot_time"));
                }
            }

            editor.apply();

            Log.e(TAG, "Recorded service start #" + serviceStartCount + " with action: " + action);
        } catch (Exception e) {
            Log.e(TAG, "Error recording service start", e);
        }
    }

    /**
     * Update the service notification with latest information
     */
    private void updateServiceNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                // Create an updated notification
                Notification notification = updateNotification();

                // Update the foreground notification
                NotificationManager notificationManager =
                        (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

                if (notificationManager != null) {
                    notificationManager.notify(asgServiceNotificationId, notification);
                    Log.e(TAG, "Updated foreground notification");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error updating notification", e);
            }
        }
    }

    // Use existing RTMP implementation in the service
    // Our StreamPackLite-based implementation (RTMPStreamingExample) can be used
    // if the existing RTMP implementation needs to be enhanced in the future

    private BroadcastReceiver otaDownloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "Received OTA download complete broadcast");
            if ("com.augmentos.otaupdater.ACTION_OTA_DOWNLOAD_COMPLETE".equals(intent.getAction())) {
                Log.d(TAG, "Received OTA download complete broadcast");
                // Send BLE message to phone/controller
                if (bluetoothManager != null && bluetoothManager.isConnected()) {
                    try {
                        org.json.JSONObject otaMsg = new org.json.JSONObject();
                        otaMsg.put("type", "ota_update_available");
                        // TODO: Optionally add version or details if available
                        bluetoothManager.sendData(otaMsg.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        Log.d(TAG, "Sent ota_update_available BLE message to phone/controller");
                    } catch (org.json.JSONException e) {
                        Log.e(TAG, "Error creating ota_update_available JSON", e);
                    }
                }
            }
        }
    };

    /**
     * Check if camera permissions are granted and try to fix if they're not
     *
     * @return true if permissions are granted or fixed, false otherwise
     */
    private boolean ensureCameraPermissions() {
        // First check if permission is granted
        boolean hasPermission = true;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            int cameraPermission = checkSelfPermission(android.Manifest.permission.CAMERA);
            hasPermission = (cameraPermission == android.content.pm.PackageManager.PERMISSION_GRANTED);
        }

        if (!hasPermission) {
            Log.e(TAG, "Camera permissions not granted - attempting to fix programmatically");

            try {
                // Try to enable camera access via system commands
                SysControl.injectAdbCommand(getApplicationContext(), "pm grant " + getPackageName() + " android.permission.CAMERA");
                // Try to reset camera service
                SysControl.injectAdbCommand(getApplicationContext(), "svc power reboot"); // Sometimes a soft reboot helps

                // Check if fixed
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    int updatedPermission = checkSelfPermission(android.Manifest.permission.CAMERA);
                    boolean fixed = (updatedPermission == android.content.pm.PackageManager.PERMISSION_GRANTED);
                    Log.d(TAG, "Camera permission fix " + (fixed ? "successful" : "failed"));
                    return fixed;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error attempting to fix camera permissions", e);
            }
            return false;
        }

        return true;
    }

    /**
     * Start mock OTA progress simulation for testing the complete flow
     */
    private void startMockOtaProgressSimulation() {
        Log.d(TAG, "🎭 Starting mock OTA progress simulation");

        // Simulate download progress from 0% to 100% every 5%
        new Thread(() -> {
            try {
                // Step 1: Download Started
                Log.d(TAG, "📥 Mock: Download Started");
                sendDownloadProgressOverBle("STARTED", 0, 0, 10000000, null, System.currentTimeMillis());
                Thread.sleep(2000);
                
                // Step 2: Download Progress (every 5% from 5% to 95%)
                for (int progress = 5; progress <= 95; progress += 5) {
                    long bytesDownloaded = (progress * 10000000L) / 100;
                    Log.d(TAG, "📥 Mock: Download Progress " + progress + "%");
                    sendDownloadProgressOverBle("PROGRESS", progress, bytesDownloaded, 10000000, null, System.currentTimeMillis());
                    Thread.sleep(500); // 1000ms between progress updates
                }
                
                // Step 3: Download Finished
                Log.d(TAG, "📥 Mock: Download Finished");
                sendDownloadProgressOverBle("FINISHED", 100, 10000000, 10000000, null, System.currentTimeMillis());
                Thread.sleep(1000);
                
                // Step 4: Installation Started
                Log.d(TAG, "🔧 Mock: Installation Started");
                sendInstallationProgressOverBle("STARTED", "/data/app/com.augmentos.otaupdater-1.apk", null, System.currentTimeMillis());
                Thread.sleep(2000);
                
                // Step 5: Installation Finished
                Log.d(TAG, "🔧 Mock: Installation Finished");
                sendInstallationProgressOverBle("FINISHED", "/data/app/com.augmentos.otaupdater-1.apk", null, System.currentTimeMillis());
                
                Log.d(TAG, "✅ Mock OTA progress simulation completed successfully");
                
            } catch (InterruptedException e) {
                Log.e(TAG, "Mock OTA progress simulation interrupted", e);
            } catch (Exception e) {
                Log.e(TAG, "Error in mock OTA progress simulation", e);
            }
        }).start();
    }

    /**
     * Enable or disable WiFi via broadcast
     *
     * @param context Application context
     * @param bEnable True to enable WiFi, false to disable
     */
    public static void openWifi(Context context, boolean bEnable) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "setwifi");
        nn.putExtra("enable", bEnable);
        context.sendBroadcast(nn);
        Log.d(TAG, "Sent WiFi " + (bEnable ? "enable" : "disable") + " broadcast");
    }

    /**
     * Send an ACK response for a received message
     * @param messageId The message ID to acknowledge
     */
    private void sendAckResponse(long messageId) {
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            try {
                JSONObject ackResponse = new JSONObject();
                ackResponse.put("type", "msg_ack");
                ackResponse.put("mId", messageId);
                ackResponse.put("timestamp", System.currentTimeMillis());

                // Convert to string and send via BLE
                String jsonString = ackResponse.toString();
                Log.d(TAG, "📤 Sending ACK response: " + jsonString);
                bluetoothManager.sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating ACK response JSON", e);
            }
        } else {
            Log.w(TAG, "Cannot send ACK response - not connected to BLE device");
        }
    }
}