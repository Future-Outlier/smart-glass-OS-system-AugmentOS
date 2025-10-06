package com.mentra.mentra.sgcs;

import org.json.JSONObject;
import java.util.Map;

public abstract class SGCManager {
    // Device Information
    public String type;
    public boolean ready;
    public String connectionState;// "disconnected" | "connected" | "connecting"

    public String glassesAppVersion;
    public String glassesBuildNumber;
    public String glassesDeviceModel;
    public String glassesAndroidVersion;
    public String glassesOtaVersionUrl;
    public String glassesSerialNumber;
    public String glassesStyle;
    public String glassesColor;

    // Hardware Status
    public boolean hasMic;
    public int batteryLevel = -1;
    public boolean isHeadUp;

    // Case Status
    public boolean caseOpen;
    public boolean caseRemoved;
    public boolean caseCharging;
    public Integer caseBatteryLevel;

    // Network Status
    public String wifiSsid;
    public Boolean wifiConnected;
    public String wifiLocalIp;
    public Boolean isHotspotEnabled;
    public String hotspotSsid;
    public String hotspotPassword;
    public String hotspotGatewayIp;

    // Audio Control
    public abstract void setMicEnabled(boolean enabled);

    // Camera & Media
    public abstract void requestPhoto(String requestId, String appId, String size, String webhookUrl, String authToken);
    public abstract void startRtmpStream(Map<String, Object> message);
    public abstract void stopRtmpStream();
    public abstract void sendRtmpKeepAlive(Map<String, Object> message);
    public abstract void startBufferRecording();
    public abstract void stopBufferRecording();
    public abstract void saveBufferVideo(String requestId, int durationSeconds);
    public abstract void startVideoRecording(String requestId, boolean save);
    public abstract void stopVideoRecording(String requestId);

    // Button Settings
    public abstract void sendButtonPhotoSettings();
    public abstract void sendButtonModeSetting();
    public abstract void sendButtonVideoRecordingSettings();
    public abstract void sendButtonCameraLedSetting();

    // Display Control
    public abstract void setBrightness(int level, boolean autoMode);
    public abstract void clearDisplay();
    public abstract void sendTextWall(String text);
    public abstract void sendDoubleTextWall(String top, String bottom);
    public abstract boolean displayBitmap(String base64ImageData);
    public abstract void showDashboard();
    public abstract void setDashboardPosition(int height, int depth);

    // Device Control
    public abstract void setHeadUpAngle(int angle);
    public abstract void getBatteryStatus();
    public abstract void setSilentMode(boolean enabled);
    public abstract void exit();

    // Connection Management
    public abstract void disconnect();
    public abstract void forget();
    public abstract void findCompatibleDevices();
    public abstract void connectById(String id);
    public abstract String getConnectedBluetoothName();

    // Network Management
    public abstract void requestWifiScan();
    public abstract void sendWifiCredentials(String ssid, String password);
    public abstract void sendHotspotState(boolean enabled);

    // Gallery
    public abstract void queryGalleryStatus();
}
