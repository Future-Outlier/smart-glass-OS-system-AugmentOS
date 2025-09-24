package com.mentra.mentra;

import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bridge class for core communication between React Native and native Android code
 * This is the Android equivalent of the iOS CoreBridge.swift
 */
public class Bridge {
    private static final String TAG = "Bridge";
    private static Bridge instance;
    private static ReactApplicationContext reactContext;
    private static DeviceEventManagerModule.RCTDeviceEventEmitter emitter;
    private MentraManager mentraManager;

    // Singleton getInstance
    public static synchronized Bridge getInstance() {
        if (instance == null) {
            instance = new Bridge();
        }
        return instance;
    }

    private Bridge() {
        // Private constructor for singleton
        mentraManager = MentraManager.Companion.getInstance();
        if (mentraManager == null) {
            Log.e(TAG, "Failed to initialize MentraManager in Bridge constructor");
        }
    }

    /**
     * Initialize the Bridge with React context
     * This should be called from BridgeModule constructor
     */
    public static void initialize(ReactApplicationContext context) {
        Log.d(TAG, "Initializing Bridge with React context");
        reactContext = context;
        // Don't get emitter here - it will be fetched lazily when needed
    }

    /**
     * Log a message and send it to React Native
     */
    public static void log(String message) {
        String msg = "CORE:" + message;
        sendEvent("CoreMessageEvent", msg);
    }

    /**
     * Send an event to React Native
     */
    public static void sendEvent(String eventName, String body) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            // Lazily get the emitter when needed
            if (emitter == null) {
                emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
            }
            if (emitter != null) {
                emitter.emit(eventName, body);
            }
        } else {
            Log.e(TAG, "React context is null or has no active catalyst instance");
        }
    }

    /**
     * Show a banner message in the UI
     */
    public static void showBanner(String type, String message) {
        Map<String, Object> data = new HashMap<>();
        data.put("type", type);
        data.put("message", message);
        sendTypedMessage("show_banner", data);
    }

    /**
     * Send app started event
     */
    public static void sendAppStartedEvent(String packageName) {
        Map<String, Object> data = new HashMap<>();
        data.put("packageName", packageName);
        sendTypedMessage("app_started", data);
    }

    /**
     * Send app stopped event
     */
    public static void sendAppStoppedEvent(String packageName) {
        Map<String, Object> data = new HashMap<>();
        data.put("packageName", packageName);
        sendTypedMessage("app_stopped", data);
    }

    /**
     * Send status update
     */
    public static void sendStatus(Map<String, Object> statusObj) {
        Map<String, Object> body = new HashMap<>();
        body.put("status", statusObj);
        sendTypedMessage("status", body);
    }

    /**
     * Send head position event
     */
    public static void sendHeadPosition(boolean isUp) {
        Map<String, Object> data = new HashMap<>();
        data.put("position", isUp ? "up" : "down");
        sendTypedMessage("head_position", data);
    }

    /**
     * Send pair failure event
     */
    public static void sendPairFailureEvent(String error) {
        Map<String, Object> data = new HashMap<>();
        data.put("error", error);
        sendTypedMessage("pair_failure", data);
    }

    /**
     * Send microphone data
     */
    public static void sendMicData(byte[] data) {
        String base64String = Base64.encodeToString(data, Base64.NO_WRAP);
        Map<String, Object> body = new HashMap<>();
        body.put("base64", base64String);
        sendTypedMessage("mic_data", body);
    }

    /**
     * Save a setting
     */
    public static void saveSetting(String key, Object value) {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        body.put("value", value);
        sendTypedMessage("save_setting", body);
    }

    /**
     * Send VAD (Voice Activity Detection) status
     */
    public static void sendVadStatus(boolean isSpeaking) {
        Map<String, Object> vadMsg = new HashMap<>();
        vadMsg.put("type", "VAD");
        vadMsg.put("status", isSpeaking);

        try {
            JSONObject jsonObject = new JSONObject(vadMsg);
            String jsonString = jsonObject.toString();
            sendWSText(jsonString);
        } catch (Exception e) {
            Log.e(TAG, "Error sending VAD status", e);
        }
    }

    /**
     * Send WebSocket text message
     */
    public static void sendWSText(String msg) {
        Map<String, Object> data = new HashMap<>();
        data.put("text", msg);
        sendTypedMessage("ws_text", data);
    }

    /**
     * Send WebSocket binary message
     */
    public static void sendWSBinary(byte[] data) {
        String base64String = Base64.encodeToString(data, Base64.NO_WRAP);
        Map<String, Object> body = new HashMap<>();
        body.put("base64", base64String);
        sendTypedMessage("ws_bin", body);
    }

    public static void sendDiscoveredDevice(String modelName, String deviceName) {
        Map<String, Object> eventBody = new HashMap<>();
        eventBody.put("model_name", modelName);
        eventBody.put("device_name", deviceName);

        sendTypedMessage("compatible_glasses_search_result", eventBody);
    }

    /**
     * Send a typed message to React Native
     * This is the internal method that all other send methods use
     */
    private static void sendTypedMessage(String type, Map<String, Object> body) {
        if (body == null) {
            body = new HashMap<>();
        }
        body.put("type", type);

        try {
            JSONObject jsonObject = new JSONObject(body);
            String jsonString = jsonObject.toString();

            if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
                // Lazily get the emitter when needed
                if (emitter == null) {
                    emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
                }
                if (emitter != null) {
                    emitter.emit("CoreMessageEvent", jsonString);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending typed message", e);
        }
    }

    /**
     * Send event with WritableMap (for complex objects)
     * Used by other modules that need to send structured data
     */
    public static void sendEventWithMap(String eventName, WritableMap params) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            // Lazily get the emitter when needed
            if (emitter == null) {
                emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
            }
            if (emitter != null) {
                emitter.emit(eventName, params);
            }
        }
    }

    /**
     * Convert Map to WritableMap for React Native
     */
    public static WritableMap mapToWritableMap(Map<String, Object> map) {
        WritableMap writableMap = Arguments.createMap();

        if (map == null) {
            return writableMap;
        }

        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();

            if (value == null) {
                writableMap.putNull(key);
            } else if (value instanceof Boolean) {
                writableMap.putBoolean(key, (Boolean) value);
            } else if (value instanceof Integer) {
                writableMap.putInt(key, (Integer) value);
            } else if (value instanceof Double) {
                writableMap.putDouble(key, (Double) value);
            } else if (value instanceof Float) {
                writableMap.putDouble(key, ((Float) value).doubleValue());
            } else if (value instanceof String) {
                writableMap.putString(key, (String) value);
            } else if (value instanceof Map) {
                writableMap.putMap(key, mapToWritableMap((Map<String, Object>) value));
            } else {
                writableMap.putString(key, value.toString());
            }
        }

        return writableMap;
    }

    public static ReactApplicationContext getContext() {
        return reactContext;
    }

    /**
     * Get the supported events list
     * Don't add to this list, use a typed message instead
     */
    public static String[] getSupportedEvents() {
        return new String[] {"CoreMessageEvent", "WIFI_SCAN_RESULTS"};
    }

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

    /**
     * Handle command from React Native
     * @param command JSON string containing the command and parameters
     * @return Object result of the command execution (can be boolean, string, int, etc.)
     */
    public Object handleCommand(String command) {
        // Log.d(TAG, "Received command: " + command);

        // Ensure mentraManager is initialized
        if (mentraManager == null) {
            Log.w(TAG, "MentraManager was null in handleCommand, attempting to initialize");
            mentraManager = MentraManager.Companion.getInstance();
            if (mentraManager == null) {
                Log.e(TAG, "Failed to initialize MentraManager in handleCommand");
                return "Error: MentraManager not available";
            }
        }

        try {
            JSONObject jsonCommand = new JSONObject(command);
            String commandString = jsonCommand.getString("command");
            JSONObject params = jsonCommand.optJSONObject("params");

            CommandType commandType = CommandType.fromString(commandString);

            switch (commandType) {
                case DISPLAY_EVENT:
                    if (params != null) {
                        Map<String, Object> displayEvent = jsonObjectToMap(params);
                        mentraManager.handle_display_event(displayEvent);
                    }
                    break;

                case REQUEST_STATUS:
                    mentraManager.handle_request_status();
                    break;

                case CONNECT_WEARABLE:
                    if (params != null) {
                        String modelName = params.optString("model_name", "");
                        String deviceName = params.optString("device_name", "");
                        mentraManager.handle_connect_wearable(deviceName, modelName);
                    } else {
                        mentraManager.handle_connect_wearable("", null);
                    }
                    break;

                case DISCONNECT_WEARABLE:
                    mentraManager.handle_disconnect_wearable();
                    break;

                case FORGET_SMART_GLASSES:
                    mentraManager.handle_forget_smart_glasses();
                    break;

                case SEARCH_FOR_COMPATIBLE_DEVICE_NAMES:
                    if (params != null) {
                        String modelName = params.getString("model_name");
                        mentraManager.handle_search_for_compatible_device_names(modelName);
                    }
                    break;

                case ENABLE_CONTEXTUAL_DASHBOARD:
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.enableContextualDashboard(enabled);
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

                case SHOW_DASHBOARD:
                    // mentraManager.sendCurrentState(true);
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
                        mentraManager.handle_start_video_recording(requestId, save);
                    }
                    break;

                case STOP_VIDEO_RECORDING:
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        Log.d(TAG, "Stopping video recording: requestId=" + requestId);
                        mentraManager.handle_stop_video_recording(requestId);
                    }
                    break;

                case SET_STT_MODEL_DETAILS:
                    if (params != null) {
                        String path = params.getString("path");
                        String languageCode = params.getString("languageCode");
                        // mentraManager.handle_set_stt_model_details(path, languageCode);
                    }
                    break;

                case GET_STT_MODEL_PATH:
                    // return mentraManager.handle_get_stt_model_path();
                    return "";

                case CHECK_STT_MODEL_AVAILABLE:
                    // return mentraManager.handle_check_stt_model_available();
                    return false;

                case VALIDATE_STT_MODEL:
                    if (params != null) {
                        String path = params.getString("path");
                        // return mentraManager.handle_validate_stt_model(path);
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
                        List<String> requiredData = new ArrayList<>();

                        if (requiredDataArray != null) {
                            for (int i = 0; i < requiredDataArray.length(); i++) {
                                try {
                                    String dataType = requiredDataArray.getString(i);
                                    requiredData.add(dataType);
                                } catch (JSONException e) {
                                    Log.e(TAG, "Error parsing requiredData array", e);
                                }
                            }
                        }

                        Log.d(TAG, "requiredData = " + requiredData + ", bypassVad = " + bypassVad);
                        mentraManager.handle_microphone_state_change(requiredData, bypassVad);
                    }
                    break;

                case UPDATE_SETTINGS:
                    if (params != null) {
                        Map<String, Object> settings = jsonObjectToMap(params);
                        mentraManager.handle_update_settings(settings);
                    }
                    break;

                case RESTART_TRANSCRIBER:
                    // mentraManager.restartTranscriber();
                    break;

                case PING:
                    // Do nothing for ping
                    break;

                case UNKNOWN:
                default:
                    Log.d(TAG, "Unknown command type: " + commandString);
                    mentraManager.handle_request_status();
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
