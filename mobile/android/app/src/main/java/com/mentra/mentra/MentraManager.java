package com.mentra.mentra;

import android.content.Context;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public class MentraManager {
    private static final String TAG = "MentraManager";
    private static MentraManager instance;
    private ReactApplicationContext reactContext;
    
    // Core properties
    private String coreToken = "";
    private String coreTokenOwner = "";
    
    // Device managers (these would be implemented separately)
    // private ERG1Manager g1Manager;
    // private MentraLiveManager liveManager;
    // private Mach1Manager mach1Manager;
    // private FrameManager frameManager;
    // private ServerComms serverComms;
    // private OnboardMicrophoneManager micManager;
    
    // Status and configuration
    private Map<String, Object> lastStatusObj = new HashMap<>();
    private List<ThirdPartyCloudApp> cachedThirdPartyAppList = new ArrayList<>();
    private String defaultWearable = "";
    private String pendingWearable = "";
    private String deviceName = "";
    private boolean contextualDashboard = true;
    private int headUpAngle = 30;
    private int brightness = 50;
    private int batteryLevel = -1;
    private boolean autoBrightness = true;
    private int dashboardHeight = 4;
    private int dashboardDepth = 5;
    private boolean sensingEnabled = true;
    private boolean powerSavingMode = false;
    private boolean isSearching = false;
    private boolean isUpdatingScreen = false;
    private boolean alwaysOnStatusBar = false;
    private boolean bypassVad = true;
    private boolean bypassVadForPCM = false;
    private boolean enforceLocalTranscription = false;
    private boolean bypassAudioEncoding = false;
    private boolean onboardMicUnavailable = false;
    private boolean metricSystemEnabled = false;
    private boolean settingsLoaded = false;
    private boolean glassesWifiConnected = false;
    private String glassesWifiSsid = "";
    private boolean isHeadUp = false;
    
    // View states
    private List<ViewState> viewStates;
    
    // Microphone configuration
    private boolean useOnboardMic = false;
    private String preferredMic = "glasses";
    private boolean micEnabled = false;
    private List<SpeechRequiredDataType> currentRequiredData = new ArrayList<>();
    
    // Button settings
    private String buttonPressMode = "photo";
    private String buttonPhotoSize = "medium";
    private int buttonVideoWidth = 1280;
    private int buttonVideoHeight = 720;
    private int buttonVideoFps = 30;
    private boolean buttonCameraLed = true;
    
    // VAD (Voice Activity Detection)
    // private SileroVADStrategy vad;
    private List<byte[]> vadBuffer = new ArrayList<>();
    private boolean isSpeaking = false;
    
    // Transcriber
    // private SherpaOnnxTranscriber transcriber;
    private boolean shouldSendPcmData = false;
    private boolean shouldSendTranscript = false;
    
    // Executors for async operations
    private ExecutorService executorService = Executors.newCachedThreadPool();
    private ScheduledExecutorService scheduledExecutor = Executors.newScheduledThreadPool(2);
    private ScheduledFuture<?> sendStateWorkItem;
    
    // Inner classes
    public static class ViewState {
        public String topText;
        public String bottomText;
        public String title;
        public String layoutType;
        public String text;
        public String data;
        public Map<String, Object> animationData;
        
        public ViewState(String topText, String bottomText, String title, 
                        String layoutType, String text) {
            this.topText = topText;
            this.bottomText = bottomText;
            this.title = title;
            this.layoutType = layoutType;
            this.text = text;
        }
    }
    
    public static class ThirdPartyCloudApp {
        public String packageName;
        public String displayName;
        public boolean isActive;
        
        public ThirdPartyCloudApp(String packageName, String displayName, boolean isActive) {
            this.packageName = packageName;
            this.displayName = displayName;
            this.isActive = isActive;
        }
    }
    
    public enum SpeechRequiredDataType {
        PCM,
        TRANSCRIPTION,
        PCM_OR_TRANSCRIPTION
    }
    
    // Singleton getInstance
    public static synchronized MentraManager getInstance() {
        if (instance == null) {
            instance = new MentraManager();
        }
        return instance;
    }
    
    private MentraManager() {
        Log.d(TAG, "MentraManager: init()");
        initializeViewStates();
        // Initialize VAD
        // vad = new SileroVADStrategy();
        // TODO: Initialize transcriber
    }
    
    private void initializeViewStates() {
        viewStates = new ArrayList<>();
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", ""));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", 
            "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$"));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", ""));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", 
            "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$"));
    }
    
    // Setup and initialization
    public void setup(ReactApplicationContext context) {
        Log.d(TAG, "MentraManager: setup()");
        this.reactContext = context;
        // LocationManager.shared.setup();
        // MediaManager.shared.setup();
        setupVoiceDataHandling();
    }
    
    public void initManager(String wearable) {
        Log.d(TAG, "Initializing manager for wearable: " + wearable);
        
        // Initialize appropriate manager based on wearable type
        if (wearable.contains("G1")) {
            // if (g1Manager == null) {
            //     g1Manager = ERG1Manager.getInstance();
            // }
        } else if (wearable.contains("Live")) {
            // if (liveManager == null) {
            //     liveManager = new MentraLiveManager();
            // }
        } else if (wearable.contains("Mach1")) {
            // if (mach1Manager == null) {
            //     mach1Manager = new Mach1Manager();
            // }
        } else if (wearable.contains("Frame") || wearable.contains("Brilliant Labs")) {
            // if (frameManager == null) {
            //     frameManager = FrameManager.getInstance();
            // }
        }
        
        initManagerCallbacks();
    }
    
    private void initManagerCallbacks() {
        // TODO: Implement manager callbacks for connection state changes
        // This would set up listeners for each device manager
    }
    
    private void setupVoiceDataHandling() {
        // TODO: Set up voice data handling pipeline
    }
    
    // Audio methods
    public void playAudio(String requestId, String audioUrl, float volume, boolean stopOtherAudio) {
        Log.d(TAG, "AOS: playAudio bridge called for requestId: " + requestId);
        
        AudioManager audioManager = AudioManager.getInstance(reactContext);
        audioManager.playAudio(requestId, audioUrl, volume, stopOtherAudio);
    }
    
    public void stopAudio(String requestId) {
        Log.d(TAG, "AOS: stopAudio bridge called for requestId: " + requestId);
        
        AudioManager audioManager = AudioManager.getInstance(reactContext);
        audioManager.stopAudio(requestId);
    }
    
    public void stopAllAudio() {
        Log.d(TAG, "AOSManager: stopAllAudio bridge called");
        
        AudioManager audioManager = AudioManager.getInstance(reactContext);
        audioManager.stopAllAudio();
    }
    
    // Connection and status methods
    public void onConnectionAck() {
        handleRequestStatus();
        String isoDatetime = getCurrentIsoDatetime();
        // serverComms.sendUserDatetimeToBackend(isoDatetime);
    }
    
    public void onAppStateChange(List<ThirdPartyCloudApp> apps) {
        cachedThirdPartyAppList = apps;
        handleRequestStatus();
    }
    
    public void onConnectionError(String error) {
        handleRequestStatus();
    }
    
    public void onAuthError() {
        // Handle auth error
    }
    
    // Microphone state management
    public void handleMicrophoneStateChange(List<SpeechRequiredDataType> requiredData, boolean bypassVad) {
        Log.d(TAG, "MIC: changing mic with requiredData: " + requiredData + " bypassVad=" + bypassVad);
        
        bypassVadForPCM = bypassVad;
        shouldSendPcmData = false;
        shouldSendTranscript = false;
        
        if (requiredData.contains(SpeechRequiredDataType.PCM) && 
            requiredData.contains(SpeechRequiredDataType.TRANSCRIPTION)) {
            shouldSendPcmData = true;
            shouldSendTranscript = true;
        } else if (requiredData.contains(SpeechRequiredDataType.PCM)) {
            shouldSendPcmData = true;
            shouldSendTranscript = false;
        } else if (requiredData.contains(SpeechRequiredDataType.TRANSCRIPTION)) {
            shouldSendTranscript = true;
            shouldSendPcmData = false;
        } else if (requiredData.contains(SpeechRequiredDataType.PCM_OR_TRANSCRIPTION)) {
            if (enforceLocalTranscription) {
                shouldSendTranscript = true;
                shouldSendPcmData = false;
            } else {
                shouldSendPcmData = true;
                shouldSendTranscript = false;
            }
        }
        
        currentRequiredData = requiredData;
        vadBuffer.clear();
        micEnabled = !requiredData.isEmpty();
        
        // Update actual microphone state
        executorService.execute(() -> {
            updateMicrophoneState();
        });
    }
    
    private void updateMicrophoneState() {
        boolean actuallyEnabled = micEnabled && sensingEnabled;
        boolean glassesHasMic = getGlassesHasMic();
        boolean useGlassesMic = false;
        boolean useOnboardMic = false;
        
        useOnboardMic = preferredMic.equals("phone");
        useGlassesMic = preferredMic.equals("glasses");
        
        if (onboardMicUnavailable) {
            useOnboardMic = false;
        }
        
        if (!glassesHasMic) {
            useGlassesMic = false;
        }
        
        if (!useGlassesMic && !useOnboardMic) {
            if (glassesHasMic) {
                useGlassesMic = true;
            } else if (!onboardMicUnavailable) {
                useOnboardMic = true;
            }
            
            if (!useGlassesMic && !useOnboardMic) {
                Log.d(TAG, "No mic to use! Falling back to glasses mic");
                useGlassesMic = true;
            }
        }
        
        useGlassesMic = actuallyEnabled && useGlassesMic;
        useOnboardMic = actuallyEnabled && useOnboardMic;
        
        // Update device microphone state
        // if (g1Manager != null && g1Manager.isG1Ready()) {
        //     g1Manager.setMicEnabled(useGlassesMic);
        // }
        
        setOnboardMicEnabled(useOnboardMic);
    }
    
    private void setOnboardMicEnabled(boolean enabled) {
        // TODO: Implement onboard microphone control
    }
    
    // Display and UI methods
    public void handleDisplayEvent(Map<String, Object> event) {
        String view = (String) event.get("view");
        if (view == null) {
            Log.d(TAG, "Invalid view");
            return;
        }
        
        boolean isDashboard = "dashboard".equals(view);
        int stateIndex = isDashboard ? 1 : 0;
        
        Map<String, Object> layout = (Map<String, Object>) event.get("layout");
        if (layout == null) return;
        
        String layoutType = (String) layout.get("layoutType");
        String text = (String) layout.getOrDefault("text", " ");
        String topText = (String) layout.getOrDefault("topText", " ");
        String bottomText = (String) layout.getOrDefault("bottomText", " ");
        String title = (String) layout.getOrDefault("title", " ");
        String data = (String) layout.getOrDefault("data", "");
        
        text = parsePlaceholders(text);
        topText = parsePlaceholders(topText);
        bottomText = parsePlaceholders(bottomText);
        title = parsePlaceholders(title);
        
        ViewState newViewState = new ViewState(topText, bottomText, title, layoutType, text);
        newViewState.data = data;
        
        // Check if state actually changed
        ViewState currentState = viewStates.get(stateIndex);
        if (!hasStateChanged(currentState, newViewState)) {
            return;
        }
        
        Log.d(TAG, "Updating view state " + stateIndex + " with " + layoutType);
        viewStates.set(stateIndex, newViewState);
        
        // Send state if user is currently viewing it
        if ((stateIndex == 0 && !isHeadUp) || (stateIndex == 1 && isHeadUp)) {
            sendCurrentState(isDashboard);
        }
    }
    
    private boolean hasStateChanged(ViewState current, ViewState newState) {
        String currentStr = current.layoutType + current.text + current.topText + 
                           current.bottomText + current.title + (current.data != null ? current.data : "");
        String newStr = newState.layoutType + newState.text + newState.topText + 
                       newState.bottomText + newState.title + (newState.data != null ? newState.data : "");
        return !currentStr.equals(newStr);
    }
    
    private String parsePlaceholders(String text) {
        SimpleDateFormat dateFormatter = new SimpleDateFormat("M/dd, h:mm", Locale.US);
        String formattedDate = dateFormatter.format(new Date());
        
        SimpleDateFormat time12Format = new SimpleDateFormat("hh:mm", Locale.US);
        String time12 = time12Format.format(new Date());
        
        SimpleDateFormat time24Format = new SimpleDateFormat("HH:mm", Locale.US);
        String time24 = time24Format.format(new Date());
        
        SimpleDateFormat dateFormat = new SimpleDateFormat("MM/dd", Locale.US);
        String currentDate = dateFormat.format(new Date());
        
        Map<String, String> placeholders = new HashMap<>();
        placeholders.put("$no_datetime$", formattedDate);
        placeholders.put("$DATE$", currentDate);
        placeholders.put("$TIME12$", time12);
        placeholders.put("$TIME24$", time24);
        
        if (batteryLevel == -1) {
            placeholders.put("$GBATT$", "");
        } else {
            placeholders.put("$GBATT$", batteryLevel + "%");
        }
        
        placeholders.put("$CONNECTION_STATUS$", "Connected");
        
        String result = text;
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            result = result.replace(entry.getKey(), entry.getValue());
        }
        
        return result;
    }
    
    private void sendCurrentState(boolean isDashboard) {
        if (isUpdatingScreen) {
            return;
        }
        
        executeSendCurrentState(isDashboard);
    }
    
    private void executeSendCurrentState(boolean isDashboard) {
        executorService.execute(() -> {
            ViewState currentViewState = isDashboard ? viewStates.get(1) : viewStates.get(0);
            isHeadUp = isDashboard;
            
            if (isDashboard && !contextualDashboard) {
                return;
            }
            
            if (defaultWearable.contains("Simulated") || defaultWearable.isEmpty()) {
                return;
            }
            
            if (!isSomethingConnected()) {
                return;
            }
            
            if (sendStateWorkItem != null) {
                sendStateWorkItem.cancel(false);
            }
            
            String layoutType = currentViewState.layoutType;
            switch (layoutType) {
                case "text_wall":
                    sendText(currentViewState.text);
                    break;
                case "double_text_wall":
                    sendDoubleTextWall(currentViewState.topText, currentViewState.bottomText);
                    break;
                case "reference_card":
                    sendText(currentViewState.title + "\n\n" + currentViewState.text);
                    break;
                case "bitmap_view":
                    if (currentViewState.data != null) {
                        displayBitmap(currentViewState.data);
                    }
                    break;
                case "clear_view":
                    clearDisplay();
                    break;
                default:
                    Log.d(TAG, "Unhandled layout type: " + layoutType);
            }
        });
    }
    
    private void sendText(String text) {
        if (defaultWearable.contains("Simulated") || defaultWearable.isEmpty()) {
            return;
        }
        
        if (" ".equals(text) || text.isEmpty()) {
            clearDisplay();
            return;
        }
        
        // Send to appropriate device manager
        // if (g1Manager != null) g1Manager.sendTextWall(text);
        // if (mach1Manager != null) mach1Manager.sendTextWall(text);
        // if (frameManager != null) frameManager.displayTextWall(text);
    }
    
    private void sendDoubleTextWall(String topText, String bottomText) {
        // if (g1Manager != null) g1Manager.sendDoubleTextWall(topText, bottomText);
        // if (mach1Manager != null) mach1Manager.sendDoubleTextWall(topText, bottomText);
    }
    
    private void displayBitmap(String base64Data) {
        // if (g1Manager != null) g1Manager.displayBitmap(base64Data);
        // if (mach1Manager != null) mach1Manager.displayBitmap(base64Data);
    }
    
    private void clearDisplay() {
        // if (g1Manager != null) g1Manager.clearDisplay();
        // if (mach1Manager != null) mach1Manager.clearDisplay();
        // if (frameManager != null) frameManager.blankScreen();
        
        if (defaultWearable.contains("G1")) {
            // g1Manager.sendTextWall(" ");
            
            if (powerSavingMode) {
                if (sendStateWorkItem != null) {
                    sendStateWorkItem.cancel(false);
                }
                
                sendStateWorkItem = scheduledExecutor.schedule(() -> {
                    if (!isHeadUp) {
                        // g1Manager.clearDisplay();
                    }
                }, 3, TimeUnit.SECONDS);
            }
        }
    }
    
    // Settings and configuration
    public void setAuthCreds(String token, String userId) {
        Log.d(TAG, "Setting core token for user: " + userId);
        coreToken = token;
        coreTokenOwner = userId;
        handleRequestStatus();
    }
    
    public void disconnectWearable() {
        sendText(" ");
        executorService.execute(() -> {
            // if (g1Manager != null) g1Manager.disconnect();
            // if (liveManager != null) liveManager.disconnect();
            // if (mach1Manager != null) mach1Manager.disconnect();
            isSearching = false;
            handleRequestStatus();
        });
    }
    
    public void forgetSmartGlasses() {
        disconnectWearable();
        defaultWearable = "";
        deviceName = "";
        // if (g1Manager != null) g1Manager.forget();
        // if (mach1Manager != null) mach1Manager.forget();
        handleRequestStatus();
    }
    
    public void handleSearchForCompatibleDeviceNames(String modelName) {
        Log.d(TAG, "Searching for compatible device names for: " + modelName);
        
        if (modelName.contains("Simulated")) {
            defaultWearable = "Simulated Glasses";
            handleRequestStatus();
        } else if (modelName.contains("Audio")) {
            defaultWearable = "Audio Wearable";
            handleRequestStatus();
        } else if (modelName.contains("G1")) {
            pendingWearable = "Even Realities G1";
            initManager(pendingWearable);
            // g1Manager.findCompatibleDevices();
        } else if (modelName.contains("Live")) {
            pendingWearable = "Mentra Live";
            initManager(pendingWearable);
            // liveManager.findCompatibleDevices();
        } else if (modelName.contains("Mach1") || modelName.contains("Z100")) {
            pendingWearable = "Mach1";
            initManager(pendingWearable);
            // mach1Manager.findCompatibleDevices();
        }
    }
    
    public void handleConnectWearable(String deviceName, String modelName) {
        Log.d(TAG, "Connecting to modelName: " + modelName + " deviceName: " + deviceName);
        
        if (modelName != null) {
            pendingWearable = modelName;
        }
        
        if (pendingWearable.contains("Simulated")) {
            defaultWearable = "Simulated Glasses";
            handleRequestStatus();
            return;
        }
        
        if (pendingWearable.isEmpty() && defaultWearable.isEmpty()) {
            return;
        }
        
        if (pendingWearable.isEmpty() && !defaultWearable.isEmpty()) {
            pendingWearable = defaultWearable;
        }
        
        executorService.execute(() -> {
            disconnectWearable();
            
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            
            isSearching = true;
            handleRequestStatus();
            
            if (!deviceName.isEmpty()) {
                this.deviceName = deviceName;
            }
            
            initManager(pendingWearable);
            
            if (pendingWearable.contains("Live")) {
                // liveManager.connectById(this.deviceName);
            } else if (pendingWearable.contains("G1")) {
                // g1Manager.connectById(this.deviceName);
            } else if (pendingWearable.contains("Mach1")) {
                // mach1Manager.connectById(this.deviceName);
            }
        });
    }
    
    // Settings update methods
    public void enableContextualDashboard(boolean enabled) {
        contextualDashboard = enabled;
        handleRequestStatus();
    }
    
    public void setPreferredMic(String mic) {
        preferredMic = mic;
        handleMicrophoneStateChange(currentRequiredData, bypassVadForPCM);
        handleRequestStatus();
    }
    
    public void setButtonMode(String mode) {
        buttonPressMode = mode;
        // if (liveManager != null) {
        //     liveManager.sendButtonModeSetting();
        // }
        handleRequestStatus();
    }
    
    public void setButtonPhotoSize(String size) {
        buttonPhotoSize = size;
        // if (liveManager != null) {
        //     liveManager.sendButtonPhotoSettings();
        // }
        handleRequestStatus();
    }
    
    public void setButtonVideoSettings(int width, int height, int fps) {
        buttonVideoWidth = width;
        buttonVideoHeight = height;
        buttonVideoFps = fps;
        // if (liveManager != null) {
        //     liveManager.sendButtonVideoRecordingSettings();
        // }
        handleRequestStatus();
    }
    
    public void updateGlassesHeadUpAngle(int value) {
        headUpAngle = value;
        // if (g1Manager != null) {
        //     g1Manager.setHeadUpAngle(value);
        // }
        handleRequestStatus();
    }
    
    public void updateGlassesBrightness(int value, boolean autoBrightness) {
        boolean autoBrightnessChanged = this.autoBrightness != autoBrightness;
        brightness = value;
        this.autoBrightness = autoBrightness;
        
        executorService.execute(() -> {
            // if (mach1Manager != null) mach1Manager.setBrightness(value);
            // if (g1Manager != null) g1Manager.setBrightness(value, autoBrightness);
            
            if (autoBrightnessChanged) {
                sendText(autoBrightness ? "Enabled auto brightness" : "Disabled auto brightness");
            } else {
                sendText("Set brightness to " + value + "%");
            }
            
            try {
                Thread.sleep(800);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            sendText(" ");
        });
        
        handleRequestStatus();
    }
    
    public void updateGlassesDepth(int value) {
        dashboardDepth = value;
        // if (g1Manager != null) {
        //     g1Manager.setDashboardPosition(dashboardHeight, dashboardDepth);
        // }
        handleRequestStatus();
    }
    
    public void updateGlassesHeight(int value) {
        dashboardHeight = value;
        // if (g1Manager != null) {
        //     g1Manager.setDashboardPosition(dashboardHeight, dashboardDepth);
        // }
        handleRequestStatus();
    }
    
    public void enableSensing(boolean enabled) {
        sensingEnabled = enabled;
        handleMicrophoneStateChange(currentRequiredData, bypassVadForPCM);
        handleRequestStatus();
    }
    
    public void enablePowerSavingMode(boolean enabled) {
        powerSavingMode = enabled;
        handleRequestStatus();
    }
    
    public void enableAlwaysOnStatusBar(boolean enabled) {
        alwaysOnStatusBar = enabled;
        handleRequestStatus();
    }
    
    public void bypassVad(boolean enabled) {
        bypassVad = enabled;
        handleRequestStatus();
    }
    
    public void enforceLocalTranscription(boolean enabled) {
        enforceLocalTranscription = enabled;
        
        if (currentRequiredData.contains(SpeechRequiredDataType.PCM_OR_TRANSCRIPTION)) {
            if (enforceLocalTranscription) {
                shouldSendTranscript = true;
                shouldSendPcmData = false;
            } else {
                shouldSendPcmData = true;
                shouldSendTranscript = false;
            }
        }
        
        handleRequestStatus();
    }
    
    public void setBypassAudioEncoding(boolean enabled) {
        bypassAudioEncoding = enabled;
    }
    
    public void setMetricSystemEnabled(boolean enabled) {
        metricSystemEnabled = enabled;
        handleRequestStatus();
    }
    
    // Status reporting
    public void handleRequestStatus() {
        boolean g1Connected = false; // g1Manager != null && g1Manager.isG1Ready();
        boolean liveConnected = false; // liveManager != null && liveManager.isConnected();
        boolean mach1Connected = false; // mach1Manager != null && mach1Manager.isReady();
        boolean simulatedConnected = "Simulated Glasses".equals(defaultWearable);
        boolean isGlassesConnected = g1Connected || liveConnected || mach1Connected || simulatedConnected;
        
        if (isGlassesConnected) {
            isSearching = false;
        }
        
        Map<String, Object> glassesSettings = new HashMap<>();
        Map<String, Object> connectedGlasses = new HashMap<>();
        
        if (isGlassesConnected) {
            connectedGlasses.put("model_name", defaultWearable);
            connectedGlasses.put("battery_level", batteryLevel);
            // Add device-specific info
        }
        
        glassesSettings.put("brightness", brightness);
        glassesSettings.put("auto_brightness", autoBrightness);
        glassesSettings.put("dashboard_height", dashboardHeight);
        glassesSettings.put("dashboard_depth", dashboardDepth);
        glassesSettings.put("head_up_angle", headUpAngle);
        glassesSettings.put("button_mode", buttonPressMode);
        glassesSettings.put("button_photo_size", buttonPhotoSize);
        
        Map<String, Object> buttonVideoSettings = new HashMap<>();
        buttonVideoSettings.put("width", buttonVideoWidth);
        buttonVideoSettings.put("height", buttonVideoHeight);
        buttonVideoSettings.put("fps", buttonVideoFps);
        glassesSettings.put("button_video_settings", buttonVideoSettings);
        glassesSettings.put("button_camera_led", buttonCameraLed);
        
        String cloudConnectionStatus = "CONNECTED";
        
        Map<String, Object> coreInfo = new HashMap<>();
        coreInfo.put("augmentos_core_version", "Unknown");
        coreInfo.put("cloud_connection_status", cloudConnectionStatus);
        coreInfo.put("default_wearable", defaultWearable);
        coreInfo.put("preferred_mic", preferredMic);
        coreInfo.put("is_searching", isSearching);
        coreInfo.put("is_mic_enabled_for_frontend", micEnabled && "glasses".equals(preferredMic) && isSomethingConnected());
        coreInfo.put("sensing_enabled", sensingEnabled);
        coreInfo.put("power_saving_mode", powerSavingMode);
        coreInfo.put("always_on_status_bar", alwaysOnStatusBar);
        coreInfo.put("bypass_vad_for_debugging", bypassVad);
        coreInfo.put("enforce_local_transcription", enforceLocalTranscription);
        coreInfo.put("bypass_audio_encoding_for_debugging", bypassAudioEncoding);
        coreInfo.put("core_token", coreToken);
        coreInfo.put("puck_connected", true);
        coreInfo.put("metric_system_enabled", metricSystemEnabled);
        coreInfo.put("contextual_dashboard_enabled", contextualDashboard);
        
        List<Map<String, Object>> apps = new ArrayList<>();
        
        Map<String, Object> authObj = new HashMap<>();
        authObj.put("core_token_owner", coreTokenOwner);
        
        Map<String, Object> statusObj = new HashMap<>();
        statusObj.put("connected_glasses", connectedGlasses);
        statusObj.put("glasses_settings", glassesSettings);
        statusObj.put("apps", apps);
        statusObj.put("core_info", coreInfo);
        statusObj.put("auth", authObj);
        
        lastStatusObj = statusObj;
        
        Map<String, Object> wrapperObj = new HashMap<>();
        wrapperObj.put("status", statusObj);
        
        // Send status to React Native
        sendEventToReactNative("CoreMessageEvent", wrapperObj);
    }
    
    // Command handling
    public void handleCommand(String command) {
        Log.d(TAG, "Received command: " + command);
        
        try {
            JSONObject jsonCommand = new JSONObject(command);
            String commandType = jsonCommand.getString("command");
            JSONObject params = jsonCommand.optJSONObject("params");
            
            switch (commandType) {
                case "request_status":
                    handleRequestStatus();
                    break;
                case "connect_wearable":
                    if (params != null) {
                        String modelName = params.optString("model_name");
                        String deviceName = params.optString("device_name");
                        handleConnectWearable(deviceName, modelName);
                    }
                    break;
                case "disconnect_wearable":
                    disconnectWearable();
                    break;
                case "forget_smart_glasses":
                    forgetSmartGlasses();
                    break;
                case "search_for_compatible_device_names":
                    if (params != null) {
                        String modelName = params.getString("model_name");
                        handleSearchForCompatibleDeviceNames(modelName);
                    }
                    break;
                case "enable_contextual_dashboard":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        enableContextualDashboard(enabled);
                    }
                    break;
                case "set_preferred_mic":
                    if (params != null) {
                        String mic = params.getString("mic");
                        setPreferredMic(mic);
                    }
                    break;
                case "set_button_mode":
                    if (params != null) {
                        String mode = params.getString("mode");
                        setButtonMode(mode);
                    }
                    break;
                case "set_button_photo_size":
                    if (params != null) {
                        String size = params.getString("size");
                        setButtonPhotoSize(size);
                    }
                    break;
                case "set_button_video_settings":
                    if (params != null) {
                        int width = params.getInt("width");
                        int height = params.getInt("height");
                        int fps = params.getInt("fps");
                        setButtonVideoSettings(width, height, fps);
                    }
                    break;
                case "update_glasses_head_up_angle":
                    if (params != null) {
                        int angle = params.getInt("headUpAngle");
                        updateGlassesHeadUpAngle(angle);
                    }
                    break;
                case "update_glasses_brightness":
                    if (params != null) {
                        int brightness = params.getInt("brightness");
                        boolean autoBrightness = params.getBoolean("autoBrightness");
                        updateGlassesBrightness(brightness, autoBrightness);
                    }
                    break;
                case "update_glasses_height":
                    if (params != null) {
                        int height = params.getInt("height");
                        updateGlassesHeight(height);
                    }
                    break;
                case "update_glasses_depth":
                    if (params != null) {
                        int depth = params.getInt("depth");
                        updateGlassesDepth(depth);
                    }
                    break;
                case "enable_sensing":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        enableSensing(enabled);
                    }
                    break;
                case "enable_power_saving_mode":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        enablePowerSavingMode(enabled);
                    }
                    break;
                case "enable_always_on_status_bar":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        enableAlwaysOnStatusBar(enabled);
                    }
                    break;
                case "bypass_vad_for_debugging":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        bypassVad(enabled);
                    }
                    break;
                case "bypass_audio_encoding_for_debugging":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        setBypassAudioEncoding(enabled);
                    }
                    break;
                case "enforce_local_transcription":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        enforceLocalTranscription(enabled);
                    }
                    break;
                case "set_metric_system_enabled":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        setMetricSystemEnabled(enabled);
                    }
                    break;
                default:
                    Log.d(TAG, "Unknown command: " + commandType);
                    handleRequestStatus();
                    break;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing command JSON", e);
        }
    }
    
    // Helper methods
    private boolean isSomethingConnected() {
        // Check all device managers for connection
        // if (g1Manager != null && g1Manager.isG1Ready()) return true;
        // if (liveManager != null && liveManager.isConnected()) return true;
        // if (mach1Manager != null && mach1Manager.isReady()) return true;
        if (defaultWearable.contains("Simulated")) return true;
        return false;
    }
    
    private boolean getGlassesHasMic() {
        if (defaultWearable.contains("G1")) return true;
        if (defaultWearable.contains("Live")) return false;
        if (defaultWearable.contains("Mach1")) return false;
        return false;
    }
    
    private String getCurrentIsoDatetime() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        return sdf.format(new Date());
    }
    
    private void sendEventToReactNative(String eventName, Map<String, Object> params) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            try {
                WritableMap writableMap = Arguments.makeNativeMap(params);
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, writableMap);
            } catch (Exception e) {
                Log.e(TAG, "Error sending event to React Native", e);
            }
        }
    }
    
    // Cleanup
    public void cleanup() {
        // Clean up resources
        executorService.shutdown();
        scheduledExecutor.shutdown();
        
        try {
            if (!executorService.awaitTermination(800, TimeUnit.MILLISECONDS)) {
                executorService.shutdownNow();
            }
            if (!scheduledExecutor.awaitTermination(800, TimeUnit.MILLISECONDS)) {
                scheduledExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executorService.shutdownNow();
            scheduledExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}