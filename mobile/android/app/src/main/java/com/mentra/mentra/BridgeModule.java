package com.mentra.mentra;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * React Native bridge module for Bridge
 * This module provides the interface between React Native and the native Bridge/CommandBridge
 */
public class BridgeModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BridgeModule";
    private static BridgeModule instance;
    private ReactApplicationContext reactContext;

    public BridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        instance = this;
        // Initialize the Bridge with React context for event emission
        Bridge.initialize(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "BridgeModule";
    }

    public static BridgeModule getInstance() {
        return instance;
    }

    /**
     * Send command from React Native (matches iOS BridgeModule.sendCommand)
     * @param command JSON string containing the command and parameters
     * @param promise Promise to resolve with the result
     */
    @ReactMethod
    public void sendCommand(String command, Promise promise) {
        try {
            // Log.d(TAG, "sendCommand called with command: " + command);
            Object result = Bridge.getInstance().handleCommand(command);
            promise.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error sending command", e);
            promise.reject("COMMAND_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void startCoreService() {
        // try {
        //     Intent intent = new Intent(getReactApplicationContext(), AugmentosService.class);
        //     intent.setAction("ACTION_START_CORE");
        //     if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        //         getReactApplicationContext().startForegroundService(intent);
        //     }
        // } catch (Exception e) {
        //     Log.e(TAG, "Failed to start Core service", e);
        // }
    }

    @ReactMethod
    public void stopCoreService() {
        // try {
        //     // Stop Core service
        //     Intent intent = new Intent(getReactApplicationContext(), AugmentosService.class);
        //     intent.setAction("ACTION_STOP_CORE");
        //     getReactApplicationContext().stopService(intent);
            
        //     // Cleanup communicator
        //     AugmentOSCommunicator.getInstance().cleanup();
        //     isInitialized = false;
            
        //     Log.d(TAG, "Core service stopped and communicator cleaned up");
        // } catch (Exception e) {
        //     Log.e(TAG, "Failed to stop Core service", e);
        // }
    }
    
    /**
     * Get constants to export to React Native
     * This includes the supported events
     */
    @Override
    @Nullable
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("supportedEvents", Bridge.getSupportedEvents());
        return constants;
    }
    
    /**
     * Add listener for events (required for RCTEventEmitter compatibility)
     */
    @ReactMethod
    public void addListener(String eventName) {
        // Keep track of listeners if needed
    }
    
    /**
     * Remove listeners (required for RCTEventEmitter compatibility)
     */
    @ReactMethod
    public void removeListeners(Integer count) {
        // Remove listeners if needed
    }
}