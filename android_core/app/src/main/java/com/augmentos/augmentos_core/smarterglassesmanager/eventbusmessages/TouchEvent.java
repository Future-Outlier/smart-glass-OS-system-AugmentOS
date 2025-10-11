package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when a touch gesture is detected on the glasses.
 * This includes swipes, taps, and long press gestures.
 * 
 * Gesture types:
 * 1 = double_tap
 * 2 = triple_tap
 * 3 = long_press
 * 4 = forward_swipe
 * 5 = backward_swipe
 * 6 = up_swipe
 * 7 = down_swipe
 */
public class TouchEvent {
    // The device model name that detected the gesture
    public final String deviceModel;

    // The numeric gesture type code (1-7)
    public final int gestureType;

    // The human-readable gesture name
    public final String gestureName;

    // Timestamp when the gesture occurred
    public final long timestamp;

    /**
     * Create a new TouchEvent
     *
     * @param deviceModel The glasses model name
     * @param gestureType The numeric gesture type (1-7)
     * @param gestureName The human-readable gesture name
     * @param timestamp When the gesture occurred
     */
    public TouchEvent(String deviceModel, int gestureType, String gestureName, long timestamp) {
        this.deviceModel = deviceModel;
        this.gestureType = gestureType;
        this.gestureName = gestureName;
        this.timestamp = timestamp;
    }

    public TouchEvent(String deviceModel, int gestureType, String gestureName) {
        this.deviceModel = deviceModel;
        this.gestureType = gestureType;
        this.gestureName = gestureName;
        this.timestamp = System.currentTimeMillis();
    }
}

