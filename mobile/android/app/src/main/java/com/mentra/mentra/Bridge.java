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
    public static void sendHeadUp(boolean isUp) {
        Map<String, Object> data = new HashMap<>();
        data.put("position", isUp);
        sendTypedMessage("head_up", data);
    }


    public static void sendWifiScanResults(List<Map<String, Object>> networks) {
        Map<String, Object> body = new HashMap<>();
        body.put("networks", networks);
        sendTypedMessage("wifi_scan_results", body);
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

            // CommandType commandType = CommandType.fromString(commandString);

            switch (commandString) {
                case "display_event":
                    if (params == null) {
                        Bridge.log("CommandBridge: display_event invalid params");
                        break;
                    }
                    Map<String, Object> displayEvent = jsonObjectToMap(params);
                    mentraManager.handle_display_event(displayEvent);
                    break;

                case "request_status":
                    mentraManager.handle_request_status();
                    break;

                case "connect_default":
                    mentraManager.handle_connect_default();
                    break;

                case "connect_by_name":
                    if (params != null) {
                        String deviceName = params.optString("device_name", "");
                        mentraManager.handle_connect_by_name(deviceName);
                    }
                    break;

                case "disconnect":
                    mentraManager.handle_disconnect();
                    break;

                case "forget":
                    mentraManager.handle_forget();
                    break;

                case "find_compatible_devices":
                    if (params != null) {
                        String modelName = params.getString("model_name");
                        mentraManager.handle_find_compatible_devices(modelName);
                    }
                    break;

                case "show_dashboard":
                    // mentraManager.sendCurrentState(true);
                    break;

                case "request_wifi_scan":
                    mentraManager.handle_request_wifi_scan();
                    break;

                case "send_wifi_credentials":
                    if (params != null) {
                        String ssid = params.getString("ssid");
                        String password = params.getString("password");
                        mentraManager.handle_send_wifi_credentials(ssid, password);
                    }
                    break;

                case "set_hotspot_state":
                    if (params != null) {
                        boolean enabled = params.getBoolean("enabled");
                        mentraManager.handle_set_hotspot_state(enabled);
                    }
                    break;

                case "query_gallery_status":
                    Log.d(TAG, "Querying gallery status");
                    mentraManager.handle_query_gallery_status();
                    break;

                case "photo_request":
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        String appId = params.getString("app_id");
                        String size = params.getString("size");
                        String webhookUrl = params.getString("webhook_url");
                        String authToken = params.getString("auth_token");
                        mentraManager.handle_photo_request(requestId, appId, size, webhookUrl, authToken);
                    }
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

                case "start_buffer_recording":
                    Log.d(TAG, "Starting buffer recording");
                    mentraManager.handle_start_buffer_recording();
                    break;

                case "stop_buffer_recording":
                    Log.d(TAG, "Stopping buffer recording");
                    mentraManager.handle_stop_buffer_recording();
                    break;

                case "save_buffer_video":
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        int durationSeconds = params.getInt("duration_seconds");
                        Log.d(TAG, "Saving buffer video: requestId=" + requestId + ", duration=" + durationSeconds + "s");
                        mentraManager.handle_save_buffer_video(requestId, durationSeconds);
                    }
                    break;

                case "start_video_recording":
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        boolean save = params.getBoolean("save");
                        Log.d(TAG, "Starting video recording: requestId=" + requestId + ", save=" + save);
                        mentraManager.handle_start_video_recording(requestId, save);
                    }
                    break;

                case "stop_video_recording":
                    if (params != null) {
                        String requestId = params.getString("request_id");
                        Log.d(TAG, "Stopping video recording: requestId=" + requestId);
                        mentraManager.handle_stop_video_recording(requestId);
                    }
                    break;

                case "set_stt_model_details":
                    if (params != null) {
                        String path = params.getString("path");
                        String languageCode = params.getString("languageCode");
                        // mentraManager.handle_set_stt_model_details(path, languageCode);
                    }
                    break;

                case "get_stt_model_path":
                    // return mentraManager.handle_get_stt_model_path();
                    return "";

                case "check_stt_model_available":
                    // return mentraManager.handle_check_stt_model_available();
                    return false;

                case "validate_stt_model":
                    if (params != null) {
                        String path = params.getString("path");
                        // return mentraManager.handle_validate_stt_model(path);
                    }
                    return false;

                case "extract_tar_bz2":
                    if (params != null) {
                        String sourcePath = params.getString("source_path");
                        String destinationPath = params.getString("destination_path");
                        // return mentraManager.extractTarBz2(sourcePath, destinationPath);
                    }
                    return false;

                case "microphone_state_change":
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

                case "update_settings":
                    if (params != null) {
                        Map<String, Object> settings = jsonObjectToMap(params);
                        mentraManager.handle_update_settings(settings);
                    }
                    break;

                case "restart_transcriber":
                    // mentraManager.restartTranscriber();
                    break;

                case "ping":
                    // Do nothing for ping
                    break;

                case "unknown":
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
