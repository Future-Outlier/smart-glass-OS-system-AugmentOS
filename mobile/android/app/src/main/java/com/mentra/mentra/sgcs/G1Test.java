package com.mentra.mentra.sgcs;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.Base64;


import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.zip.CRC32;

public class G1 extends SGCManager {
    private static final String TAG = "MentraOS_G1";
    
    // Constants
    private static final UUID UART_SERVICE_UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_TX_CHAR_UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_RX_CHAR_UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    
    private static final String SHARED_PREFS_NAME = "G1Prefs";
    private static final String LEFT_DEVICE_KEY = "SavedG1LeftUUID";
    private static final String RIGHT_DEVICE_KEY = "SavedG1RightUUID";
    private static final String DEVICE_ID_KEY = "SavedG1DeviceId";
    
    private static final long DELAY_BETWEEN_CHUNKS_SEND = 16; // 16ms
    private static final long DELAY_BETWEEN_SENDS_MS = 8; // 8ms
    private static final long INITIAL_CONNECTION_DELAY_MS = 350; // 350ms
    private static final long HEARTBEAT_INTERVAL_MS = 15000;
    private static final long CONNECTION_TIMEOUT_MS = 10000;
    private static final long BASE_RECONNECT_DELAY_MS = 3000;
    private static final long MAX_RECONNECT_DELAY_MS = 60000;
    
    // Android specific members
    private Context context;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothLeScanner;
    private BluetoothGatt leftGlassGatt;
    private BluetoothGatt rightGlassGatt;
    private BluetoothGattCharacteristic leftTxChar;
    private BluetoothGattCharacteristic rightTxChar;
    private BluetoothGattCharacteristic leftRxChar;
    private BluetoothGattCharacteristic rightRxChar;
    
    // Connection state
    private boolean isLeftConnected = false;
    private boolean isRightConnected = false;
    private boolean leftReady = false;
    private boolean rightReady = false;
    private boolean isDisconnecting = false;
    private boolean isScanning = false;
    private String deviceSearchId = "NOT_SET";
    
    // Devices
    private BluetoothDevice leftDevice;
    private BluetoothDevice rightDevice;
    private String leftGlassUUID;
    private String rightGlassUUID;
    
    // Handlers
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Handler heartbeatHandler = new Handler(Looper.getMainLooper());
    private final Handler reconnectHandler = new Handler(Looper.getMainLooper());
    private Runnable heartbeatRunnable;
    
    // Command queue
    private final BlockingQueue<BufferedCommand> commandQueue = new LinkedBlockingQueue<>();
    private ExecutorService commandExecutor;
    private final Semaphore sendSemaphore = new Semaphore(1);
    
    // Counters
    private int msgId = 100;
    private byte globalCounter = 0;
    private byte heartbeatCounter = 0;
    private int reconnectAttempts = 0;
    
    // Animation and display state
    private boolean isDisplayingBMP = false;
    private long lastBMPStartTime = System.currentTimeMillis();
    private long lastFrameTime = System.currentTimeMillis();
    private int frameSequence = 0;
    
    // Quick notes
    private List<QuickNote> quickNotes = new ArrayList<>();
    
    // Text helper
    private G1TextHelper textHelper;
    
    // MIC status
    private boolean isMicrophoneEnabled = false;
    
    // Constructor
    public G1() {
        
        // Initialize device info
        this.type = "g1";
        this.hasMic = true;
        this.batteryLevel = -1;
        this.ready = false;
        this.isHeadUp = false;
        
        // Initialize case status
        this.caseOpen = false;
        this.caseRemoved = true;
        this.caseCharging = false;
        this.caseBatteryLevel = null;
        
        // Initialize device details
        this.glassesAppVersion = null;
        this.glassesBuildNumber = null;
        this.glassesDeviceModel = null;
        this.glassesAndroidVersion = null;
        this.glassesOtaVersionUrl = null;
        this.glassesSerialNumber = null;
        this.glassesStyle = null;
        this.glassesColor = null;
        
        // Initialize network status
        this.wifiSsid = null;
        this.wifiConnected = null;
        this.wifiLocalIp = null;
        this.isHotspotEnabled = null;
        this.hotspotSsid = null;
        this.hotspotPassword = null;
        this.hotspotGatewayIp = null;
        
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if (bluetoothAdapter != null) {
            bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
        }
        
        textHelper = new G1TextHelper();
        loadSavedDevices();
        setupCommandExecutor();
        startHeartbeatTimer();
    }
    
    private void loadSavedDevices() {
        // SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        // leftGlassUUID = prefs.getString(LEFT_DEVICE_KEY, null);
        // rightGlassUUID = prefs.getString(RIGHT_DEVICE_KEY, null);
        // deviceSearchId = prefs.getString(DEVICE_ID_KEY, "NOT_SET");
    }
    
    private void saveDevices() {
        // SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        // SharedPreferences.Editor editor = prefs.edit();
        
        // if (leftGlassUUID != null) {
        //     editor.putString(LEFT_DEVICE_KEY, leftGlassUUID);
        // }
        // if (rightGlassUUID != null) {
        //     editor.putString(RIGHT_DEVICE_KEY, rightGlassUUID);
        // }
        // if (deviceSearchId != null && !deviceSearchId.equals("NOT_SET")) {
        //     editor.putString(DEVICE_ID_KEY, deviceSearchId);
        // }
        
        // editor.apply();
    }
    
    private void setupCommandExecutor() {
        commandExecutor = Executors.newSingleThreadExecutor();
        commandExecutor.execute(this::processCommandQueue);
    }
    
    private void processCommandQueue() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                BufferedCommand command = commandQueue.take();
                executeBufferedCommand(command);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
    
    private void executeBufferedCommand(BufferedCommand command) {
        try {
            sendSemaphore.acquire();
            
            for (byte[] chunk : command.chunks) {
                if (command.sendLeft && leftTxChar != null && leftGlassGatt != null) {
                    leftGlassGatt.writeCharacteristic(leftTxChar);
                    leftTxChar.setValue(chunk);
                }
                
                if (command.sendRight && rightTxChar != null && rightGlassGatt != null) {
                    rightGlassGatt.writeCharacteristic(rightTxChar);
                    rightTxChar.setValue(chunk);
                }
                
                if (command.chunkTimeMs > 0) {
                    Thread.sleep(command.chunkTimeMs);
                }
            }
            
            if (command.waitTime > 0) {
                Thread.sleep(command.waitTime);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error executing buffered command", e);
        } finally {
            sendSemaphore.release();
        }
    }
    
    private void startHeartbeatTimer() {
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                if (ready) {
                    sendHeartbeat();
                }
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        };
        heartbeatHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS);
    }
    
    private void sendHeartbeat() {
        byte[] heartbeat = new byte[]{
            0x31, // HEARTBEAT command
            heartbeatCounter++,
            0x00
        };
        
        queueChunks(Arrays.asList(heartbeat), true, true, 0, false, 10, 0);
    }
    
    private void queueChunks(List<byte[]> chunks, boolean sendLeft, boolean sendRight, 
                            int waitTime, boolean ignoreAck, int chunkTimeMs, int lastFrameMs) {
        BufferedCommand command = new BufferedCommand(chunks, sendLeft, sendRight, 
                                                      waitTime, ignoreAck, chunkTimeMs, lastFrameMs);
        commandQueue.offer(command);
    }
    
    // SGCManager implementation methods
    
    @Override
    public void setMicEnabled(boolean enabled) {
        isMicrophoneEnabled = enabled;
        byte[] command = new byte[]{
            0x0B, // SET_MIC command
            (byte)(enabled ? 0x01 : 0x00)
        };
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void sendJson(Map<String, Object> jsonOriginal, boolean wakeUp) {
        try {
            JSONObject json = new JSONObject(jsonOriginal);
            String jsonString = json.toString();
            byte[] jsonBytes = jsonString.getBytes(StandardCharsets.UTF_8);
            
            // Create JSON send command
            ByteBuffer buffer = ByteBuffer.allocate(jsonBytes.length + 4);
            buffer.put((byte)0x70); // JSON command
            buffer.put((byte)(wakeUp ? 0x01 : 0x00));
            buffer.putShort((short)jsonBytes.length);
            buffer.put(jsonBytes);
            
            byte[] command = buffer.array();
            queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
        } catch (Exception e) {
            Log.e(TAG, "Error sending JSON", e);
        }
    }
    
    @Override
    public void requestPhoto(String requestId, String appId, String size, String webhookUrl) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "capture_photo");
        json.put("requestId", requestId);
        json.put("appId", appId);
        if (size != null) json.put("size", size);
        if (webhookUrl != null) json.put("webhookUrl", webhookUrl);
        sendJson(json, false);
    }
    
    @Override
    public void startRtmpStream(Map<String, Object> message) {
        sendJson(message, false);
    }
    
    @Override
    public void stopRtmpStream() {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "stop_rtmp_stream");
        sendJson(json, false);
    }
    
    @Override
    public void sendRtmpKeepAlive(Map<String, Object> message) {
        sendJson(message, false);
    }
    
    @Override
    public void startBufferRecording() {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "start_buffer_recording");
        sendJson(json, false);
    }
    
    @Override
    public void stopBufferRecording() {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "stop_buffer_recording");
        sendJson(json, false);
    }
    
    @Override
    public void saveBufferVideo(String requestId, int durationSeconds) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "save_buffer_video");
        json.put("requestId", requestId);
        json.put("duration", durationSeconds);
        sendJson(json, false);
    }
    
    @Override
    public void startVideoRecording(String requestId, boolean save) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "start_video_recording");
        json.put("requestId", requestId);
        json.put("save", save);
        sendJson(json, false);
    }
    
    @Override
    public void stopVideoRecording(String requestId) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "stop_video_recording");
        json.put("requestId", requestId);
        sendJson(json, false);
    }
    
    @Override
    public void sendButtonPhotoSettings() {
        // Implement button photo settings
    }
    
    @Override
    public void sendButtonModeSetting() {
        // Implement button mode setting
    }
    
    @Override
    public void sendButtonVideoRecordingSettings() {
        // Implement button video recording settings
    }
    
    @Override
    public void sendButtonCameraLedSetting() {
        // Implement button camera LED setting
    }
    
    @Override
    public void setBrightness(int level, boolean autoMode) {
        byte[] command = new byte[]{
            0x09, // BRIGHTNESS command
            (byte)level,
            (byte)(autoMode ? 0x01 : 0x00)
        };
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void clearDisplay() {
        byte[] command = new byte[]{0x4D}; // CLEAR_DISPLAY command
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void sendTextWall(String text) {
        List<byte[]> chunks = textHelper.createTextWallChunks(text);
        for (byte[] chunk : chunks) {
            queueChunks(Arrays.asList(chunk), true, true, 10, false, 10, 0);
        }
    }
    
    @Override
    public void sendDoubleTextWall(String top, String bottom) {
        List<byte[]> chunks = textHelper.createDoubleTextWallChunks(top, bottom);
        for (byte[] chunk : chunks) {
            queueChunks(Arrays.asList(chunk), true, true, 10, false, 10, 0);
        }
    }
    
    @Override
    public boolean displayBitmap(String base64ImageData) {
        try {
            byte[] imageBytes = Base64.decode(base64ImageData, Base64.DEFAULT);
            // Convert to BMP format and send to glasses
            // Implementation depends on specific BMP conversion logic
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error displaying bitmap", e);
            return false;
        }
    }
    
    @Override
    public void showDashboard() {
        byte[] command = new byte[]{0x2A}; // SHOW_DASHBOARD command
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void setDashboardPosition(int height, int depth) {
        byte[] command = new byte[]{
            0x2B, // SET_DASHBOARD_POSITION command
            (byte)height,
            (byte)depth
        };
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void setHeadUpAngle(int angle) {
        byte[] command = new byte[]{
            0x2C, // SET_HEAD_UP_ANGLE command
            (byte)angle
        };
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void getBatteryStatus() {
        byte[] command = new byte[]{0x32}; // GET_BATTERY command
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void setSilentMode(boolean enabled) {
        byte[] command = new byte[]{
            0x0C, // SET_SILENT_MODE command
            (byte)(enabled ? 0x01 : 0x00)
        };
        queueChunks(Arrays.asList(command), true, true, 0, false, 10, 0);
    }
    
    @Override
    public void exit() {
        disconnect();
    }
    
    @Override
    public void disconnect() {
        isDisconnecting = true;
        stopScanning();
        
        if (leftGlassGatt != null) {
            leftGlassGatt.close();
            leftGlassGatt = null;
        }
        
        if (rightGlassGatt != null) {
            rightGlassGatt.close();
            rightGlassGatt = null;
        }
        
        isLeftConnected = false;
        isRightConnected = false;
        ready = false;
    }
    
    @Override
    public void forget() {
        leftGlassUUID = null;
        rightGlassUUID = null;
        deviceSearchId = "NOT_SET";
        
        // SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        // SharedPreferences.Editor editor = prefs.edit();
        // editor.remove(LEFT_DEVICE_KEY);
        // editor.remove(RIGHT_DEVICE_KEY);
        // editor.remove(DEVICE_ID_KEY);
        // editor.apply();
        
        disconnect();
    }
    
    @Override
    public void findCompatibleDevices() {
        deviceSearchId = "NOT_SET";
        startScanning();
    }
    
    @Override
    public void connectById(String id) {
        deviceSearchId = "_" + id + "_";
        startScanning();
    }
    
    @Override
    public String getConnectedBluetoothName() {
        if (leftDevice != null) {
            return leftDevice.getName();
        }
        if (rightDevice != null) {
            return rightDevice.getName();
        }
        return null;
    }
    
    @Override
    public void requestWifiScan() {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "wifi_scan");
        sendJson(json, false);
    }
    
    @Override
    public void sendWifiCredentials(String ssid, String password) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "wifi_connect");
        json.put("ssid", ssid);
        json.put("password", password);
        sendJson(json, false);
    }
    
    @Override
    public void sendHotspotState(boolean enabled) {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "hotspot_state");
        json.put("enabled", enabled);
        sendJson(json, false);
    }
    
    @Override
    public void queryGalleryStatus() {
        Map<String, Object> json = new HashMap<>();
        json.put("action", "gallery_status");
        sendJson(json, false);
    }
    
    private void startScanning() {
        if (isScanning || bluetoothLeScanner == null) {
            return;
        }
        
        isScanning = true;
        
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();
        
        bluetoothLeScanner.startScan(null, settings, scanCallback);
    }
    
    private void stopScanning() {
        if (!isScanning || bluetoothLeScanner == null) {
            return;
        }
        
        isScanning = false;
        bluetoothLeScanner.stopScan(scanCallback);
    }
    
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String deviceName = device.getName();
            
            if (deviceName != null && deviceName.contains("_G1_")) {
                if (deviceSearchId.equals("NOT_SET") || deviceName.contains(deviceSearchId)) {
                    if (deviceName.contains("_L_")) {
                        leftDevice = device;
                        leftGlassUUID = device.getAddress();
                        connectToDevice(device, true);
                    } else if (deviceName.contains("_R_")) {
                        rightDevice = device;
                        rightGlassUUID = device.getAddress();
                        connectToDevice(device, false);
                    }
                    
                    if (leftDevice != null && rightDevice != null) {
                        stopScanning();
                        saveDevices();
                    }
                }
            }
        }
    };
    
    private void connectToDevice(BluetoothDevice device, boolean isLeft) {
        // BluetoothGatt gatt = device.connectGatt(context, false, new GattCallback(isLeft));
        
        // if (isLeft) {
        //     leftGlassGatt = gatt;
        // } else {
        //     rightGlassGatt = gatt;
        // }
    }
    
    private class GattCallback extends BluetoothGattCallback {
        private final boolean isLeft;
        
        GattCallback(boolean isLeft) {
            this.isLeft = isLeft;
        }
        
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, (isLeft ? "Left" : "Right") + " glass connected");
                if (isLeft) {
                    isLeftConnected = true;
                } else {
                    isRightConnected = true;
                }
                gatt.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(TAG, (isLeft ? "Left" : "Right") + " glass disconnected");
                if (isLeft) {
                    isLeftConnected = false;
                    leftReady = false;
                } else {
                    isRightConnected = false;
                    rightReady = false;
                }
                updateReadyState();
            }
        }
        
        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                BluetoothGattService service = gatt.getService(UART_SERVICE_UUID);
                if (service != null) {
                    BluetoothGattCharacteristic txChar = service.getCharacteristic(UART_TX_CHAR_UUID);
                    BluetoothGattCharacteristic rxChar = service.getCharacteristic(UART_RX_CHAR_UUID);
                    
                    if (isLeft) {
                        leftTxChar = txChar;
                        leftRxChar = rxChar;
                        leftReady = true;
                    } else {
                        rightTxChar = txChar;
                        rightRxChar = rxChar;
                        rightReady = true;
                    }
                    
                    // Enable notifications
                    if (rxChar != null) {
                        gatt.setCharacteristicNotification(rxChar, true);
                        BluetoothGattDescriptor descriptor = rxChar.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
                        if (descriptor != null) {
                            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                            gatt.writeDescriptor(descriptor);
                        }
                    }
                    
                    updateReadyState();
                }
            }
        }
        
        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            byte[] data = characteristic.getValue();
            handleIncomingData(data, isLeft);
        }
    }
    
    private void updateReadyState() {
        boolean wasReady = ready;
        ready = leftReady && rightReady;
        
        if (ready && !wasReady) {
            Log.i(TAG, "G1 glasses fully connected and ready");
            reconnectAttempts = 0;
        }
    }
    
    private void handleIncomingData(byte[] data, boolean isLeft) {
        if (data == null || data.length == 0) {
            return;
        }
        
        byte command = data[0];
        
        switch (command) {
            case 0x32: // Battery response
                if (data.length >= 3) {
                    int battery = data[1] & 0xFF;
                    if (isLeft) {
                        this.batteryLevel = battery;
                    }
                }
                break;
                
            case 0x33: // Case status
                if (data.length >= 5) {
                    this.caseBatteryLevel = data[1] & 0xFF;
                    this.caseCharging = data[2] == 0x01;
                    this.caseOpen = data[3] == 0x01;
                    this.caseRemoved = data[4] == 0x01;
                }
                break;
                
            case 0x34: // Head up/down
                if (data.length >= 2) {
                    this.isHeadUp = data[1] == 0x01;
                }
                break;
                
            case 0x35: // Serial number info
                if (data.length > 1) {
                    String serialNumber = new String(data, 1, data.length - 1, StandardCharsets.UTF_8);
                    this.glassesSerialNumber = serialNumber;
                    decodeSerialNumber(serialNumber);
                }
                break;
        }
    }
    
    private void decodeSerialNumber(String serialNumber) {
        if (serialNumber == null || serialNumber.length() < 6) {
            return;
        }
        
        // Style mapping: 3rd character (index 2)
        char styleChar = serialNumber.charAt(2);
        switch (styleChar) {
            case '0':
                this.glassesStyle = "Round";
                break;
            case '1':
                this.glassesStyle = "Rectangular";
                break;
            default:
                this.glassesStyle = "Round";
        }
        
        // Color mapping: 6th character (index 5)
        char colorChar = serialNumber.charAt(5);
        switch (colorChar) {
            case 'A':
                this.glassesColor = "Grey";
                break;
            case 'B':
                this.glassesColor = "Brown";
                break;
            case 'C':
                this.glassesColor = "Green";
                break;
            default:
                this.glassesColor = "Grey";
        }
    }
    
    // Helper classes
    private static class BufferedCommand {
        final List<byte[]> chunks;
        final boolean sendLeft;
        final boolean sendRight;
        final int waitTime;
        final boolean ignoreAck;
        final int chunkTimeMs;
        final int lastFrameMs;
        
        BufferedCommand(List<byte[]> chunks, boolean sendLeft, boolean sendRight,
                       int waitTime, boolean ignoreAck, int chunkTimeMs, int lastFrameMs) {
            this.chunks = chunks;
            this.sendLeft = sendLeft;
            this.sendRight = sendRight;
            this.waitTime = waitTime;
            this.ignoreAck = ignoreAck;
            this.chunkTimeMs = chunkTimeMs;
            this.lastFrameMs = lastFrameMs;
        }
    }
    
    private static class QuickNote {
        final String id;
        final String text;
        final long timestamp;
        
        QuickNote(String id, String text, long timestamp) {
            this.id = id;
            this.text = text;
            this.timestamp = timestamp;
        }
    }
    
    private static class G1TextHelper {
        List<byte[]> createTextWallChunks(String text) {
            List<byte[]> chunks = new ArrayList<>();
            byte[] textBytes = text.getBytes(StandardCharsets.UTF_8);
            
            ByteBuffer buffer = ByteBuffer.allocate(textBytes.length + 9);
            buffer.put((byte)0x4E); // SEND_RESULT command
            buffer.put((byte)0x00); // sequence number
            buffer.put((byte)0x01); // total packages
            buffer.put((byte)0x00); // current package
            buffer.put((byte)0x71); // screen status
            buffer.put((byte)0x00); // char position 0
            buffer.put((byte)0x00); // char position 1
            buffer.put((byte)0x01); // page number
            buffer.put((byte)0x01); // max pages
            buffer.put(textBytes);
            
            chunks.add(buffer.array());
            return chunks;
        }
        
        List<byte[]> createDoubleTextWallChunks(String top, String bottom) {
            // Combine top and bottom text with appropriate formatting
            String combined = top + "\n\n" + bottom;
            return createTextWallChunks(combined);
        }
    }
}