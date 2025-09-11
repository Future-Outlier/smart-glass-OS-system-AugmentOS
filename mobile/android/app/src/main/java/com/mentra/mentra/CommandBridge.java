package com.mentra.mentra;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CommandBridge handles command processing between React Native and native Android code
 * This is the Android equivalent of the iOS CommandBridge.swift
 */
public class CommandBridge {
    private static final String TAG = "CommandBridge";
    private static CommandBridge instance;
    private MentraManager mentraManager;
    
    // Command types enum
    public enum CommandType {
        SET_AUTH_SECRET_KEY("set_auth_secret_key"),
        REQUEST_STATUS("request_status"),
        CONNECT_WEARABLE("connect_wearable"),
        DISCONNECT_WEARABLE("disconnect_wearable"),
        SEARCH_FOR_COMPATIBLE_DEVICE_NAMES("search_for_compatible_device_names"),
        ENABLE_CONTEXTUAL_DASHBOARD("enable_contextual_dashboard"),
        SET_PREFERRED_MIC("set_preferred_mic"),
        SET_BUTTON_MODE("set_button_mode"),
        SET_BUTTON_PHOTO_SIZE("set_button_photo_size"),
        SET_BUTTON_VIDEO_SETTINGS("set_button_video_settings"),
        SET_BUTTON_CAMERA_LED("set_button_camera_led"),
        PING("ping"),
        FORGET_SMART_GLASSES("forget_smart_glasses"),
        START_APP("start_app"),
        STOP_APP("stop_app"),
        UPDATE_GLASSES_HEAD_UP_ANGLE("update_glasses_head_up_angle"),
        UPDATE_GLASSES_BRIGHTNESS("update_glasses_brightness"),
        UPDATE_GLASSES_DEPTH("update_glasses_depth"),
        UPDATE_GLASSES_HEIGHT("update_glasses_height"),
        ENABLE_SENSING("enable_sensing"),
        ENABLE_POWER_SAVING_MODE("enable_power_saving_mode"),
        ENABLE_ALWAYS_ON_STATUS_BAR("enable_always_on_status_bar"),
        BYPASS_VAD_FOR_DEBUGGING("bypass_vad_for_debugging"),
        BYPASS_AUDIO_ENCODING_FOR_DEBUGGING("bypass_audio_encoding_for_debugging"),
        ENFORCE_LOCAL_TRANSCRIPTION("enforce_local_transcription"),
        SET_SERVER_URL("set_server_url"),
        SET_METRIC_SYSTEM_ENABLED("set_metric_system_enabled"),
        TOGGLE_UPDATING_SCREEN("toggle_updating_screen"),
        SHOW_DASHBOARD("show_dashboard"),
        REQUEST_WIFI_SCAN("request_wifi_scan"),
        SEND_WIFI_CREDENTIALS("send_wifi_credentials"),
        SET_HOTSPOT_STATE("set_hotspot_state"),
        QUERY_GALLERY_STATUS("query_gallery_status"),
        SIMULATE_HEAD_POSITION("simulate_head_position"),
        SIMULATE_BUTTON_PRESS("simulate_button_press"),
        START_BUFFER_RECORDING("start_buffer_recording"),
        STOP_BUFFER_RECORDING("stop_buffer_recording"),
        SAVE_BUFFER_VIDEO("save_buffer_video"),
        START_VIDEO_RECORDING("start_video_recording"),
        STOP_VIDEO_RECORDING("stop_video_recording"),
        SET_STT_MODEL_DETAILS("set_stt_model_details"),
        GET_STT_MODEL_PATH("get_stt_model_path"),
        CHECK_STT_MODEL_AVAILABLE("check_stt_model_available"),
        VALIDATE_STT_MODEL("validate_stt_model"),
        EXTRACT_TAR_BZ2("extract_tar_bz2"),
        SETUP("setup"),
        DISPLAY_EVENT("display_event"),
        UPDATE_SETTINGS("update_settings"),
        MICROPHONE_STATE_CHANGE("microphone_state_change"),
        RESTART_TRANSCRIBER("restart_transcriber"),
        CONNECT_LIVEKIT("connect_livekit"),
        UNKNOWN("unknown");
        
        private final String value;
        
        CommandType(String value) {
            this.value = value;
        }
        
        public String getValue() {
            return value;
        }
        
        public static CommandType fromString(String text) {
            for (CommandType type : CommandType.values()) {
                if (type.value.equalsIgnoreCase(text)) {
                    return type;
                }
            }
            return UNKNOWN;
        }
    }
    
    // Singleton getInstance
    public static synchronized CommandBridge getInstance() {
        if (instance == null) {
            instance = new CommandBridge();
        }
        return instance;
    }
    
    private CommandBridge() {
        mentraManager = MentraManager.getInstance();
    }
    
    /**
     * Handle command from React Native
     * @param command JSON string containing the command and parameters
     * @return Object result of the command execution (can be boolean, string, int, etc.)
     */
    public Object handleCommand(String command) {
        // Log.d(TAG, "Received command: " + command);
        
        try {
            JSONObject jsonCommand = new JSONObject(command);
            String commandString = jsonCommand.getString("command");
            JSONObject params = jsonCommand.optJSONObject("params");
            
            CommandType commandType = CommandType.fromString(commandString);
            
            switch (commandType) {
                case SETUP:
                    mentraManager.setup(null);
                    break;
                    
                case SET_AUTH_SECRET_KEY:
                    if (params != null) {
                        String userId = params.getString("userId");
                        String authSecretKey = params.getString("authSecretKey");
                        mentraManager.setAuthCreds(authSecretKey, userId);
                    }
                    break;
                    
                case DISPLAY_EVENT:
                    if (params != null) {
                        Map<String, Object> displayEvent = jsonObjectToMap(params);
                        mentraManager.handleDisplayEvent(displayEvent);
                    }
                    break;
                    
                case REQUEST_STATUS:
                    mentraManager.handleRequestStatus();
                    break;
                    
                case CONNECT_WEARABLE:
                    if (params != null) {
                        String modelName = params.optString("model_name", "");
                        String deviceName = params.optString("device_name", "");
                        mentraManager.handleConnectWearable(deviceName, modelName);
                    } else {
                        mentraManager.handleConnectWearable("", null);
                    }
                    break;
                    
                case DISCONNECT_WEARABLE:
                    mentraManager.disconnectWearable();
                    break;
                    
                case FORGET_SMART_GLASSES:
                    mentraManager.forgetSmartGlasses();
                    break;
                    
                case SEARCH_FOR_COMPATIBLE_DEVICE_NAMES:
                    if (params != null) {
                        String modelName = params.getString("model_name");
                        mentraManager.handleSearchForCompatibleDeviceNames(modelName);
                    }
                    break;
                    
                case ENABLE_CONTEXTUAL_DASHBOARD:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enableContextualDashboard(enabled);
                    }
                    break;
                    
                case SET_PREFERRED_MIC:
                    if (params != null) {
                        String mic = params.getString("mic");
                        mentraManager.setPreferredMic(mic);
                    }
                    break;
                    
                case SET_BUTTON_MODE:
                    if (params != null) {
                        String mode = params.getString("mode");
                        mentraManager.setButtonMode(mode);
                    }
                    break;
                    
                case SET_BUTTON_PHOTO_SIZE:
                    if (params != null) {
                        String size = params.getString("size");
                        mentraManager.setButtonPhotoSize(size);
                    }
                    break;
                    
                case SET_BUTTON_VIDEO_SETTINGS:
                    if (params != null) {
                        int width = params.getInt("width");
                        int height = params.getInt("height");
                        int fps = params.getInt("fps");
                        mentraManager.setButtonVideoSettings(width, height, fps);
                    }
                    break;
                    
                case SET_BUTTON_CAMERA_LED:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        // mentraManager.setButtonCameraLed(enabled);
                    }
                    break;
                    
                case START_APP:
                    if (params != null) {
                        String target = params.getString("target");
                        // mentraManager.startApp(target);
                    }
                    break;
                    
                case STOP_APP:
                    if (params != null) {
                        String target = params.getString("target");
                        // mentraManager.stopApp(target);
                    }
                    break;
                    
                case UPDATE_GLASSES_HEAD_UP_ANGLE:
                    if (params != null) {
                        int angle = params.getInt("headUpAngle");
                        mentraManager.updateGlassesHeadUpAngle(angle);
                    }
                    break;
                    
                case UPDATE_GLASSES_BRIGHTNESS:
                    if (params != null) {
                        int brightness = params.getInt("brightness");
                        boolean autoBrightness = params.getBoolean("autoBrightness");
                        mentraManager.updateGlassesBrightness(brightness, autoBrightness);
                    }
                    break;
                    
                case UPDATE_GLASSES_HEIGHT:
                    if (params != null) {
                        int height = params.getInt("height");
                        mentraManager.updateGlassesHeight(height);
                    }
                    break;
                    
                case SHOW_DASHBOARD:
                    // mentraManager.sendCurrentState(true);
                    break;
                    
                case UPDATE_GLASSES_DEPTH:
                    if (params != null) {
                        int depth = params.getInt("depth");
                        mentraManager.updateGlassesDepth(depth);
                    }
                    break;
                    
                case ENABLE_SENSING:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enableSensing(enabled);
                    }
                    break;
                    
                case ENABLE_POWER_SAVING_MODE:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enablePowerSavingMode(enabled);
                    }
                    break;
                    
                case ENABLE_ALWAYS_ON_STATUS_BAR:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enableAlwaysOnStatusBar(enabled);
                    }
                    break;
                    
                case BYPASS_VAD_FOR_DEBUGGING:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.bypassVad(enabled);
                    }
                    break;
                    
                case BYPASS_AUDIO_ENCODING_FOR_DEBUGGING:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.setBypassAudioEncoding(enabled);
                    }
                    break;
                    
                case SET_METRIC_SYSTEM_ENABLED:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.setMetricSystemEnabled(enabled);
                    }
                    break;
                    
                case TOGGLE_UPDATING_SCREEN:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        // mentraManager.toggleUpdatingScreen(enabled);
                    }
                    break;
                    
                case REQUEST_WIFI_SCAN:
                    // mentraManager.requestWifiScan();
                    break;
                    
                case SEND_WIFI_CREDENTIALS:
                    if (params != null) {
                        String ssid = params.getString("ssid");
                        String password = params.getString("password");
                        // mentraManager.sendWifiCredentials(ssid, password);
                    }
                    break;
                    
                case SET_HOTSPOT_STATE:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        // mentraManager.setGlassesHotspotState(enabled);
                    }
                    break;
                    
                case QUERY_GALLERY_STATUS:
                    Log.d(TAG, "Querying gallery status");
                    // mentraManager.queryGalleryStatus();
                    break;
                    
                // case SIMULATE_HEAD_POSITION:
                //     if (params != null) {
                //         String position = params.getString("position");
                //         // ServerComms.getInstance().sendHeadPosition("up".equals(position));
                //         mentraManager.sendCurrentState("up".equals(position));
                //     }
                //     break;
                    
                // case SIMULATE_BUTTON_PRESS:
                //     if (params != null) {
                //         String buttonId = params.getString("buttonId");
                //         String pressType = params.getString("pressType");
                //         // ServerComms.getInstance().sendButtonPress(buttonId, pressType);
                //     }
                //     break;
                    
                case ENFORCE_LOCAL_TRANSCRIPTION:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enforceLocalTranscription(enabled);
                    }
                    break;
                    
                case START_BUFFER_RECORDING:
                    Log.d(TAG, "Starting buffer recording");
                    // mentraManager.startBufferRecording();
                    break;
                    
                case STOP_BUFFER_RECORDING:
                    Log.d(TAG, "Stopping buffer recording");
                    // mentraManager.stopBufferRecording();
                    break;
                    
                case SAVE_BUFFER_VIDEO:
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        int durationSeconds = params.getInt("duration_seconds");
                        Log.d(TAG, "Saving buffer video: requestId=" + requestId + ", duration=" + durationSeconds + "s");
                        // mentraManager.saveBufferVideo(requestId, durationSeconds);
                    }
                    break;
                    
                case START_VIDEO_RECORDING:
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        boolean save = params.getBoolean("save");
                        Log.d(TAG, "Starting video recording: requestId=" + requestId + ", save=" + save);
                        // mentraManager.startVideoRecording(requestId, save);
                    }
                    break;
                    
                case STOP_VIDEO_RECORDING:
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        Log.d(TAG, "Stopping video recording: requestId=" + requestId);
                        // mentraManager.stopVideoRecording(requestId);
                    }
                    break;
                    
                case SET_STT_MODEL_DETAILS:
                    if (params != null) {
                        String path = params.getString("path");
                        String languageCode = params.getString("languageCode");
                        // mentraManager.setSttModelDetails(path, languageCode);
                    }
                    break;
                    
                case GET_STT_MODEL_PATH:
                    // return mentraManager.getSttModelPath();
                    return "";
                    
                case CHECK_STT_MODEL_AVAILABLE:
                    // return mentraManager.checkSTTModelAvailable();
                    return false;
                    
                case VALIDATE_STT_MODEL:
                    if (params != null) {
                        String path = params.getString("path");
                        // return mentraManager.validateSTTModel(path);
                    }
                    return false;
                    
                case EXTRACT_TAR_BZ2:
                    if (params != null) {
                        String sourcePath = params.getString("source_path");
                        String destinationPath = params.getString("destination_path");
                        // return mentraManager.extractTarBz2(sourcePath, destinationPath);
                    }
                    return false;
                    
                case MICROPHONE_STATE_CHANGE:
                    if (params != null) {
                        boolean bypassVad = params.optBoolean("bypassVad", false);
                        JSONArray requiredDataArray = params.optJSONArray("requiredData");
                        List<MentraManager.SpeechRequiredDataType> requiredData = new ArrayList<>();
                        
                        if (requiredDataArray != null) {
                            for (int i = 0; i < requiredDataArray.length(); i++) {
                                String dataType = requiredDataArray.getString(i);
                                if ("PCM".equals(dataType)) {
                                    requiredData.add(MentraManager.SpeechRequiredDataType.PCM);
                                } else if ("TRANSCRIPTION".equals(dataType)) {
                                    requiredData.add(MentraManager.SpeechRequiredDataType.TRANSCRIPTION);
                                } else if ("PCM_OR_TRANSCRIPTION".equals(dataType)) {
                                    requiredData.add(MentraManager.SpeechRequiredDataType.PCM_OR_TRANSCRIPTION);
                                }
                            }
                        }
                        
                        Log.d(TAG, "requiredData = " + requiredData + ", bypassVad = " + bypassVad);
                        mentraManager.handleMicrophoneStateChange(requiredData, bypassVad);
                    }
                    break;
                    
                case UPDATE_SETTINGS:
                    if (params != null) {
                        Map<String, Object> settings = jsonObjectToMap(params);
                        // mentraManager.handleUpdateSettings(settings);
                    }
                    break;
                    
                case RESTART_TRANSCRIBER:
                    // mentraManager.restartTranscriber();
                    break;
                    
                case CONNECT_LIVEKIT:
                    if (params != null) {
                        String url = params.getString("url");
                        String token = params.getString("token");
                        Log.d(TAG, "Connecting to LiveKit: " + url);
                        // LiveKitManager.getInstance().connect(url, token);
                    }
                    break;
                    
                case PING:
                    // Do nothing for ping
                    break;
                    
                case UNKNOWN:
                default:
                    Log.d(TAG, "Unknown command type: " + commandString);
                    mentraManager.handleRequestStatus();
                    break;
            }
            
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing JSON command", e);
        }
        
        return 0;
    }
    
    /**
     * Convert JSONObject to Map recursively
     */
    private Map<String, Object> jsonObjectToMap(JSONObject jsonObject) throws JSONException {
        Map<String, Object> map = new HashMap<>();
        
        if (jsonObject == null) {
            return map;
        }
        
        JSONArray keys = jsonObject.names();
        if (keys == null) {
            return map;
        }
        
        for (int i = 0; i < keys.length(); i++) {
            String key = keys.getString(i);
            Object value = jsonObject.get(key);
            
            if (value instanceof JSONObject) {
                map.put(key, jsonObjectToMap((JSONObject) value));
            } else if (value instanceof JSONArray) {
                map.put(key, jsonArrayToList((JSONArray) value));
            } else if (value == JSONObject.NULL) {
                map.put(key, null);
            } else {
                map.put(key, value);
            }
        }
        
        return map;
    }
    
    /**
     * Convert JSONArray to List recursively
     */
    private List<Object> jsonArrayToList(JSONArray jsonArray) throws JSONException {
        List<Object> list = new ArrayList<>();
        
        if (jsonArray == null) {
            return list;
        }
        
        for (int i = 0; i < jsonArray.length(); i++) {
            Object value = jsonArray.get(i);
            
            if (value instanceof JSONObject) {
                list.add(jsonObjectToMap((JSONObject) value));
            } else if (value instanceof JSONArray) {
                list.add(jsonArrayToList((JSONArray) value));
            } else if (value == JSONObject.NULL) {
                list.add(null);
            } else {
                list.add(value);
            }
        }
        
        return list;
    }
}