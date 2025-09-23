package com.dev.api;

/**
 * High-level API for K900 device control.
 * This class MUST remain in com.dev.api package to work with XyDev JNI bindings.
 * Provides simplified methods for controlling K900 hardware features.
 */
public class DevApi {
    private static final int CMD_SET_LED_ON = 101;
    private static final int CMD_SET_SCREEN_ON = 102;
    private static final int CMD_SET_MIC_ON = 103;
    
    /**
     * Control the recording LED on the K900 glasses
     * @param bOn true to turn LED on, false to turn off
     */
    public static void setLedOn(boolean bOn) {
        XyDev.setInt(CMD_SET_LED_ON, bOn ? 1 : 0);
    }
    
    /**
     * Control the screen power on the K900 glasses
     * @param bOn true to turn screen on, false to turn off
     */
    public static void setScreenOn(boolean bOn) {
        XyDev.setInt(CMD_SET_SCREEN_ON, bOn ? 1 : 0);
    }
    
    /**
     * Control the microphone on the K900 glasses (MTK chipset specific)
     * @param bOn true to turn mic on, false to turn off
     */
    public static void setMtkMicOn(boolean bOn) {
        XyDev.setInt(CMD_SET_MIC_ON, bOn ? 1 : 0);
    }
}