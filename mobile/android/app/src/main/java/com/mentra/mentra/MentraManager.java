package com.mentra.mentra;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Android equivalent of iOS MentraManager.swift
 * Handles device management and connections to MentraOS servers
 */
public class MentraManager {
    private static final String TAG = "MentraManager";
    private static MentraManager instance;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Context context;
    
    // Core properties
    private String coreToken = "";
    private String coreTokenOwner = "";
    // private SGCManager sgc; // TODO: Implement SGCManager interface
    
    private Map<String, Object> lastStatusObj = new HashMap<>();
    
    // Settings and state
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
    private List<ViewState> viewStates = new ArrayList<>();
    
    // Mic settings
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
    
    // VAD
    private boolean isSpeaking = false;
    private List<byte[]> vadBuffer = new ArrayList<>();
    
    // Transcription
    private boolean shouldSendPcmData = false;
    private boolean shouldSendTranscript = false;
    
    // Inner classes
    public static class ViewState {
        public String topText;
        public String bottomText;
        public String title;
        public String layoutType;
        public String text;
        public String data;
        public Map<String, Object> animationData;
        
        public ViewState(String topText, String bottomText, String title, String layoutType, String text) {
            this.topText = topText;
            this.bottomText = bottomText;
            this.title = title;
            this.layoutType = layoutType;
            this.text = text;
            this.data = null;
            this.animationData = null;
        }
    }
    
    public static class ThirdPartyCloudApp {
        // TODO: Implement if needed
    }
    
    public enum SpeechRequiredDataType {
        PCM,
        TRANSCRIPTION,
        PCM_OR_TRANSCRIPTION
    }
    
    // Singleton instance
    public static synchronized MentraManager getInstance() {
        if (instance == null) {
            instance = new MentraManager();
        }
        return instance;
    }
    
    private MentraManager() {
        Bridge.log("Mentra: init()");
        initializeViewStates();
        // TODO: Initialize VAD and transcriber
    }
    
    private void initializeViewStates() {
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", ""));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", 
            "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$"));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", ""));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall",
            "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$"));
    }
    
    // Public methods for React Native
    
    public void setup(Context ctx) {
        Bridge.log("Mentra: setup()");
        this.context = ctx;
        // TODO: Initialize LocationManager equivalent
    }
    
    public void initManager(String wearable) {
        Bridge.log("Initializing manager for wearable: " + wearable);
        // TODO: Initialize specific SGC managers based on wearable type
        // if (wearable.contains("G1") && sgc == null) {
        //     sgc = new G1();
        // } else if (wearable.contains("Live") && sgc == null) {
        //     sgc = new MentraLive();
        // } else if (wearable.contains("Mach1") && sgc == null) {
        //     sgc = new Mach1();
        // } else if ((wearable.contains("Frame") || wearable.contains("Brilliant Labs")) && sgc == null) {
        //     sgc = new FrameManager();
        // }
    }
    
    public void initManagerCallbacks() {
        // TODO: Setup callbacks for SGC managers
    }
    
    public void updateHeadUp(boolean isHeadUp) {
        this.isHeadUp = isHeadUp;
        sendCurrentState(isHeadUp);
        Bridge.sendHeadPosition(isHeadUp);
    }
    
    public void onAppStateChange(List<ThirdPartyCloudApp> apps) {
        handleRequestStatus();
    }
    
    public void onConnectionError(String error) {
        handleRequestStatus();
    }
    
    public void onAuthError() {
        // Handle auth error
    }
    
    // Voice Data Handling
    
    private void checkSetVadStatus(boolean speaking) {
        if (speaking != isSpeaking) {
            isSpeaking = speaking;
            // Bridge.sendVadStatus(isSpeaking); // TODO: Implement in Bridge
        }
    }
    
    private void emptyVadBuffer() {
        while (!vadBuffer.isEmpty()) {
            byte[] chunk = vadBuffer.remove(0);
            Bridge.sendMicData(chunk);
        }
    }
    
    private void addToVadBuffer(byte[] chunk) {
        final int MAX_BUFFER_SIZE = 20;
        vadBuffer.add(chunk);
        while (vadBuffer.size() > MAX_BUFFER_SIZE) {
            vadBuffer.remove(0);
        }
    }
    
    public void handleGlassesMicData(byte[] rawLC3Data) {
        // TODO: Implement LC3 to PCM conversion and VAD processing
        Bridge.log("Mentra: handleGlassesMicData - not yet implemented");
    }
    
    public void handlePcm(byte[] pcmData) {
        // TODO: Implement PCM handling with VAD
        if (bypassVad || bypassVadForPCM) {
            if (shouldSendPcmData) {
                Bridge.sendMicData(pcmData);
            }
            // TODO: Send to local transcriber if shouldSendTranscript
            return;
        }
        // TODO: VAD processing
    }
    
    public void handleConnectionStateChange(boolean isConnected) {
        Bridge.log("Mentra: Glasses: connection state: " + isConnected);
        // TODO: Check SGC ready state
        // if (sgc != null) {
        //     if (sgc.ready) {
        //         handleDeviceReady();
        //     } else {
        //         handleDeviceDisconnected();
        //         handleRequestStatus();
        //     }
        // }
    }
    
    // ServerCommsCallback Implementation
    
    public void handleMicrophoneStateChange(List<SpeechRequiredDataType> requiredData, boolean bypassVad) {
        Bridge.log("Mentra: MIC: changing mic with requiredData: " + requiredData + " bypassVad=" + bypassVad);
        
        bypassVadForPCM = bypassVad;
        shouldSendPcmData = false;
        shouldSendTranscript = false;
        
        if (requiredData.contains(SpeechRequiredDataType.PCM) && requiredData.contains(SpeechRequiredDataType.TRANSCRIPTION)) {
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
        
        // TODO: Handle microphone state change
        executor.execute(() -> {
            boolean actuallyEnabled = micEnabled && sensingEnabled;
            // TODO: Check glasses mic capability and enable/disable accordingly
        });
    }
    
    public void onJsonMessage(Map<String, Object> message) {
        Bridge.log("Mentra: onJsonMessage: " + message);
        // TODO: Send to SGC
        // if (sgc != null) {
        //     sgc.sendJson(message, false);
        // }
    }
    
    public void onPhotoRequest(String requestId, String appId, String webhookUrl, String size) {
        Bridge.log("Mentra: onPhotoRequest: " + requestId + ", " + appId + ", " + webhookUrl + ", size=" + size);
        // TODO: Request photo from SGC
    }
    
    // Display handling
    
    public void clearState() {
        sendCurrentState(false); // TODO: Get actual head state from SGC
    }
    
    public void sendCurrentState(boolean isDashboard) {
        if (isUpdatingScreen) {
            return;
        }
        executeSendCurrentState(isDashboard);
    }
    
    private void executeSendCurrentState(boolean isDashboard) {
        executor.execute(() -> {
            ViewState currentViewState;
            if (isDashboard) {
                currentViewState = viewStates.get(1);
            } else {
                currentViewState = viewStates.get(0);
            }
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
            
            String layoutType = currentViewState.layoutType;
            switch (layoutType) {
                case "text_wall":
                    sendText(currentViewState.text);
                    break;
                case "double_text_wall":
                    // TODO: Send double text wall to SGC
                    break;
                case "reference_card":
                    sendText(currentViewState.title + "\n\n" + currentViewState.text);
                    break;
                case "bitmap_view":
                    Bridge.log("Mentra: Processing bitmap_view layout");
                    if (currentViewState.data != null) {
                        // TODO: Display bitmap on SGC
                    }
                    break;
                case "clear_view":
                    Bridge.log("Mentra: Processing clear_view layout - clearing display");
                    clearDisplay();
                    break;
                default:
                    Bridge.log("UNHANDLED LAYOUT_TYPE " + layoutType);
            }
        });
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
    
    public void handleDisplayEvent(Map<String, Object> event) {
        String view = (String) event.get("view");
        if (view == null) {
            Bridge.log("Mentra: invalid view");
            return;
        }
        boolean isDashboard = "dashboard".equals(view);
        
        int stateIndex = isDashboard ? 1 : 0;
        
        Map<String, Object> layout = (Map<String, Object>) event.get("layout");
        if (layout == null) return;
        
        String layoutType = (String) layout.get("layoutType");
        String text = layout.get("text") != null ? (String) layout.get("text") : " ";
        String topText = layout.get("topText") != null ? (String) layout.get("topText") : " ";
        String bottomText = layout.get("bottomText") != null ? (String) layout.get("bottomText") : " ";
        String title = layout.get("title") != null ? (String) layout.get("title") : " ";
        String data = layout.get("data") != null ? (String) layout.get("data") : "";
        
        text = parsePlaceholders(text);
        topText = parsePlaceholders(topText);
        bottomText = parsePlaceholders(bottomText);
        title = parsePlaceholders(title);
        
        ViewState newViewState = new ViewState(topText, bottomText, title, layoutType, text);
        newViewState.data = data;
        
        if ("bitmap_animation".equals(layoutType)) {
            // TODO: Handle animation data
        }
        
        ViewState currentState = viewStates.get(stateIndex);
        String currentStateStr = currentState.layoutType + currentState.text + currentState.topText + 
                                currentState.bottomText + currentState.title + (currentState.data != null ? currentState.data : "");
        String newStateStr = newViewState.layoutType + newViewState.text + newViewState.topText + 
                            newViewState.bottomText + newViewState.title + (newViewState.data != null ? newViewState.data : "");
        
        if (currentStateStr.equals(newStateStr)) {
            return;
        }
        
        Bridge.log("Updating view state " + stateIndex + " with " + layoutType + " " + text + " " + topText + " " + bottomText);
        viewStates.set(stateIndex, newViewState);
        
        boolean headUp = isHeadUp;
        if (stateIndex == 0 && !headUp) {
            sendCurrentState(false);
        } else if (stateIndex == 1 && headUp) {
            sendCurrentState(true);
        }
    }
    
    // Command functions
    
    public void setAuthCreds(String token, String userId) {
        Bridge.log("Mentra: Setting core token to: " + token + " for user: " + userId);
        setup(context);
        coreToken = token;
        coreTokenOwner = userId;
        handleRequestStatus();
    }
    
    public void disconnectWearable() {
        sendText(" ");
        executor.execute(() -> {
            // TODO: Cancel connect task and disconnect SGC
            isSearching = false;
            handleRequestStatus();
        });
    }
    
    public void forgetSmartGlasses() {
        disconnectWearable();
        defaultWearable = "";
        deviceName = "";
        // TODO: Forget SGC
        handleRequestStatus();
    }
    
    public void handleSearchForCompatibleDeviceNames(String modelName) {
        Bridge.log("Mentra: Searching for compatible device names for: " + modelName);
        if (modelName.contains("Simulated")) {
            defaultWearable = "Simulated Glasses";
            handleRequestStatus();
            return;
        }
        if (modelName.contains("G1")) {
            pendingWearable = "Even Realities G1";
        } else if (modelName.contains("Live")) {
            pendingWearable = "Mentra Live";
        } else if (modelName.contains("Mach1") || modelName.contains("Z100")) {
            pendingWearable = "Mach1";
        }
        initManager(pendingWearable);
        // TODO: Find compatible devices with SGC
    }
    
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
        // TODO: Send to SGC
        handleRequestStatus();
    }
    
    public void setButtonPhotoSize(String size) {
        buttonPhotoSize = size;
        // TODO: Send to SGC
        handleRequestStatus();
    }
    
    public void setButtonVideoSettings(int width, int height, int fps) {
        buttonVideoWidth = width;
        buttonVideoHeight = height;
        buttonVideoFps = fps;
        // TODO: Send to SGC
        handleRequestStatus();
    }
    
    public void updateGlassesHeadUpAngle(int value) {
        headUpAngle = value;
        // TODO: Send to SGC
        handleRequestStatus();
    }
    
    public void updateGlassesBrightness(int value, boolean autoBrightness) {
        boolean autoBrightnessChanged = this.autoBrightness != autoBrightness;
        brightness = value;
        this.autoBrightness = autoBrightness;
        executor.execute(() -> {
            // TODO: Send to SGC
            if (autoBrightnessChanged) {
                sendText(autoBrightness ? "Enabled auto brightness" : "Disabled auto brightness");
            } else {
                sendText("Set brightness to " + value + "%");
            }
            try {
                Thread.sleep(800);
            } catch (InterruptedException e) {
                // Ignore
            }
            sendText(" ");
        });
        handleRequestStatus();
    }
    
    public void updateGlassesDepth(int value) {
        dashboardDepth = value;
        // TODO: Send to SGC
        handleRequestStatus();
    }
    
    public void updateGlassesHeight(int value) {
        dashboardHeight = value;
        // TODO: Send to SGC
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
    
    public void handleConnectWearable(String deviceName, String modelName) {
        Bridge.log("Mentra: Connecting to modelName: " + modelName + " deviceName: " + deviceName);
        
        if (modelName != null && !modelName.isEmpty()) {
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
        
        executor.execute(() -> {
            disconnectWearable();
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                // Ignore
            }
            isSearching = true;
            handleRequestStatus();
            
            if (!deviceName.isEmpty()) {
                this.deviceName = deviceName;
            }
            
            initManager(pendingWearable);
            // TODO: Connect by ID with SGC
        });
    }
    
    public void handleRequestStatus() {
        boolean simulatedConnected = "Simulated Glasses".equals(defaultWearable);
        boolean isGlassesConnected = false; // TODO: Get from SGC
        if (isGlassesConnected) {
            isSearching = false;
        }
        
        Map<String, Object> glassesSettings = new HashMap<>();
        Map<String, Object> connectedGlasses = new HashMap<>();
        
        if (isGlassesConnected) {
            connectedGlasses.put("model_name", defaultWearable);
            connectedGlasses.put("battery_level", batteryLevel);
            // TODO: Get version info from SGC
        }
        
        if (simulatedConnected) {
            connectedGlasses.put("model_name", defaultWearable);
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
        
        try {
            JSONObject jsonObject = new JSONObject(wrapperObj);
            String jsonString = jsonObject.toString();
            Bridge.sendEvent("CoreMessageEvent", jsonString);
        } catch (Exception e) {
            Bridge.log("Mentra: Error converting to JSON: " + e.getMessage());
        }
    }
    
    // Helper methods
    
    private void clearDisplay() {
        // TODO: Clear display on SGC
        sendText(" ");
        
        if (powerSavingMode) {
            // TODO: Schedule delayed clear
        }
    }
    
    private void sendText(String text) {
        // TODO: Send text to SGC
        if (text.isEmpty() || " ".equals(text)) {
            clearDisplay();
            return;
        }
        // TODO: Send to SGC
    }
    
    private boolean isSomethingConnected() {
        // TODO: Check SGC ready state
        if (defaultWearable.contains("Simulated")) {
            return true;
        }
        return false;
    }
    
    private void handleDeviceReady() {
        // TODO: Send battery status
        // TODO: Send connection state
        
        if (pendingWearable.contains("Live")) {
            handleLiveReady();
        } else if (pendingWearable.contains("G1")) {
            handleG1Ready();
        } else if (defaultWearable.contains("Mach1")) {
            handleMach1Ready();
        }
        
        Bridge.saveSetting("default_wearable", defaultWearable);
        Bridge.saveSetting("device_name", deviceName);
    }
    
    private void handleG1Ready() {
        isSearching = false;
        defaultWearable = "Even Realities G1";
        handleRequestStatus();
        
        executor.execute(() -> {
            try {
                Thread.sleep(1000);
                // TODO: Configure SGC settings
                sendText("// BOOTING MENTRAOS");
                Thread.sleep(400);
                // TODO: Send settings to glasses
                sendText("// MENTRAOS CONNECTED");
                Thread.sleep(1000);
                sendText(" ");
                handleRequestStatus();
            } catch (InterruptedException e) {
                // Ignore
            }
        });
    }
    
    private void handleLiveReady() {
        Bridge.log("Mentra: Mentra Live device ready");
        isSearching = false;
        defaultWearable = "Mentra Live";
        handleRequestStatus();
    }
    
    private void handleMach1Ready() {
        Bridge.log("Mentra: Mach1 device ready");
        isSearching = false;
        defaultWearable = "Mentra Mach1";
        handleRequestStatus();
        
        executor.execute(() -> {
            sendText("MENTRAOS CONNECTED");
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                // Ignore
            }
            clearDisplay();
            handleRequestStatus();
        });
    }
    
    private void handleDeviceDisconnected() {
        Bridge.log("Mentra: Device disconnected");
        handleMicrophoneStateChange(new ArrayList<>(), false);
        // TODO: Send disconnection state
        handleRequestStatus();
    }
    
    // Cleanup
    public void cleanup() {
        // TODO: Clean up resources
        executor.shutdown();
    }
}