package com.mentra.mentra;

import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
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
    
    // Singleton getInstance
    public static synchronized Bridge getInstance() {
        if (instance == null) {
            instance = new Bridge();
        }
        return instance;
    }
    
    private Bridge() {
        // Private constructor for singleton
    }
    
    /**
     * Initialize the Bridge with React context
     * This should be called from BridgeModule constructor
     */
    public static void initialize(ReactApplicationContext context) {
        reactContext = context;
        if (context != null && context.hasActiveCatalystInstance()) {
            emitter = context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
        }
    }
    
    /**
     * Log a message and send it to React Native
     */
    public static void log(String message) {
        // Log.d(TAG, message);
        String msg = "ANDROID:" + message;
        sendEvent("CoreMessageEvent", msg);
    }
    
    /**
     * Send an event to React Native
     */
    public static void sendEvent(String eventName, String body) {
        if (emitter != null && reactContext != null && reactContext.hasActiveCatalystInstance()) {
            emitter.emit(eventName, body);
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
            
            if (emitter != null && reactContext != null && reactContext.hasActiveCatalystInstance()) {
                emitter.emit("CoreMessageEvent", jsonString);
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
        if (emitter != null && reactContext != null && reactContext.hasActiveCatalystInstance()) {
            emitter.emit(eventName, params);
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
    
    /**
     * Get the supported events list
     * Don't add to this list, use a typed message instead
     */
    public static String[] getSupportedEvents() {
        return new String[] {"CoreMessageEvent", "WIFI_SCAN_RESULTS"};
    }
}