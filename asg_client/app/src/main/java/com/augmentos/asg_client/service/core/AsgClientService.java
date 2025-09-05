package com.augmentos.asg_client.service.core;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.SysControl;
import com.augmentos.asg_client.io.bluetooth.interfaces.BluetoothStateListener;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.media.interfaces.ServiceCallbackInterface;
import com.augmentos.asg_client.io.media.managers.MediaUploadQueueManager;
import com.augmentos.asg_client.io.network.interfaces.NetworkStateListener;
import com.augmentos.asg_client.io.ota.utils.OtaConstants;
import com.augmentos.asg_client.io.streaming.events.StreamingEvent;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.core.processors.CommandProcessor;
import com.augmentos.asg_client.service.system.interfaces.IConfigurationManager;
import com.augmentos.asg_client.service.system.interfaces.IServiceLifecycle;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;
import com.augmentos.asg_client.service.media.interfaces.IMediaManager;
import com.augmentos.asg_client.service.system.managers.StateManager;
import com.augmentos.augmentos_core.AugmentosService;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * Fully refactored AsgClientService that follows SOLID principles.
 * <p>
 * This service demonstrates:
 * - Single Responsibility Principle: Each manager handles one concern
 * - Open/Closed Principle: Easy to extend with new managers
 * - Liskov Substitution Principle: All managers implement interfaces
 * - Interface Segregation Principle: Focused interfaces for each concern
 * - Dependency Inversion Principle: Depends on abstractions, not concretions
 */
public class AsgClientService extends Service implements NetworkStateListener, BluetoothStateListener {

    // ---------------------------------------------
    // Constants //TODO: Extract all the Constants and Magic Number/Text to AsgConstants
    // ---------------------------------------------
    public static final String TAG = "AsgClientServiceV2";

    // Service actions
    public static final String ACTION_START_CORE = "ACTION_START_CORE";
    public static final String ACTION_STOP_CORE = "ACTION_STOP_CORE";
    public static final String ACTION_START_FOREGROUND_SERVICE = "MY_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "MY_ACTION_STOP_FOREGROUND_SERVICE";
    public static final String ACTION_RESTART_SERVICE = "com.augmentos.asg_client.ACTION_RESTART_SERVICE";
    public static final String ACTION_RESTART_COMPLETE = "com.augmentos.asg_client.ACTION_RESTART_COMPLETE";
    public static final String ACTION_RESTART_CAMERA = "com.augmentos.asg_client.ACTION_RESTART_CAMERA";
    public static final String ACTION_START_OTA_UPDATER = "ACTION_START_OTA_UPDATER";

    // OTA Update progress actions
    public static final String ACTION_DOWNLOAD_PROGRESS = "com.augmentos.otaupdater.ACTION_DOWNLOAD_PROGRESS";
    public static final String ACTION_INSTALLATION_PROGRESS = "com.augmentos.otaupdater.ACTION_INSTALLATION_PROGRESS";
    public static final String ACTION_OTA_HEARTBEAT = "com.augmentos.otaupdater.ACTION_HEARTBEAT";

    // Service health monitoring
    private static final String ACTION_HEARTBEAT = "com.augmentos.asg_client.ACTION_HEARTBEAT";
    private static final String ACTION_HEARTBEAT_ACK = "com.augmentos.asg_client.ACTION_HEARTBEAT_ACK";

    // ---------------------------------------------
    // Dependency Injection Container
    // ---------------------------------------------
    private ServiceContainer serviceContainer;

    // Interface references (Dependency Inversion Principle)
    private IServiceLifecycle lifecycleManager;
    private ICommunicationManager communicationManager;
    private IConfigurationManager configurationManager;
    private IStateManager stateManager;
    private IMediaManager streamingManager;

    private CommandProcessor commandProcessor;

    // ---------------------------------------------
    // Service State
    // ---------------------------------------------
    private AugmentosService augmentosService = null;
    private boolean isAugmentosBound = false;

    // ---------------------------------------------
    // WiFi State Management
    // ---------------------------------------------
    private static final long WIFI_STATE_DEBOUNCE_MS = 1000;
    private Handler wifiDebounceHandler;
    private Runnable wifiDebounceRunnable;
    private boolean lastWifiState = false;
    private boolean pendingWifiState = false;

    // ---------------------------------------------
    // Broadcast Receivers
    // ---------------------------------------------
    private BroadcastReceiver heartbeatReceiver;
    private BroadcastReceiver restartReceiver;
    private BroadcastReceiver otaProgressReceiver;

    // ---------------------------------------------
    // ServiceConnection for AugmentosService
    // ---------------------------------------------
    private final ServiceConnection augmentosConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.i(TAG, "🔗 AugmentosService connected successfully");
            Log.d(TAG, "📋 Component name: " + name.getClassName());
            
            try {
                AugmentosService.LocalBinder binder = (AugmentosService.LocalBinder) service;
                augmentosService = binder.getService();
                isAugmentosBound = true;
                Log.d(TAG, "✅ AugmentosService bound and ready");

                // Update state manager
                if (stateManager instanceof StateManager) {
                    Log.d(TAG, "📊 Updating state manager with AugmentosService binding");
                    ((StateManager) stateManager).setAugmentosServiceBound(true);
                }

                // Check WiFi connectivity
                if (stateManager.isConnectedToWifi()) {
                    Log.d(TAG, "🌐 WiFi is connected - triggering onWifiConnected");
                    onWifiConnected();
                } else {
                    Log.d(TAG, "📶 WiFi is not connected - skipping onWifiConnected");
                }
            } catch (Exception e) {
                Log.e(TAG, "💥 Error in AugmentosService connection", e);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.w(TAG, "🔌 AugmentosService disconnected");
            Log.d(TAG, "📋 Component name: " + name.getClassName());
            
            isAugmentosBound = false;
            augmentosService = null;

            // Update state manager
            if (stateManager instanceof StateManager) {
                Log.d(TAG, "📊 Updating state manager with AugmentosService unbinding");
                ((StateManager) stateManager).setAugmentosServiceBound(false);
            }
        }
    };

    // ---------------------------------------------
    // Lifecycle Methods
    // ---------------------------------------------
    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "🚀 AsgClientServiceV2 onCreate() started");
        Log.d(TAG, "📊 Android API Level: " + Build.VERSION.SDK_INT);

        try {
            // Register for EventBus events
            Log.d(TAG, "📡 Registering for EventBus events");
            EventBus.getDefault().register(this);
            Log.d(TAG, "✅ EventBus registration successful");

            // Initialize dependency injection container
            Log.d(TAG, "🔧 Initializing service container");
            initializeServiceContainer();

            // Initialize WiFi debouncing
            Log.d(TAG, "📶 Initializing WiFi debouncing");
            initializeWifiDebouncing();

            // Register receivers
            Log.d(TAG, "📻 Registering broadcast receivers");
            registerReceivers();

            // Send version info
            Log.d(TAG, "📋 Sending initial version information");
            sendVersionInfo();

            Log.i(TAG, "✅ AsgClientServiceV2 onCreate() completed successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error in onCreate()", e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "🎯 onStartCommand() called - StartId: " + startId + ", Flags: " + flags);
        
        super.onStartCommand(intent, flags, startId);

        try {
            // Ensure foreground service on API 26+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Log.d(TAG, "📱 API 26+ detected - setting up foreground service");
                serviceContainer.getNotificationManager().createNotificationChannel();
                startForeground(serviceContainer.getNotificationManager().getDefaultNotificationId(),
                        serviceContainer.getNotificationManager().createForegroundNotification());
                Log.d(TAG, "✅ Foreground service started");
            } else {
                Log.d(TAG, "📱 API < 26 - skipping foreground service setup");
            }

            if (intent == null || intent.getAction() == null) {
                Log.w(TAG, "⚠️ Received null intent or null action");
                return START_STICKY;
            }

            String action = intent.getAction();
            Log.i(TAG, "🎯 Processing action: " + action);
            
            // Delegate action handling to lifecycle manager
            lifecycleManager.handleAction(action, intent.getExtras());
            Log.d(TAG, "✅ Action processed successfully");
            
        } catch (Exception e) {
            Log.e(TAG, "💥 Error in onStartCommand()", e);
        }
        
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "🛑 AsgClientServiceV2 onDestroy() started");
        
        try {
            // Unregister from EventBus
            if (EventBus.getDefault().isRegistered(this)) {
                Log.d(TAG, "📡 Unregistering from EventBus");
                EventBus.getDefault().unregister(this);
                Log.d(TAG, "✅ EventBus unregistration successful");
            } else {
                Log.d(TAG, "⏭️ Not registered with EventBus - skipping unregistration");
            }

            // Clean up service container
            if (serviceContainer != null) {
                Log.d(TAG, "🧹 Cleaning up service container");
                serviceContainer.cleanup();
                Log.d(TAG, "✅ Service container cleanup completed");
            } else {
                Log.d(TAG, "⏭️ Service container is null - skipping cleanup");
            }

            // Unregister receivers
            Log.d(TAG, "📻 Unregistering broadcast receivers");
            unregisterReceivers();

            // Unbind from AugmentosService
            if (isAugmentosBound) {
                Log.d(TAG, "🔌 Unbinding from AugmentosService");
                unbindService(augmentosConnection);
                isAugmentosBound = false;
                Log.d(TAG, "✅ AugmentosService unbound");
            } else {
                Log.d(TAG, "⏭️ Not bound to AugmentosService - skipping unbind");
            }

            // Clean up WiFi debouncing
            if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
                Log.d(TAG, "📶 Cleaning up WiFi debouncing");
                wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
                Log.d(TAG, "✅ WiFi debouncing cleanup completed");
            }

            // Stop RTMP streaming
            Log.d(TAG, "📹 Stopping RTMP streaming");
            streamingManager.stopRtmpStreaming();
            Log.d(TAG, "✅ RTMP streaming stopped");

            Log.i(TAG, "✅ AsgClientServiceV2 onDestroy() completed successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error in onDestroy()", e);
        }
        
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "🔗 onBind() called");
        return new LocalBinder();
    }

    // ---------------------------------------------
    // Initialization Methods
    // ---------------------------------------------
    private void initializeServiceContainer() {
        Log.d(TAG, "🔧 initializeServiceContainer() started");
        
        try {
            serviceContainer = new ServiceContainer(this, this );
            Log.d(TAG, "✅ ServiceContainer created successfully");

            // Initialize container
            Log.d(TAG, "🚀 Initializing service container");
            serviceContainer.initialize();
            Log.d(TAG, "✅ Service container initialization completed");

            //Wait for 1 second
            Thread.sleep(1000);

            // Get interface references
            Log.d(TAG, "📋 Getting interface references from service container");
            lifecycleManager = serviceContainer.getLifecycleManager();
            communicationManager = serviceContainer.getCommunicationManager();
            configurationManager = serviceContainer.getConfigurationManager();
            stateManager = serviceContainer.getStateManager();
            streamingManager = serviceContainer.getStreamingManager();
            commandProcessor = serviceContainer.getCommandProcessor();
            
            Log.d(TAG, "✅ All interface references obtained");
            Log.d(TAG, "📊 Interface status - LifecycleManager: " + (lifecycleManager != null ? "valid" : "null") +
                      ", CommunicationManager: " + (communicationManager != null ? "valid" : "null") +
                      ", ConfigurationManager: " + (configurationManager != null ? "valid" : "null") +
                      ", StateManager: " + (stateManager != null ? "valid" : "null") +
                      ", StreamingManager: " + (streamingManager != null ? "valid" : "null") +
                      ", CommandProcessor: " + (commandProcessor != null ? "valid" : "null"));


        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing service container", e);
            try {
                throw e;
            } catch (InterruptedException ex) {
                throw new RuntimeException(ex);
            }
        }
    }

    /**
     * Initialize WiFi debouncing
     */
    private void initializeWifiDebouncing() {
        Log.d(TAG, "📶 initializeWifiDebouncing() started");
        
        try {
            wifiDebounceHandler = new Handler(Looper.getMainLooper());
            wifiDebounceRunnable = () -> {
                if (pendingWifiState != lastWifiState) {
                    Log.i(TAG, "🔄 WiFi debounce timeout - sending final state: " +
                            (pendingWifiState ? "CONNECTED" : "DISCONNECTED"));
                    lastWifiState = pendingWifiState;
                    communicationManager.sendWifiStatusOverBle(pendingWifiState);
                    Log.d(TAG, "✅ WiFi status sent over BLE");
                } else {
                    Log.d(TAG, "⏭️ WiFi state unchanged - no action needed");
                }
            };
            Log.d(TAG, "✅ WiFi debouncing initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing WiFi debouncing", e);
        }
    }

    /**
     * Register all receivers
     */
    private void registerReceivers() {
        Log.d(TAG, "📻 registerReceivers() started");
        
        try {
            registerHeartbeatReceiver();
            registerRestartReceiver();
            registerOtaProgressReceiver();
            Log.d(TAG, "✅ All receivers registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error registering receivers", e);
        }
    }

    /**
     * Unregister all receivers
     */
    private void unregisterReceivers() {
        Log.d(TAG, "📻 unregisterReceivers() started");
        
        try {
            if (heartbeatReceiver != null) {
                Log.d(TAG, "💓 Unregistering heartbeat receiver");
                unregisterReceiver(heartbeatReceiver);
                Log.d(TAG, "✅ Heartbeat receiver unregistered");
            } else {
                Log.d(TAG, "⏭️ Heartbeat receiver is null - skipping");
            }
            
            if (restartReceiver != null) {
                Log.d(TAG, "🔄 Unregistering restart receiver");
                unregisterReceiver(restartReceiver);
                Log.d(TAG, "✅ Restart receiver unregistered");
            } else {
                Log.d(TAG, "⏭️ Restart receiver is null - skipping");
            }
            
            if (otaProgressReceiver != null) {
                Log.d(TAG, "📥 Unregistering OTA progress receiver");
                unregisterReceiver(otaProgressReceiver);
                Log.d(TAG, "✅ OTA progress receiver unregistered");
            } else {
                Log.d(TAG, "⏭️ OTA progress receiver is null - skipping");
            }
            
            Log.d(TAG, "✅ All receivers unregistered successfully");
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "⚠️ Receiver was not registered: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "💥 Error unregistering receivers", e);
        }
    }

    // ---------------------------------------------
    // NetworkStateListener Implementation
    // ---------------------------------------------
    @Override
    public void onWifiStateChanged(boolean isConnected) {
        Log.i(TAG, "🔄 WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));
        Log.d(TAG, "📊 Previous state: " + (lastWifiState ? "CONNECTED" : "DISCONNECTED") + 
                  ", Pending state: " + (pendingWifiState ? "CONNECTED" : "DISCONNECTED"));

        pendingWifiState = isConnected;

        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            Log.d(TAG, "⏱️ Removing existing WiFi debounce callback");
            wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
            Log.d(TAG, "⏱️ Scheduling new WiFi debounce callback in " + WIFI_STATE_DEBOUNCE_MS + "ms");
            wifiDebounceHandler.postDelayed(wifiDebounceRunnable, WIFI_STATE_DEBOUNCE_MS);
        } else {
            Log.w(TAG, "⚠️ WiFi debouncing not initialized - sending state immediately");
            communicationManager.sendWifiStatusOverBle(isConnected);
        }

        if (isConnected) {
            Log.d(TAG, "🌐 WiFi connected - triggering connected actions");
            onWifiConnected();
            processMediaQueue();
        } else {
            Log.d(TAG, "📶 WiFi disconnected - no additional actions needed");
        }
    }

    @Override
    public void onHotspotStateChanged(boolean isEnabled) {
        Log.i(TAG, "📡 Hotspot state changed: " + (isEnabled ? "ENABLED" : "DISABLED"));
        
        // Send hotspot status update to phone
        try {
            if (serviceContainer != null && serviceContainer.getServiceManager() != null) {
                var networkManager = serviceContainer.getServiceManager().getNetworkManager();
                var commManager = serviceContainer.getCommunicationManager();
                
                if (networkManager != null && commManager != null) {
                    // Build hotspot status JSON
                    JSONObject hotspotStatus = new JSONObject();
                    hotspotStatus.put("type", "hotspot_status_update");
                    hotspotStatus.put("hotspot_enabled", isEnabled);
                    
                    if (isEnabled) {
                        hotspotStatus.put("hotspot_ssid", networkManager.getHotspotSsid());
                        hotspotStatus.put("hotspot_password", networkManager.getHotspotPassword());
                        hotspotStatus.put("hotspot_gateway_ip", networkManager.getHotspotGatewayIp());
                    }
                    
                    Log.d(TAG, "📡 🔥 Sending hotspot status update: " + hotspotStatus.toString());
                    boolean sent = commManager.sendBluetoothResponse(hotspotStatus);
                    Log.d(TAG, "📡 🔥 " + (sent ? "✅ Hotspot status sent successfully" : "❌ Failed to send hotspot status"));
                } else {
                    Log.w(TAG, "📡 🔥 Cannot send hotspot status - managers not available");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "📡 🔥 Error sending hotspot status update", e);
        }
    }

    @Override
    public void onWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.i(TAG, "🔑 WiFi credentials received for network: " + ssid);
        Log.d(TAG, "📋 Credentials - SSID: " + ssid + 
                  ", Password: " + (password != null ? "***" : "null") + 
                  ", AuthToken: " + (authToken != null ? "***" : "null"));
    }

    // ---------------------------------------------
    // BluetoothStateListener Implementation
    // ---------------------------------------------
    @Override
    public void onConnectionStateChanged(boolean connected) {
        Log.i(TAG, "📶 Bluetooth connection state changed: " + (connected ? "CONNECTED" : "DISCONNECTED"));

        if (connected) {
            Log.d(TAG, "⏱️ Scheduling WiFi status send in 3 seconds");
            // Send WiFi status after delay
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                Log.d(TAG, "📤 Sending WiFi status after Bluetooth connection");
                if (stateManager.isConnectedToWifi()) {
                    Log.d(TAG, "🌐 WiFi is connected - sending status");
                    communicationManager.sendWifiStatusOverBle(true);
                } else {
                    Log.d(TAG, "📶 WiFi is not connected - sending status");
                    communicationManager.sendWifiStatusOverBle(false);
                }
            }, 3000);

            Log.d(TAG, "📋 Sending version information after Bluetooth connection");
            sendVersionInfo();
        } else {
            Log.d(TAG, "📶 Bluetooth disconnected - no additional actions needed");
        }
    }

    @Override
    public void onDataReceived(byte[] data) {
        Log.d(TAG, "📥 Bluetooth onDataReceived() called");
        
        if (data == null || data.length == 0) {
            Log.w(TAG, "⚠️ Received empty data packet from Bluetooth");
            return;
        }

        Log.i(TAG, "📥 Received " + data.length + " bytes from Bluetooth");
        Log.d(TAG, "📋 Data preview: " + new String(data, 0, Math.min(data.length, 100)) + 
                  (data.length > 100 ? "..." : ""));

        try {
            // Delegate JSON parsing and processing to CommandProcessor
            Log.d(TAG, "🔄 Delegating data processing to CommandProcessor");
            commandProcessor.processCommand(data);
            Log.d(TAG, "✅ Data processing delegated successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error processing received data", e);
        }
    }


    // ---------------------------------------------
    // Helper Methods
    // ---------------------------------------------

    private void onWifiConnected() {
        Log.i(TAG, "🌐 Connected to WiFi network");
        
        if (isAugmentosBound && augmentosService != null) {
            Log.i(TAG, "🔗 AugmentOS service is available, connecting to backend...");
        } else {
            Log.d(TAG, "⏭️ AugmentOS service not available - waiting for binding");
        }
    }

    private void processMediaQueue() {
        Log.d(TAG, "📁 processMediaQueue() called");
        
        if (serviceContainer.getServiceManager().getMediaQueueManager() != null) {
            if (!serviceContainer.getServiceManager().getMediaQueueManager().isQueueEmpty()) {
                Log.i(TAG, "📁 WiFi connected - processing media upload queue");
                serviceContainer.getServiceManager().getMediaQueueManager().processQueue();
                Log.d(TAG, "✅ Media queue processing initiated");
            } else {
                Log.d(TAG, "📁 Media queue is empty - no processing needed");
            }
        } else {
            Log.w(TAG, "⚠️ Media queue manager is null - cannot process queue");
        }
    }

    public void sendVersionInfo() {
        Log.i(TAG, "📊 Sending version information");

        try {
            JSONObject versionInfo = new JSONObject();
            versionInfo.put("type", "version_info");
            versionInfo.put("timestamp", System.currentTimeMillis());
            
            String appVersion = "1.0.0";
            String buildNumber = "1";
            Log.d(TAG, "📋 Default app version: " + appVersion + ", Build number: " + buildNumber);

            try {
                appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                buildNumber = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).versionCode);
                Log.d(TAG, "✅ Retrieved app version: " + appVersion + ", Build number: " + buildNumber);
            } catch (Exception e) {
                Log.e(TAG, "💥 Error getting app version - using defaults", e);
            }
            
            versionInfo.put("app_version", appVersion);
            versionInfo.put("build_number", buildNumber);
            versionInfo.put("device_model", android.os.Build.MODEL);
            versionInfo.put("android_version", android.os.Build.VERSION.RELEASE);
            versionInfo.put("ota_version_url", OtaConstants.VERSION_JSON_URL);

            Log.d(TAG, "📋 Version info prepared - Device: " + android.os.Build.MODEL + 
                      ", Android: " + android.os.Build.VERSION.RELEASE + 
                      ", OTA URL: " + OtaConstants.VERSION_JSON_URL);

            if (serviceContainer.getServiceManager().getBluetoothManager() != null &&
                    serviceContainer.getServiceManager().getBluetoothManager().isConnected()) {
                Log.d(TAG, "📤 Sending version info via Bluetooth");
                serviceContainer.getServiceManager().getBluetoothManager().sendData(versionInfo.toString().getBytes(StandardCharsets.UTF_8));
                Log.i(TAG, "✅ Sent version info to phone successfully");
            } else {
                Log.w(TAG, "⚠️ Bluetooth manager not available or not connected - cannot send version info");
            }
        } catch (JSONException e) {
            Log.e(TAG, "💥 Error creating version info JSON", e);
        } catch (Exception e) {
            Log.e(TAG, "💥 Error sending version info", e);
        }
    }

    // REMOVED: saveCoreToken method - now handled directly by ConfigurationManager
    // AuthTokenCommandHandler calls configurationManager.saveCoreToken() directly

    // ---------------------------------------------
    // Public API Methods (Delegating to managers)
    // ---------------------------------------------
    // REMOVED: All delegation methods are now handled directly by managers
    // Components should access managers through the service container

    // ---------------------------------------------
    // Getters (Delegating to state manager)
    // ---------------------------------------------
    // REMOVED: All getter methods are now handled directly by managers
    // Components should access managers through the service container

    // ---------------------------------------------
    // Media Capture Listeners
    // ---------------------------------------------
    public MediaCaptureService.MediaCaptureListener getMediaCaptureListener() {
        Log.d(TAG, "📸 Creating media capture listener");
        
        return new MediaCaptureService.MediaCaptureListener() {
            @Override
            public void onPhotoCapturing(String requestId) {
                Log.i(TAG, "📸 Photo capturing started - ID: " + requestId);
            }

            @Override
            public void onPhotoCaptured(String requestId, String filePath) {
                Log.i(TAG, "✅ Photo captured successfully - ID: " + requestId + ", Path: " + filePath);
            }

            @Override
            public void onPhotoUploading(String requestId) {
                Log.i(TAG, "📤 Photo uploading started - ID: " + requestId);
            }

            @Override
            public void onPhotoUploaded(String requestId, String url) {
                Log.i(TAG, "✅ Photo uploaded successfully - ID: " + requestId + ", URL: " + url);
            }

            @Override
            public void onVideoRecordingStarted(String requestId, String filePath) {
                Log.i(TAG, "🎥 Video recording started - ID: " + requestId + ", Path: " + filePath);
            }

            @Override
            public void onVideoRecordingStopped(String requestId, String filePath) {
                Log.i(TAG, "⏹️ Video recording stopped - ID: " + requestId + ", Path: " + filePath);
            }

            @Override
            public void onVideoUploading(String requestId) {
                Log.i(TAG, "📤 Video uploading started - ID: " + requestId);
            }

            @Override
            public void onVideoUploaded(String requestId, String url) {
                Log.i(TAG, "✅ Video uploaded successfully - ID: " + requestId + ", URL: " + url);
            }

            @Override
            public void onMediaError(String requestId, String error, int mediaType) {
                String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                Log.e(TAG, "❌ " + mediaTypeName + " error - ID: " + requestId + ", Error: " + error);
            }
        };
    }

    public ServiceCallbackInterface getServiceCallback() {
        Log.d(TAG, "📡 Creating service callback interface");
        
        return new ServiceCallbackInterface() {
            @Override
            public void sendThroughBluetooth(byte[] data) {
                Log.d(TAG, "📤 sendThroughBluetooth() called - Data length: " + (data != null ? data.length : "null"));
                
                if (serviceContainer.getServiceManager().getBluetoothManager() != null) {
                    Log.d(TAG, "📶 Sending data through Bluetooth");
                    serviceContainer.getServiceManager().getBluetoothManager().sendData(data);
                    Log.d(TAG, "✅ Data sent through Bluetooth successfully");
                } else {
                    Log.w(TAG, "⚠️ Bluetooth manager is null - cannot send data");
                }
            }

            @Override
            public boolean sendFileViaBluetooth(String filePath) {
                Log.d(TAG, "📁 sendFileViaBluetooth() called - File: " + filePath);
                
                if (serviceContainer.getServiceManager().getBluetoothManager() != null) {
                    Log.d(TAG, "📶 Starting BLE file transfer");
                    boolean started = serviceContainer.getServiceManager().getBluetoothManager().sendImageFile(filePath);
                    if (started) {
                        Log.i(TAG, "✅ BLE file transfer started successfully for: " + filePath);
                    } else {
                        Log.e(TAG, "❌ Failed to start BLE file transfer for: " + filePath);
                    }
                    return started;
                } else {
                    Log.w(TAG, "⚠️ Bluetooth manager is null - cannot send file");
                    return false;
                }
            }
            
            @Override
            public boolean isBleTransferInProgress() {
                Log.d(TAG, "📊 isBleTransferInProgress() called");
                
                if (serviceContainer.getServiceManager().getBluetoothManager() != null) {
                    boolean inProgress = serviceContainer.getServiceManager().getBluetoothManager().isFileTransferInProgress();
                    Log.d(TAG, "📊 BLE transfer in progress: " + inProgress);
                    return inProgress;
                } else {
                    Log.w(TAG, "⚠️ Bluetooth manager is null - cannot check transfer status");
                    return false;
                }
            }
        };
    }

    // ---------------------------------------------
    // Broadcast Receiver Registration Methods
    // ---------------------------------------------
    private void registerHeartbeatReceiver() {
        Log.d(TAG, "💓 registerHeartbeatReceiver() started");
        
        try {
            heartbeatReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    Log.d(TAG, "💓 Heartbeat receiver triggered - Action: " + action);
                    
                    if (ACTION_HEARTBEAT.equals(action) ||
                            "com.augmentos.otaupdater.ACTION_HEARTBEAT".equals(action)) {

                        Log.i(TAG, "💓 Heartbeat received - sending acknowledgment");

                        try {
                            Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
                            ackIntent.setPackage("com.augmentos.otaupdater");
                            sendBroadcast(ackIntent);

                            Log.i(TAG, "✅ Heartbeat acknowledgment sent successfully");
                        } catch (Exception e) {
                            Log.e(TAG, "💥 Error sending heartbeat acknowledgment", e);
                        }
                    } else {
                        Log.d(TAG, "⏭️ Unknown action received: " + action);
                    }
                }
            };

            IntentFilter heartbeatFilter = new IntentFilter();
            heartbeatFilter.addAction(ACTION_HEARTBEAT);
            heartbeatFilter.addAction(ACTION_OTA_HEARTBEAT);

            registerReceiver(heartbeatReceiver, heartbeatFilter);
            Log.d(TAG, "✅ Heartbeat receiver registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error registering heartbeat receiver", e);
        }
    }

    private void registerRestartReceiver() {
        Log.d(TAG, "🔄 registerRestartReceiver() started");
        
        try {
            restartReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    Log.d(TAG, "🔄 Restart receiver triggered - Action: " + action);
                    
                    if (ACTION_RESTART_SERVICE.equals(action)) {
                        Log.i(TAG, "🔄 Received restart request from OTA updater");
                    } else {
                        Log.d(TAG, "⏭️ Unknown action received: " + action);
                    }
                }
            };

            IntentFilter restartFilter = new IntentFilter(ACTION_RESTART_SERVICE);
            registerReceiver(restartReceiver, restartFilter);
            Log.d(TAG, "✅ Restart receiver registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error registering restart receiver", e);
        }
    }

    private void registerOtaProgressReceiver() {
        Log.d(TAG, "📥 registerOtaProgressReceiver() started");
        
        try {
            otaProgressReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    Log.d(TAG, "📥 OTA progress receiver triggered - Action: " + action);

                    switch (Objects.requireNonNull(action)) {
                        case ACTION_DOWNLOAD_PROGRESS:
                            Log.d(TAG, "📥 Handling download progress");
                            handleDownloadProgress(intent);
                            break;
                        case ACTION_INSTALLATION_PROGRESS:
                            Log.d(TAG, "🔧 Handling installation progress");
                            handleInstallationProgress(intent);
                            break;
                        default:
                            Log.d(TAG, "⏭️ Unknown OTA action: " + action);
                            break;
                    }
                }
            };

            IntentFilter otaFilter = new IntentFilter();
            otaFilter.addAction(ACTION_DOWNLOAD_PROGRESS);
            otaFilter.addAction(ACTION_INSTALLATION_PROGRESS);
            registerReceiver(otaProgressReceiver, otaFilter);
            Log.d(TAG, "✅ OTA progress receiver registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error registering OTA progress receiver", e);
        }
    }

    private void handleDownloadProgress(Intent intent) {
        Log.d(TAG, "📥 handleDownloadProgress() started");
        
        try {
            String status = intent.getStringExtra("status");
            int progress = intent.getIntExtra("progress", 0);
            long bytesDownloaded = intent.getLongExtra("bytes_downloaded", 0);
            long totalBytes = intent.getLongExtra("total_bytes", 0);
            String errorMessage = intent.getStringExtra("error_message");
            long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

            Log.i(TAG, "📥 Download progress: " + status + " - " + progress + "% (" + 
                      bytesDownloaded + "/" + totalBytes + " bytes)");
            
            if (errorMessage != null) {
                Log.w(TAG, "⚠️ Download error: " + errorMessage);
            }

            if (commandProcessor != null) {
                Log.d(TAG, "📤 Sending download progress to command processor");
                commandProcessor.sendDownloadProgressOverBle(status, progress, bytesDownloaded, totalBytes, errorMessage, timestamp);
                Log.d(TAG, "✅ Download progress sent successfully");
            } else {
                Log.w(TAG, "⚠️ Command processor is null - cannot send download progress");
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Error handling download progress", e);
        }
    }

    private void handleInstallationProgress(Intent intent) {
        Log.d(TAG, "🔧 handleInstallationProgress() started");
        
        try {
            String status = intent.getStringExtra("status");
            String apkPath = intent.getStringExtra("apk_path");
            String errorMessage = intent.getStringExtra("error_message");
            long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());

            Log.i(TAG, "🔧 Installation progress: " + status + " - " + apkPath);
            
            if (errorMessage != null) {
                Log.w(TAG, "⚠️ Installation error: " + errorMessage);
            }

            if (commandProcessor != null) {
                Log.d(TAG, "📤 Sending installation progress to command processor");
                commandProcessor.sendInstallationProgressOverBle(status, apkPath, errorMessage, timestamp);
                Log.d(TAG, "✅ Installation progress sent successfully");
            } else {
                Log.w(TAG, "⚠️ Command processor is null - cannot send installation progress");
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Error handling installation progress", e);
        }
    }

    // ---------------------------------------------
    // EventBus Subscriptions
    // ---------------------------------------------
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onStreamingEvent(StreamingEvent event) {
        Log.d(TAG, "📹 Streaming event received: " + event.getClass().getSimpleName());
        
        if (event instanceof StreamingEvent.Started) {
            Log.i(TAG, "✅ RTMP streaming started successfully");
        } else if (event instanceof StreamingEvent.Stopped) {
            Log.i(TAG, "⏹️ RTMP streaming stopped");
        } else if (event instanceof StreamingEvent.Error) {
            Log.e(TAG, "❌ RTMP streaming error: " +
                    ((StreamingEvent.Error) event).getMessage());
        } else {
            Log.d(TAG, "📹 Unknown streaming event type: " + event.getClass().getSimpleName());
        }
    }

    // ---------------------------------------------
    // Binder Class
    // ---------------------------------------------
    public class LocalBinder extends Binder {
        public AsgClientService getService() {
            Log.d(TAG, "🔗 LocalBinder.getService() called");
            return AsgClientService.this;
        }
    }

    // ---------------------------------------------
    // Utility Methods
    // ---------------------------------------------
    public static void openWifi(Context context, boolean bEnable) {
        Log.d(TAG, "🌐 openWifi() called - Enable: " + bEnable);
        
        try {
            if (bEnable) {
                Log.d(TAG, "📶 Enabling WiFi via ADB command");
                SysControl.injectAdbCommand(context, "svc wifi enable");
                Log.d(TAG, "✅ WiFi enable command executed");
            } else {
                Log.d(TAG, "📶 Disabling WiFi via ADB command");
                SysControl.injectAdbCommand(context, "svc wifi disable");
                Log.d(TAG, "✅ WiFi disable command executed");
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Error executing WiFi command", e);
        }
    }
} 