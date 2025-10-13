package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Handles RGB LED control commands for K900 smart glasses.
 * Controls the RGB LEDs on the glasses (BES chipset) via Bluetooth.
 * 
 * NOTE: This controls the RGB LEDs on the GLASSES themselves, NOT the local MTK recording LED.
 * For local MTK LED control, use K900LedController.
 * 
 * Command Protocol:
 * - cs_ledon: Turn on RGB LED with timing (Phone -> Glasses)
 * - cs_ledoff: Turn off RGB LED (Phone -> Glasses)
 * 
 * RGB LED Indices:
 * - 0: Red LED
 * - 1: Green LED
 * - 2: Blue LED
 * 
 * Follows SOLID Principles:
 * - Single Responsibility: Handles only RGB LED control commands
 * - Open/Closed: Extensible for new RGB LED patterns
 * - Liskov Substitution: Implements ICommandHandler interface
 * - Interface Segregation: Uses focused ICommandHandler interface
 * - Dependency Inversion: Depends on abstractions (AsgClientServiceManager)
 */
public class RgbLedCommandHandler implements ICommandHandler {
    private static final String TAG = "RgbLedCommandHandler";
    
    // Command types from phone (for RGB LEDs on glasses)
    private static final String CMD_RGB_LED_CONTROL_ON = "rgb_led_control_on";
    private static final String CMD_RGB_LED_CONTROL_OFF = "rgb_led_control_off";
    private static final String CMD_RGB_LED_PHOTO_FLASH = "rgb_led_photo_flash";
    private static final String CMD_RGB_LED_VIDEO_PULSE = "rgb_led_video_pulse";
    
    // K900 protocol commands to send to glasses
    private static final String K900_CMD_RGB_LED_ON = "cs_ledon";
    private static final String K900_CMD_RGB_LED_OFF = "cs_ledoff";
    
    // RGB LED color indices (on glasses)
    public static final int RGB_LED_RED = 0;
    public static final int RGB_LED_GREEN = 1;
    public static final int RGB_LED_BLUE = 2;
    public static final int RGB_LED_ORANGE = 3; 
    public static final int RGB_LED_WHITE = 4;
    
    private final AsgClientServiceManager serviceManager;
    
    public RgbLedCommandHandler(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
        Log.d(TAG, "🚨 RGB LED Command Handler initialized");
    }
    
    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of(
            CMD_RGB_LED_CONTROL_ON,
            CMD_RGB_LED_CONTROL_OFF,
            CMD_RGB_LED_PHOTO_FLASH,
            CMD_RGB_LED_VIDEO_PULSE
        );
    }
    
    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        Log.i(TAG, "🚨 Handling RGB LED command: " + commandType);
        
        try {
            switch (commandType) {
                case CMD_RGB_LED_CONTROL_ON:
                    return handleRgbLedOn(data);
                    
                case CMD_RGB_LED_CONTROL_OFF:
                    return handleRgbLedOff(data);
                    
                case CMD_RGB_LED_PHOTO_FLASH:
                    return handlePhotoFlash(data);
                    
                case CMD_RGB_LED_VIDEO_PULSE:
                    return handleVideoPulse(data);
                    
                default:
                    Log.w(TAG, "⚠️ Unknown RGB LED command type: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "💥 Error handling RGB LED command: " + commandType, e);
            return false;
        }
    }
    
    /**
     * Handle RGB LED ON command with timing parameters.
     * 
     * Expected data format:
     * {
     *   "led": 0-2,           // RGB LED index (0=red, 1=green, 2=blue)
     *   "ontime": 1000,       // RGB LED on duration in milliseconds
     *   "offtime": 1000,      // RGB LED off duration in milliseconds
     *   "count": 5            // Number of on/off cycles
     * }
     * 
     * K900 Protocol command sent to glasses:
     * {
     *   "C": "cs_ledon",
     *   "B": "{\"led\":0, \"ontime\":1000, \"offtime\":1000, \"count\":5}"
     * }
     */
    private boolean handleRgbLedOn(JSONObject data) {
        Log.d(TAG, "🚨 Processing RGB LED ON command");
        
        try {
            // Extract parameters with defaults
            int led = data.optInt("led", RGB_LED_RED);
            int ontime = data.optInt("ontime", 1000);
            int offtime = data.optInt("offtime", 1000);
            int count = data.optInt("count", 1);
            
            // Validate parameters
            if (led < RGB_LED_RED || led > RGB_LED_WHITE) {
                Log.e(TAG, "❌ Invalid RGB LED index: " + led + " (must be 0-2)");
                sendErrorResponse("Invalid RGB LED index: " + led);
                return false;
            }
            
            if (ontime < 0 || offtime < 0 || count < 0) {
                Log.e(TAG, "❌ Invalid timing parameters: ontime=" + ontime + 
                          ", offtime=" + offtime + ", count=" + count);
                sendErrorResponse("Invalid timing parameters");
                return false;
            }
            
            Log.i(TAG, String.format("🚨 💡 RGB LED ON - Color: %s, OnTime: %dms, OffTime: %dms, Cycles: %d",
                    getRgbLedColorName(led), ontime, offtime, count));
            
            // Build K900 protocol command (full format: C, V, B)
            JSONObject k900Command = new JSONObject();
            k900Command.put("C", K900_CMD_RGB_LED_ON);
            k900Command.put("V", 1);  // Version field - REQUIRED to prevent double-wrapping
            
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", led);
            ledParams.put("ontime", ontime);
            ledParams.put("offtime", offtime);
            ledParams.put("count", count);
            k900Command.put("B", ledParams.toString());
            
            // Send command to glasses via Bluetooth
            boolean sent = sendCommandToGlasses(k900Command);
            
            if (sent) {
                Log.i(TAG, "✅ RGB LED ON command sent successfully to glasses");
                sendSuccessResponse(CMD_RGB_LED_CONTROL_ON);
            } else {
                Log.e(TAG, "❌ Failed to send RGB LED ON command to glasses");
                sendErrorResponse("Failed to send command to glasses");
            }
            
            return sent;
            
        } catch (JSONException e) {
            Log.e(TAG, "💥 Error building RGB LED ON command", e);
            sendErrorResponse("Failed to build RGB LED command");
            return false;
        }
    }
    
    /**
     * Handle RGB LED OFF command.
     * 
     * Expected data format:
     * {
     *   "led": 0-2  // RGB LED index (0=red, 1=green, 2=blue)
     * }
     * 
     * K900 Protocol command sent to glasses:
     * {
     *   "C": "cs_ledoff",
     *   "B": "{\"led\":0}"
     * }
     */
    private boolean handleRgbLedOff(JSONObject data) {
        Log.d(TAG, "🚨 Processing RGB LED OFF command");
        
        try {
            // Extract RGB LED index
            int led = data.optInt("led", RGB_LED_RED);
            
            // Validate RGB LED index
            if (led < RGB_LED_RED || led > RGB_LED_WHITE) {
                Log.e(TAG, "❌ Invalid RGB LED index: " + led + " (must be 0-2)");
                sendErrorResponse("Invalid RGB LED index: " + led);
                return false;
            }
            
            Log.i(TAG, "🚨 🔴 RGB LED OFF - Color: " + getRgbLedColorName(led));
            
            // Build K900 protocol command (full format: C, V, B)
            JSONObject k900Command = new JSONObject();
            k900Command.put("C", K900_CMD_RGB_LED_OFF);
            k900Command.put("V", 1);  // Version field - REQUIRED to prevent double-wrapping
            
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", led);
            k900Command.put("B", ledParams);
            
            // Send command to glasses via Bluetooth
            boolean sent = sendCommandToGlasses(k900Command);
            
            if (sent) {
                Log.i(TAG, "✅ RGB LED OFF command sent successfully to glasses");
                sendSuccessResponse(CMD_RGB_LED_CONTROL_OFF);
            } else {
                Log.e(TAG, "❌ Failed to send RGB LED OFF command to glasses");
                sendErrorResponse("Failed to send command to glasses");
            }
            
            return sent;
            
        } catch (JSONException e) {
            Log.e(TAG, "💥 Error building RGB LED OFF command", e);
            sendErrorResponse("Failed to build RGB LED command");
            return false;
        }
    }
    
    /**
     * Send K900 protocol command to glasses via Bluetooth.
     */
    private boolean sendCommandToGlasses(JSONObject k900Command) {
        Log.d(TAG, "📤 Sending K900 command to glasses: " + k900Command.toString());
        
        if (serviceManager == null) {
            Log.e(TAG, "❌ ServiceManager is null");
            return false;
        }
        
        if (serviceManager.getBluetoothManager() == null) {
            Log.e(TAG, "❌ BluetoothManager is null");
            return false;
        }
        
        if (!serviceManager.getBluetoothManager().isConnected()) {
            Log.w(TAG, "⚠️ Bluetooth not connected - cannot send LED command");
            return false;
        }
        
        try {
            byte[] commandBytes = k900Command.toString().getBytes(StandardCharsets.UTF_8);
            boolean sent = serviceManager.getBluetoothManager().sendData(commandBytes);
            Log.d(TAG, "📡 Command sent result: " + sent);
            return sent;
        } catch (Exception e) {
            Log.e(TAG, "💥 Error sending command to glasses", e);
            return false;
        }
    }
    
    /**
     * Send success response back to phone.
     */
    private void sendSuccessResponse(String commandType) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", commandType + "_response");
            response.put("success", true);
            response.put("timestamp", System.currentTimeMillis());
            
            if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                    serviceManager.getBluetoothManager().isConnected()) {
                serviceManager.getBluetoothManager().sendData(
                    response.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ Success response sent to phone");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating success response", e);
        }
    }
    
    /**
     * Send error response back to phone.
     */
    private void sendErrorResponse(String errorMessage) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "rgb_led_control_error");
            response.put("success", false);
            response.put("error", errorMessage);
            response.put("timestamp", System.currentTimeMillis());
            
            if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                    serviceManager.getBluetoothManager().isConnected()) {
                serviceManager.getBluetoothManager().sendData(
                    response.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "⚠️ Error response sent to phone");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating error response", e);
        }
    }
    
    /**
     * Handle photo flash LED command - white flash synchronized with shutter sound.
     * 
     * Expected data format:
     * {
     *   "duration": 200  // Flash duration in milliseconds (optional, default 200ms)
     * }
     * 
     * This creates a quick white flash that matches the camera shutter sound timing.
     */
    private boolean handlePhotoFlash(JSONObject data) {
        Log.d(TAG, "📸 Processing photo flash LED command");
        
        try {
            // Extract flash duration with default
            int duration = data.optInt("duration", 10000); // Default 10000ms (10 sec) flash
            
            Log.i(TAG, String.format("📸 ⚪ Photo flash LED (WHITE) - Duration: %dms", duration));
            
            // Build K900 protocol command for white flash
            JSONObject k900Command = new JSONObject();
            k900Command.put("C", K900_CMD_RGB_LED_ON);
            k900Command.put("V", 1);
            
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", RGB_LED_WHITE);
            ledParams.put("ontime", duration);
            ledParams.put("offtime", 0);  // No off time for single flash
            ledParams.put("count", 1);    // Single flash
            k900Command.put("B", ledParams.toString());
            
            // Send command to glasses via Bluetooth
            boolean sent = sendCommandToGlasses(k900Command);
            
            if (sent) {
                Log.i(TAG, "✅ Photo flash LED (white) command sent successfully to glasses");
                sendSuccessResponse(CMD_RGB_LED_PHOTO_FLASH);
            } else {
                Log.e(TAG, "❌ Failed to send photo flash LED command to glasses");
                sendErrorResponse("Failed to send photo flash command to glasses");
            }
            
            return sent;
            
        } catch (JSONException e) {
            Log.e(TAG, "💥 Error building photo flash LED command", e);
            sendErrorResponse("Failed to build photo flash LED command");
            return false;
        }
    }
    
    /**
     * Handle video pulse LED command - solid white LED for duration of video recording.
     * 
     * Expected data format:
     * {
     *   "pulse_duration": 1000,  // Duration of each pulse cycle in milliseconds (optional, default 1000ms)
     *   "on_time": 500,         // LED on time per cycle in milliseconds (optional, default 500ms)
     *   "off_time": 500         // LED off time per cycle in milliseconds (optional, default 500ms)
     * }
     * 
     * This creates a solid white LED that stays on during video recording.
     */
    private boolean handleVideoPulse(JSONObject data) {
        Log.d(TAG, "🎥 Processing video recording LED command (solid white)");
        
        try {
            Log.i(TAG, "🎥 ⚪ Video recording LED - Solid WHITE for duration of recording");
            
            // Build K900 protocol command for solid white LED
            // Using a very long ontime (effectively infinite) with count=1 for solid illumination
            JSONObject k900Command = new JSONObject();
            k900Command.put("C", K900_CMD_RGB_LED_ON);
            k900Command.put("V", 1);
            
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", RGB_LED_WHITE);    // White LED
            ledParams.put("ontime", 60000);         // 60 seconds (very long, will be manually turned off when recording stops)
            ledParams.put("offtime", 0);            // No off time - solid
            ledParams.put("count", 1);              // Single cycle (solid on)
            k900Command.put("B", ledParams.toString());
            
            // Send command to glasses via Bluetooth
            boolean sent = sendCommandToGlasses(k900Command);
            
            if (sent) {
                Log.i(TAG, "✅ Video recording LED (solid white) command sent successfully to glasses");
                sendSuccessResponse(CMD_RGB_LED_VIDEO_PULSE);
            } else {
                Log.e(TAG, "❌ Failed to send video recording LED command to glasses");
                sendErrorResponse("Failed to send video recording LED command to glasses");
            }
            
            return sent;
            
        } catch (JSONException e) {
            Log.e(TAG, "💥 Error building video recording LED command", e);
            sendErrorResponse("Failed to build video recording LED command");
            return false;
        }
    }
    
    /**
     * Get human-readable RGB LED color name.
     */
    private String getRgbLedColorName(int led) {
        switch (led) {
            case RGB_LED_RED: return "RED";
            case RGB_LED_GREEN: return "GREEN";
            case RGB_LED_BLUE: return "BLUE";
            case RGB_LED_ORANGE: return "ORANGE";
            case RGB_LED_WHITE: return "WHITE";
            default: return "UNKNOWN";
        }
    }
}

