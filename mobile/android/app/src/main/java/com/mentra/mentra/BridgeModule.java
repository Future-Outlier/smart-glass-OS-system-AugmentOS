package com.mentra.mentra;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import android.util.Log;

import androidx.annotation.NonNull;

/**
 * React Native bridge module for CommandBridge
 * This module provides the interface between React Native and the native CommandBridge
 */
public class BridgeModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BridgeModule";
    private CommandBridge commandBridge;

    public BridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.commandBridge = CommandBridge.getInstance();
    }

    @NonNull
    @Override
    public String getName() {
        return "Bridge";
    }

    /**
     * Handle command from React Native
     * @param command JSON string containing the command and parameters
     * @param promise Promise to resolve with the result
     */
    @ReactMethod
    public void handleCommand(String command, Promise promise) {
        try {
            Log.d(TAG, "handleCommand called with command: " + command);
            Object result = commandBridge.handleCommand(command);
            promise.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error handling command", e);
            promise.reject("COMMAND_ERROR", e.getMessage(), e);
        }
    }
}