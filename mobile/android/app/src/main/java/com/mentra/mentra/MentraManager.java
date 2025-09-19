package com.mentra.mentra;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.Base64;

import com.mentra.mentra.sgcs.SGCManager;
import com.mentra.mentra.sgcs.G1;

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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * MentraManager - Handles device management and connections to MentraOS servers
 * 1:1 match with iOS MentraManager.swift
 */
public class MentraManager {
    private static final String TAG = "MentraManager";
    private static final String MODULE_NAME = "MentraManager";
    private static MentraManager instance;
    
    // Core properties (matching Swift)
    private String coreToken = "";
    private String coreTokenOwner = "";
    private SGCManager sgc;
    
    private final Map<String, Object> lastStatusObj = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Runnable sendStateWorkItem;
    
    // Settings and state (matching Swift exactly)
    private String defaultWearable = "";
    private String pendingWearable = "";
    private String deviceName = "";
    private boolean contextualDashboard = true;
    private int headUpAngle = 30;
    private int brightness = 50;
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
    private CountDownLatch settingsLoadedLatch = new CountDownLatch(1);
    private boolean glassesWifiConnected = false;
    private String glassesWifiSsid = "";
    private boolean isHeadUp = false;
    
    // Mic settings (matching Swift)
    private boolean useOnboardMic = false;
    private String preferredMic = "glasses";
    private boolean offlineStt = false;
    private boolean micEnabled = false;
    private final List<String> currentRequiredData = new ArrayList<>();
    
    // Button settings (matching Swift)
    private String buttonPressMode = "photo";
    private String buttonPhotoSize = "medium";
    private int buttonVideoWidth = 1280;
    private int buttonVideoHeight = 720;
    private int buttonVideoFps = 30;
    private boolean buttonCameraLed = true;
    
    // VAD (matching Swift)
    private boolean isSpeaking = false;
    private final List<byte[]> vadBuffer = new ArrayList<>();
    
    // STT (matching Swift)
    private boolean shouldSendPcmData = false;
    private boolean shouldSendTranscript = false;
    
    // View states (matching Swift with 4 states)
    private final List<ViewState> viewStates = new ArrayList<>();
    
    // Constructor
    public MentraManager() {
        instance = this;
        initializeViewStates();
        Log.d(TAG, "Mentra: init()");
    }
    
    public String getName() {
        return MODULE_NAME;
    }
    
    public static MentraManager getInstance() {
        return instance;
    }
    
    private void initializeViewStates() {
        viewStates.clear();
        
        // Matching Swift's 4 view states exactly
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", "", null, null));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", 
                "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", null, null));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall", "", null, null));
        viewStates.add(new ViewState(" ", " ", " ", "text_wall",
                "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", null, null));
    }
    
    // MARK: - Public Methods (for React Native)
    
    public void setup() {
        Log.d(TAG, "Mentra: setup()");
    }
    
    public void initSGC(String wearable) {
        Log.d(TAG, "Initializing manager for wearable: " + wearable);
        
        if (wearable.contains("G1") && sgc == null) {
            sgc = new G1();
        }
        // Add other glasses types as needed (MentraLive, Mach1, Frame)
        
        if (sgc != null) {
            initSGCCallbacks();
        }
    }
    
    private void initSGCCallbacks() {
        // Initialize callbacks for SGC events
        // This would be implemented based on specific SGC implementations
    }
    
    public void updateHeadUp(boolean isHeadUp) {
        this.isHeadUp = isHeadUp;
        sendCurrentState(isHeadUp);
        Bridge.sendHeadPosition(isHeadUp);
    }
    
    public void onAppStateChange(List<Object> apps) {
        handle_request_status();
    }
    
    public void onConnectionError(String error) {
        handle_request_status();
    }
    
    public void onAuthError() {
        // Handle auth error
    }
    
    // MARK: - Voice Data Handling
    
    private void checkSetVadStatus(boolean speaking) {
        if (speaking != isSpeaking) {
            isSpeaking = speaking;
            Bridge.sendVadStatus(isSpeaking);
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
    
    public void handleGlassesMicData(String base64Data) {
        byte[] rawLC3Data = Base64.decode(base64Data, Base64.DEFAULT);
        
        if (rawLC3Data.length <= 2) {
            Log.d(TAG, "Received invalid PCM data size: " + rawLC3Data.length);
            return;
        }
        
        // Skip first 2 bytes which are command bytes
        byte[] lc3Data = new byte[rawLC3Data.length - 2];
        System.arraycopy(rawLC3Data, 2, lc3Data, 0, lc3Data.length);
        
        if (lc3Data.length == 0) {
            Log.d(TAG, "No LC3 data after removing command bytes");
            return;
        }
        
        if (bypassVad || bypassVadForPCM) {
            Log.d(TAG, "Mentra: Glasses mic VAD bypassed");
            checkSetVadStatus(true);
            emptyVadBuffer();
            // TODO: Implement PCM conversion
            // Bridge.sendMicData(pcmData);
            return;
        }
        
        // TODO: Implement VAD processing
    }
    
    public void handlePcm(String base64PcmData) {
        byte[] pcmData = Base64.decode(base64PcmData, Base64.DEFAULT);
        
        if (bypassVad || bypassVadForPCM) {
            if (shouldSendPcmData) {
                Bridge.sendMicData(pcmData);
            }
            
            if (shouldSendTranscript) {
                // TODO: Send to local transcriber
            }
            return;
        }
        
        // TODO: Implement VAD processing
    }
    
    public void handle_connection_state_change() {
        Log.d(TAG, "Mentra: Glasses connection state changed!");
        
        if (sgc == null) return;
        
        if (sgc.ready) {
            handleDeviceReady();
        } else {
            handleDeviceDisconnected();
            handle_request_status();
        }
    }
    
    private void handleDeviceReady() {
        Log.d(TAG, "Device ready");
        if (sgc != null) {
            sgc.setBrightness(brightness, autoBrightness);
            sgc.setHeadUpAngle(headUpAngle);
            sendButtonSettings();
        }
        handle_request_status();
    }
    
    private void handleDeviceDisconnected() {
        Log.d(TAG, "Device disconnected");
        isHeadUp = false;
        handle_request_status();
    }
    
    // MARK: - Handle methods (matching Swift)
    
    public void handle_microphone_state_change(List<String> requiredData, boolean bypassVad) {
        Log.d(TAG, "MIC: changing mic with requiredData: " + requiredData + " bypassVad=" + bypassVad);
        
        bypassVadForPCM = bypassVad;
        
        currentRequiredData.clear();
        currentRequiredData.addAll(requiredData);
        
        if (offlineStt && !requiredData.contains("PCM_OR_TRANSCRIPTION") && !requiredData.contains("TRANSCRIPTION")) {
            requiredData.add("TRANSCRIPTION");
        }
        
        shouldSendPcmData = false;
        shouldSendTranscript = false;
        
        if (requiredData.contains("PCM") && requiredData.contains("TRANSCRIPTION")) {
            shouldSendPcmData = true;
            shouldSendTranscript = true;
        } else if (requiredData.contains("PCM")) {
            shouldSendPcmData = true;
            shouldSendTranscript = false;
        } else if (requiredData.contains("TRANSCRIPTION")) {
            shouldSendTranscript = true;
            shouldSendPcmData = false;
        } else if (requiredData.contains("PCM_OR_TRANSCRIPTION")) {
            if (enforceLocalTranscription) {
                shouldSendTranscript = true;
                shouldSendPcmData = false;
            } else {
                shouldSendPcmData = true;
                shouldSendTranscript = false;
            }
        }
        
        vadBuffer.clear();
        micEnabled = !requiredData.isEmpty();
        
        updateMicrophoneState();
    }
    
    
    private void updateMicrophoneState() {
        boolean actuallyEnabled = micEnabled && sensingEnabled;
        boolean glassesHasMic = sgc != null && sgc.hasMic;
        
        boolean useGlassesMic = preferredMic.equals("glasses");
        boolean useOnboardMic = preferredMic.equals("phone");
        
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
                Log.d(TAG, "Mentra: no mic to use! falling back to glasses mic!");
                useGlassesMic = true;
            }
        }
        
        useGlassesMic = actuallyEnabled && useGlassesMic;
        useOnboardMic = actuallyEnabled && useOnboardMic;
        
        if (sgc != null && "g1".equals(sgc.type) && sgc.ready) {
            sgc.setMicEnabled(useGlassesMic);
        }
        
        setOnboardMicEnabled(useOnboardMic);
    }
    
    public void onJsonMessage(Map<String, Object> message) {
        Log.d(TAG, "onJsonMessage: " + message);
        if (sgc != null) {
            sgc.sendJson(message, false);
        }
    }
    
    public void handle_photo_request(String requestId, String appId, String size, String webhookUrl) {
        Log.d(TAG, "onPhotoRequest: " + requestId + ", " + appId + ", " + size);
        if (sgc != null) {
            sgc.requestPhoto(requestId, appId, size, webhookUrl);
        }
    }
    
    public void onRtmpStreamStartRequest(Map<String, Object> message) {
        Log.d(TAG, "onRtmpStreamStartRequest: " + message);
        if (sgc != null) {
            sgc.startRtmpStream(message);
        }
    }
    
    public void onRtmpStreamStop() {
        Log.d(TAG, "onRtmpStreamStop");
        if (sgc != null) {
            sgc.stopRtmpStream();
        }
    }
    
    public void onRtmpStreamKeepAlive(Map<String, Object> message) {
        Log.d(TAG, "onRtmpStreamKeepAlive: " + message);
        if (sgc != null) {
            sgc.sendRtmpKeepAlive(message);
        }
    }
    
    public void handle_start_buffer_recording() {
        Log.d(TAG, "onStartBufferRecording");
        if (sgc != null) {
            sgc.startBufferRecording();
        }
    }
    
    public void handle_stop_buffer_recording() {
        Log.d(TAG, "onStopBufferRecording");
        if (sgc != null) {
            sgc.stopBufferRecording();
        }
    }
    
    public void handle_save_buffer_video(String requestId, int durationSeconds) {
        Log.d(TAG, "onSaveBufferVideo: requestId=" + requestId + ", duration=" + durationSeconds);
        if (sgc != null) {
            sgc.saveBufferVideo(requestId, durationSeconds);
        }
    }
    
    public void handle_start_video_recording(String requestId, boolean save) {
        Log.d(TAG, "onStartVideoRecording: requestId=" + requestId + ", save=" + save);
        if (sgc != null) {
            sgc.startVideoRecording(requestId, save);
        }
    }
    
    public void handle_stop_video_recording(String requestId) {
        Log.d(TAG, "onStopVideoRecording: requestId=" + requestId);
        if (sgc != null) {
            sgc.stopVideoRecording(requestId);
        }
    }
    
    private void setOnboardMicEnabled(boolean enabled) {
        // TODO: Implement phone microphone control
    }
    
    public void clearState() {
        sendCurrentState(sgc != null && sgc.isHeadUp);
    }
    
    private void sendCurrentState(boolean isDashboard) {
        if (isUpdatingScreen) {
            return;
        }
        
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
            
            // Cancel any pending clear display work item
            if (sendStateWorkItem != null) {
                mainHandler.removeCallbacks(sendStateWorkItem);
            }
            
            String layoutType = currentViewState.layoutType;
            switch (layoutType) {
                case "text_wall":
                    sendText(currentViewState.text);
                    break;
                case "double_text_wall":
                    if (sgc != null) {
                        sgc.sendDoubleTextWall(currentViewState.topText, currentViewState.bottomText);
                    }
                    break;
                case "reference_card":
                    sendText(currentViewState.title + "\n\n" + currentViewState.text);
                    break;
                case "bitmap_view":
                    if (currentViewState.data != null && sgc != null) {
                        sgc.displayBitmap(currentViewState.data);
                    }
                    break;
                case "clear_view":
                    clearDisplay();
                    break;
                default:
                    Log.d(TAG, "UNHANDLED LAYOUT_TYPE " + layoutType);
            }
        });
    }
    
    private String parsePlaceholders(String text) {
        SimpleDateFormat dateFormatter = new SimpleDateFormat("M/dd, h:mm", Locale.getDefault());
        String formattedDate = dateFormatter.format(new Date());
        
        SimpleDateFormat time12Format = new SimpleDateFormat("hh:mm", Locale.getDefault());
        String time12 = time12Format.format(new Date());
        
        SimpleDateFormat time24Format = new SimpleDateFormat("HH:mm", Locale.getDefault());
        String time24 = time24Format.format(new Date());
        
        SimpleDateFormat dateFormat = new SimpleDateFormat("MM/dd", Locale.getDefault());
        String currentDate = dateFormat.format(new Date());
        
        Map<String, String> placeholders = new HashMap<>();
        placeholders.put("$no_datetime$", formattedDate);
        placeholders.put("$DATE$", currentDate);
        placeholders.put("$TIME12$", time12);
        placeholders.put("$TIME24$", time24);
        
        int batteryLevel = sgc != null ? sgc.batteryLevel : -1;
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
    
    public void handle_display_text(Map<String, Object> params) {
        String text = (String) params.get("text");
        if (text != null) {
            Log.d(TAG, "Displaying text: " + text);
            sendText(text);
        }
    }
    
    public void handle_display_event(Map<String, Object> event) {
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
        String text = parsePlaceholders(getString(layout, "text", " "));
        String topText = parsePlaceholders(getString(layout, "topText", " "));
        String bottomText = parsePlaceholders(getString(layout, "bottomText", " "));
        String title = parsePlaceholders(getString(layout, "title", " "));
        String data = (String) layout.get("data");
        
        ViewState newViewState = new ViewState(topText, bottomText, title, layoutType, text, data, null);
        
        if ("bitmap_animation".equals(layoutType)) {
            List<String> frames = (List<String>) layout.get("frames");
            Double interval = (Double) layout.get("interval");
            Boolean repeat = (Boolean) layout.get("repeat");
            
            Map<String, Object> animationData = new HashMap<>();
            if (frames != null && interval != null && repeat != null) {
                animationData.put("frames", frames);
                animationData.put("interval", interval);
                animationData.put("repeat", repeat);
                newViewState.animationData = animationData;
            }
        }
        
        ViewState currentState = viewStates.get(stateIndex);
        
        if (!statesEqual(currentState, newViewState)) {
            Log.d(TAG, "Updating view state " + stateIndex + " with " + layoutType);
            viewStates.set(stateIndex, newViewState);
            
            boolean headUp = isHeadUp;
            if (stateIndex == 0 && !headUp) {
                sendCurrentState(false);
            } else if (stateIndex == 1 && headUp) {
                sendCurrentState(true);
            }
        }
    }
    
    
    public void onRequestSingle(String dataType) {
        if ("battery".equals(dataType)) {
            // Send battery status if needed
        }
        handle_request_status();
    }
    
    public void onRouteChange(String reason, List<String> availableInputs) {
        Log.d(TAG, "Mentra: onRouteChange: reason: " + reason);
        Log.d(TAG, "Mentra: onRouteChange: inputs: " + availableInputs);
    }
    
    public void onInterruption(boolean began) {
        Log.d(TAG, "Mentra: Interruption: " + began);
        onboardMicUnavailable = began;
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM);
    }
    
    private void clearDisplay() {
        if (sgc != null) {
            sgc.sendTextWall(" ");
            
            if (powerSavingMode) {
                if (sendStateWorkItem != null) {
                    mainHandler.removeCallbacks(sendStateWorkItem);
                }
                
                Log.d(TAG, "Mentra: Clearing display after 3 seconds");
                sendStateWorkItem = () -> {
                    if (isHeadUp) {
                        return;
                    }
                    if (sgc != null) {
                        sgc.clearDisplay();
                    }
                };
                mainHandler.postDelayed(sendStateWorkItem, 3000);
            }
        }
    }
    
    private void sendText(String text) {
        if (sgc == null) {
            return;
        }
        
        if (" ".equals(text) || text.isEmpty()) {
            clearDisplay();
            return;
        }
        
        String parsed = parsePlaceholders(text);
        sgc.sendTextWall(parsed);
    }
    
    // Command functions (matching Swift)
    
    public void setAuthCreds(String token, String userId) {
        Log.d(TAG, "Mentra: Setting core token to: " + token + " for user: " + userId);
        setup();
        coreToken = token;
        coreTokenOwner = userId;
        handle_request_status();
    }
    
    public void disconnectWearable() {
        sendText(" ");
        sgc.disconnect();
        isSearching = false;
        handle_request_status();
    }
    
    public void forgetSmartGlasses() {
        disconnectWearable();
        defaultWearable = "";
        deviceName = "";
        if (sgc != null) {
            sgc.forget();
            sgc = null;
        }
        // TODO: Save settings
        handle_request_status();
    }
    
    public void handleSearchForCompatibleDeviceNames(String modelName) {
        Log.d(TAG, "Mentra: Searching for compatible device names for: " + modelName);
        if (modelName.contains("Simulated")) {
            defaultWearable = "Simulated Glasses";
            handle_request_status();
            return;
        }
        
        if (modelName.contains("G1")) {
            pendingWearable = "Even Realities G1";
        } else if (modelName.contains("Live")) {
            pendingWearable = "Mentra Live";
        } else if (modelName.contains("Mach1") || modelName.contains("Z100")) {
            pendingWearable = "Mach1";
        }
        
        initSGC(pendingWearable);
        if (sgc != null) {
            sgc.findCompatibleDevices();
        }
    }
    
    // Aliased for Bridge.java
    public void handle_search_for_compatible_device_names(String modelName) {
        handleSearchForCompatibleDeviceNames(modelName);
    }
    
    public void enableContextualDashboard(boolean enabled) {
        contextualDashboard = enabled;
        handle_request_status();
    }
    
    public void setPreferredMic(String mic) {
        preferredMic = mic;
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM);
        handle_request_status();
    }
    
    public void setButtonMode(String mode) {
        buttonPressMode = mode;
        if (sgc != null) {
            sgc.sendButtonModeSetting();
        }
        handle_request_status();
    }
    
    public void setButtonPhotoSize(String size) {
        buttonPhotoSize = size;
        if (sgc != null) {
            sgc.sendButtonPhotoSettings();
        }
        handle_request_status();
    }
    
    public void setButtonVideoSettings(int width, int height, int fps) {
        buttonVideoWidth = width;
        buttonVideoHeight = height;
        buttonVideoFps = fps;
        if (sgc != null) {
            sgc.sendButtonVideoRecordingSettings();
        }
        handle_request_status();
    }
    
    public void setButtonCameraLed(boolean enabled) {
        buttonCameraLed = enabled;
        if (sgc != null) {
            sgc.sendButtonCameraLedSetting();
        }
        handle_request_status();
    }
    
    public void setOfflineStt(boolean enabled) {
        offlineStt = enabled;
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM);
    }
    
    public void updateGlassesHeadUpAngle(int value) {
        headUpAngle = value;
        if (sgc != null) {
            sgc.setHeadUpAngle(value);
        }
        handle_request_status();
    }
    
    public void updateGlassesBrightness(int value, boolean autoMode) {
        boolean autoBrightnessChanged = this.autoBrightness != autoMode;
        brightness = value;
        this.autoBrightness = autoMode;
        
        executor.execute(() -> {
            if (sgc != null) {
                sgc.setBrightness(value, autoMode);
            }
            if (autoBrightnessChanged) {
                sendText(autoMode ? "Enabled auto brightness" : "Disabled auto brightness");
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
        
        handle_request_status();
    }
    
    public void updateGlassesDepth(int value) {
        dashboardDepth = value;
        if (sgc != null) {
            sgc.setDashboardPosition(dashboardHeight, dashboardDepth);
            Log.d(TAG, "Mentra: Set dashboard depth to " + value);
        }
        handle_request_status();
    }
    
    public void updateGlassesHeight(int value) {
        dashboardHeight = value;
        if (sgc != null) {
            sgc.setDashboardPosition(dashboardHeight, dashboardDepth);
            Log.d(TAG, "Mentra: Set dashboard height to " + value);
        }
        handle_request_status();
    }
    
    public void enableSensing(boolean enabled) {
        sensingEnabled = enabled;
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM);
        handle_request_status();
    }
    
    public void enablePowerSavingMode(boolean enabled) {
        powerSavingMode = enabled;
        handle_request_status();
    }
    
    public void enableAlwaysOnStatusBar(boolean enabled) {
        alwaysOnStatusBar = enabled;
        handle_request_status();
    }
    
    public void bypassVad(boolean enabled) {
        bypassVad = enabled;
        handle_request_status();
    }
    
    public void enforceLocalTranscription(boolean enabled) {
        enforceLocalTranscription = enabled;
        
        if (currentRequiredData.contains("PCM_OR_TRANSCRIPTION")) {
            if (enforceLocalTranscription) {
                shouldSendTranscript = true;
                shouldSendPcmData = false;
            } else {
                shouldSendPcmData = true;
                shouldSendTranscript = false;
            }
        }
        
        handle_request_status();
    }
    
    public void startBufferRecording() {
        if (sgc != null) {
            sgc.startBufferRecording();
        }
    }
    
    public void stopBufferRecording() {
        if (sgc != null) {
            sgc.stopBufferRecording();
        }
    }
    
    public void setBypassAudioEncoding(boolean enabled) {
        bypassAudioEncoding = enabled;
    }
    
    public void setMetricSystemEnabled(boolean enabled) {
        metricSystemEnabled = enabled;
        handle_request_status();
    }
    
    public void toggleUpdatingScreen(boolean enabled) {
        Log.d(TAG, "Mentra: Toggling updating screen: " + enabled);
        if (enabled) {
            if (sgc != null) {
                sgc.exit();
            }
            isUpdatingScreen = true;
        } else {
            isUpdatingScreen = false;
        }
    }
    
    public void showDashboard() {
        if (sgc != null) {
            sgc.showDashboard();
        }
    }
    
    public void saveBufferVideo(String requestId, int durationSeconds) {
        if (sgc != null) {
            sgc.saveBufferVideo(requestId, durationSeconds);
        }
    }
    
    public void startVideoRecording(String requestId, boolean save) {
        if (sgc != null) {
            sgc.startVideoRecording(requestId, save);
        }
    }
    
    public void stopVideoRecording(String requestId) {
        if (sgc != null) {
            sgc.stopVideoRecording(requestId);
        }
    }
    
    public void requestWifiScan() {
        Log.d(TAG, "Mentra: Requesting wifi scan");
        if (sgc != null) {
            sgc.requestWifiScan();
        }
    }
    
    public void sendWifiCredentials(String ssid, String password) {
        Log.d(TAG, "Mentra: Sending wifi credentials: " + ssid);
        if (sgc != null) {
            sgc.sendWifiCredentials(ssid, password);
        }
    }
    
    public void setGlassesHotspotState(boolean enabled) {
        Log.d(TAG, "Mentra: Setting glasses hotspot state: " + enabled);
        if (sgc != null) {
            sgc.sendHotspotState(enabled);
        }
    }
    
    public void queryGalleryStatus() {
        Log.d(TAG, "Mentra: Querying gallery status from glasses");
        if (sgc != null) {
            sgc.queryGalleryStatus();
        }
    }
    
    public void restartTranscriber() {
        Log.d(TAG, "Mentra: Restarting transcriber via command");
        // TODO: Implement transcriber restart
    }
    
    private boolean getGlassesHasMic() {
        if (defaultWearable.contains("G1")) {
            return true;
        }
        if (defaultWearable.contains("Live")) {
            return false;
        }
        if (defaultWearable.contains("Mach1")) {
            return false;
        }
        return false;
    }
    
    public void enableGlassesMic(boolean enabled) {
        if (sgc != null) {
            sgc.setMicEnabled(enabled);
        }
    }
    
    public void handle_request_status() {
        boolean simulatedConnected = "Simulated Glasses".equals(defaultWearable);
        boolean isGlassesConnected = sgc != null && sgc.ready;
        
        if (isGlassesConnected) {
            isSearching = false;
        }
        
        Map<String, Object> glassesSettings = new HashMap<>();
        Map<String, Object> connectedGlasses = new HashMap<>();
        
        if (isGlassesConnected) {
            connectedGlasses.put("model_name", defaultWearable);
            connectedGlasses.put("battery_level", sgc.batteryLevel);
            connectedGlasses.put("glasses_app_version", sgc.glassesAppVersion != null ? sgc.glassesAppVersion : "");
            connectedGlasses.put("glasses_build_number", sgc.glassesBuildNumber != null ? sgc.glassesBuildNumber : "");
            connectedGlasses.put("glasses_device_model", sgc.glassesDeviceModel != null ? sgc.glassesDeviceModel : "");
            connectedGlasses.put("glasses_android_version", sgc.glassesAndroidVersion != null ? sgc.glassesAndroidVersion : "");
            connectedGlasses.put("glasses_ota_version_url", sgc.glassesOtaVersionUrl != null ? sgc.glassesOtaVersionUrl : "");
        }
        
        if (simulatedConnected) {
            connectedGlasses.put("model_name", defaultWearable);
        }
        
        // G1 specific info
        if (sgc instanceof G1) {
            connectedGlasses.put("case_removed", sgc.caseRemoved);
            connectedGlasses.put("case_open", sgc.caseOpen);
            connectedGlasses.put("case_charging", sgc.caseCharging);
            if (sgc.caseBatteryLevel != null) {
                connectedGlasses.put("case_battery_level", sgc.caseBatteryLevel);
            }
            
            if (sgc.glassesSerialNumber != null && !sgc.glassesSerialNumber.isEmpty()) {
                connectedGlasses.put("glasses_serial_number", sgc.glassesSerialNumber);
                connectedGlasses.put("glasses_style", sgc.glassesStyle != null ? sgc.glassesStyle : "");
                connectedGlasses.put("glasses_color", sgc.glassesColor != null ? sgc.glassesColor : "");
            }
        }
        
        // MentraLive specific info (TODO: when MentraLive is implemented)
        
        // Bluetooth device name
        if (sgc != null) {
            String bluetoothName = sgc.getConnectedBluetoothName();
            if (bluetoothName != null) {
                connectedGlasses.put("bluetooth_name", bluetoothName);
            }
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
        
        Map<String, Object> coreInfo = new HashMap<>();
        coreInfo.put("augmentos_core_version", "Unknown");
        coreInfo.put("default_wearable", defaultWearable);
        coreInfo.put("preferred_mic", preferredMic);
        coreInfo.put("is_searching", isSearching);
        coreInfo.put("is_mic_enabled_for_frontend", 
                micEnabled && "glasses".equals(preferredMic) && isSomethingConnected());
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
        
        List<Object> apps = new ArrayList<>();
        
        Map<String, Object> authObj = new HashMap<>();
        authObj.put("core_token_owner", coreTokenOwner);
        
        Map<String, Object> statusObj = new HashMap<>();
        statusObj.put("connected_glasses", connectedGlasses);
        statusObj.put("glasses_settings", glassesSettings);
        statusObj.put("apps", apps);
        statusObj.put("core_info", coreInfo);
        statusObj.put("auth", authObj);
        
        Bridge.sendStatus(statusObj);
    }
    
    public void triggerStatusUpdate() {
        Log.d(TAG, "Triggering immediate status update");
        handle_request_status();
    }
    
    public void handle_update_settings(Map<String, Object> settings) {
        Log.d(TAG, "Mentra: Received update settings: " + settings);
        
        // Update settings with new values
        if (settings.containsKey("preferred_mic")) {
            String newPreferredMic = (String) settings.get("preferred_mic");
            if (newPreferredMic != null && !preferredMic.equals(newPreferredMic)) {
                setPreferredMic(newPreferredMic);
            }
        }
        
        if (settings.containsKey("head_up_angle")) {
            Integer newHeadUpAngle = (Integer) settings.get("head_up_angle");
            if (newHeadUpAngle != null && headUpAngle != newHeadUpAngle) {
                updateGlassesHeadUpAngle(newHeadUpAngle);
            }
        }
        
        if (settings.containsKey("brightness")) {
            Integer newBrightness = (Integer) settings.get("brightness");
            if (newBrightness != null && brightness != newBrightness) {
                updateGlassesBrightness(newBrightness, false);
            }
        }
        
        if (settings.containsKey("dashboard_height")) {
            Integer newDashboardHeight = (Integer) settings.get("dashboard_height");
            if (newDashboardHeight != null && dashboardHeight != newDashboardHeight) {
                updateGlassesHeight(newDashboardHeight);
            }
        }
        
        if (settings.containsKey("dashboard_depth")) {
            Integer newDashboardDepth = (Integer) settings.get("dashboard_depth");
            if (newDashboardDepth != null && dashboardDepth != newDashboardDepth) {
                updateGlassesDepth(newDashboardDepth);
            }
        }
        
        if (settings.containsKey("auto_brightness")) {
            Boolean newAutoBrightness = (Boolean) settings.get("auto_brightness");
            if (newAutoBrightness != null && autoBrightness != newAutoBrightness) {
                updateGlassesBrightness(brightness, newAutoBrightness);
            }
        }
        
        if (settings.containsKey("sensing_enabled")) {
            Boolean newSensingEnabled = (Boolean) settings.get("sensing_enabled");
            if (newSensingEnabled != null && sensingEnabled != newSensingEnabled) {
                enableSensing(newSensingEnabled);
            }
        }
        
        if (settings.containsKey("power_saving_mode")) {
            Boolean newPowerSavingMode = (Boolean) settings.get("power_saving_mode");
            if (newPowerSavingMode != null && powerSavingMode != newPowerSavingMode) {
                enablePowerSavingMode(newPowerSavingMode);
            }
        }
        
        if (settings.containsKey("always_on_status_bar_enabled")) {
            Boolean newAlwaysOnStatusBar = (Boolean) settings.get("always_on_status_bar_enabled");
            if (newAlwaysOnStatusBar != null && alwaysOnStatusBar != newAlwaysOnStatusBar) {
                enableAlwaysOnStatusBar(newAlwaysOnStatusBar);
            }
        }
        
        if (settings.containsKey("bypass_vad_for_debugging")) {
            Boolean newBypassVad = (Boolean) settings.get("bypass_vad_for_debugging");
            if (newBypassVad != null && bypassVad != newBypassVad) {
                bypassVad(newBypassVad);
            }
        }
        
        if (settings.containsKey("enforce_local_transcription")) {
            Boolean newEnforceLocalTranscription = (Boolean) settings.get("enforce_local_transcription");
            if (newEnforceLocalTranscription != null && enforceLocalTranscription != newEnforceLocalTranscription) {
                enforceLocalTranscription(newEnforceLocalTranscription);
            }
        }
        
        if (settings.containsKey("metric_system_enabled")) {
            Boolean newMetricSystemEnabled = (Boolean) settings.get("metric_system_enabled");
            if (newMetricSystemEnabled != null && metricSystemEnabled != newMetricSystemEnabled) {
                setMetricSystemEnabled(newMetricSystemEnabled);
            }
        }
        
        if (settings.containsKey("contextual_dashboard_enabled")) {
            Boolean newContextualDashboard = (Boolean) settings.get("contextual_dashboard_enabled");
            if (newContextualDashboard != null && contextualDashboard != newContextualDashboard) {
                enableContextualDashboard(newContextualDashboard);
            }
        }
        
        if (settings.containsKey("button_mode")) {
            String newButtonMode = (String) settings.get("button_mode");
            if (newButtonMode != null && !buttonPressMode.equals(newButtonMode)) {
                setButtonMode(newButtonMode);
            }
        }
        
        if (settings.containsKey("button_video_fps")) {
            Integer newFps = (Integer) settings.get("button_video_fps");
            if (newFps != null && buttonVideoFps != newFps) {
                setButtonVideoSettings(buttonVideoWidth, buttonVideoHeight, newFps);
            }
        }
        
        if (settings.containsKey("button_video_width")) {
            Integer newWidth = (Integer) settings.get("button_video_width");
            if (newWidth != null && buttonVideoWidth != newWidth) {
                setButtonVideoSettings(newWidth, buttonVideoHeight, buttonVideoFps);
            }
        }
        
        if (settings.containsKey("button_video_height")) {
            Integer newHeight = (Integer) settings.get("button_video_height");
            if (newHeight != null && buttonVideoHeight != newHeight) {
                setButtonVideoSettings(buttonVideoWidth, newHeight, buttonVideoFps);
            }
        }
        
        if (settings.containsKey("button_photo_size")) {
            String newPhotoSize = (String) settings.get("button_photo_size");
            if (newPhotoSize != null && !buttonPhotoSize.equals(newPhotoSize)) {
                setButtonPhotoSize(newPhotoSize);
            }
        }
        
        if (settings.containsKey("offline_stt")) {
            Boolean newOfflineStt = (Boolean) settings.get("offline_stt");
            if (newOfflineStt != null && offlineStt != newOfflineStt) {
                setOfflineStt(newOfflineStt);
            }
        }
        
        if (settings.containsKey("default_wearable")) {
            String newDefaultWearable = (String) settings.get("default_wearable");
            if (newDefaultWearable != null && !defaultWearable.equals(newDefaultWearable)) {
                defaultWearable = newDefaultWearable;
                // TODO: Save setting to SharedPreferences
            }
        }
    }
    
    // Bridge.java compatibility methods
    
    public void handle_connect_wearable(String deviceName, String modelName) {
        Log.d(TAG, "Connecting to wearable: " + deviceName + " model: " + modelName);
        defaultWearable = modelName != null ? modelName : deviceName;
        if (modelName != null) {
            initSGC(modelName);
        }
        if (sgc != null && deviceName != null && !deviceName.isEmpty()) {
            sgc.connectById(deviceName);
        }
    }
    
    // Utility methods
    
    private boolean isSomethingConnected() {
        return sgc != null && sgc.ready;
    }
    
    private boolean statesEqual(ViewState s1, ViewState s2) {
        String state1 = s1.layoutType + s1.text + s1.topText + s1.bottomText + s1.title + 
                        (s1.data != null ? s1.data : "");
        String state2 = s2.layoutType + s2.text + s2.topText + s2.bottomText + s2.title + 
                        (s2.data != null ? s2.data : "");
        return state1.equals(state2);
    }

    private String getString(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        return value instanceof String ? (String) value : defaultValue;
    }
    
    private void sendButtonSettings() {
        if (sgc != null) {
            sgc.sendButtonPhotoSettings();
            sgc.sendButtonModeSetting();
            sgc.sendButtonVideoRecordingSettings();
            sgc.sendButtonCameraLedSetting();
        }
    }
    
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
                        String layoutType, String text, String data, Map<String, Object> animationData) {
            this.topText = topText;
            this.bottomText = bottomText;
            this.title = title;
            this.layoutType = layoutType;
            this.text = text;
            this.data = data;
            this.animationData = animationData;
        }
    }
    
    public enum SpeechRequiredDataType {
        PCM,
        TRANSCRIPTION,
        PCM_OR_TRANSCRIPTION
    }
}
