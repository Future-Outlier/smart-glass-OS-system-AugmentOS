package com.augmentos.asg_client.service.communication.managers;

import android.util.Log;


import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Manages all communication operations (Bluetooth, WiFi status, etc.).
 * Follows Single Responsibility Principle by handling only communication concerns.
 */
public class CommunicationManager implements ICommunicationManager {
    
    private static final String TAG = "CommunicationManager";
    
    private AsgClientServiceManager serviceManager;
    
    public CommunicationManager(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
    }
    
    public void setServiceManager(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
    }
    
    @Override
    public void sendWifiStatusOverBle(boolean isConnected) {
        Log.d(TAG, "🔄 =========================================");
        Log.d(TAG, "🔄 SEND WIFI STATUS OVER BLE");
        Log.d(TAG, "🔄 =========================================");
        Log.d(TAG, "🔄 WiFi connected: " + isConnected);
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "🔄 ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject wifiStatus = new JSONObject();
                wifiStatus.put("type", "wifi_status");
                wifiStatus.put("connected", isConnected);

                if (isConnected && serviceManager.getNetworkManager() != null) {
                    String ssid = serviceManager.getNetworkManager().getCurrentWifiSsid();
                    String localIp = serviceManager.getNetworkManager().getLocalIpAddress();
                    
                    Log.d(TAG, "🔄 📡 WiFi SSID: " + (ssid != null ? ssid : "unknown"));
                    Log.d(TAG, "🔄 🌐 Local IP: " + (localIp != null ? localIp : "unknown"));
                    
                    wifiStatus.put("ssid", ssid != null ? ssid : "unknown");
                    wifiStatus.put("local_ip", localIp != null ? localIp : "");
                } else {
                    Log.d(TAG, "🔄 ❌ WiFi not connected or network manager unavailable");
                    wifiStatus.put("ssid", "");
                    wifiStatus.put("local_ip", "");
                }

                String jsonString = wifiStatus.toString();
                Log.d(TAG, "🔄 📤 Sending WiFi status JSON: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
                Log.d(TAG, "🔄 " + (sent ? "✅ WiFi status sent successfully" : "❌ Failed to send WiFi status"));
                
            } catch (JSONException e) {
                Log.e(TAG, "🔄 💥 Error creating WiFi status JSON", e);
            }
        } else {
            Log.w(TAG, "🔄 ❌ Cannot send WiFi status - service manager or Bluetooth not available");
            if (serviceManager == null) Log.w(TAG, "🔄 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "🔄 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "🔄 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendBatteryStatusOverBle() {
        Log.d(TAG, "🔋 =========================================");
        Log.d(TAG, "🔋 SEND BATTERY STATUS OVER BLE");
        Log.d(TAG, "🔋 =========================================");
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "🔋 ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject response = new JSONObject();
                response.put("type", "battery_status");
                response.put("timestamp", System.currentTimeMillis());
                // Note: Battery level and charging status would be injected via constructor or setter
                response.put("level", -1); // Placeholder
                response.put("charging", false); // Placeholder

                String jsonString = response.toString();
                Log.d(TAG, "🔋 📤 Sending battery status: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "🔋 " + (sent ? "✅ Battery status sent successfully" : "❌ Failed to send battery status"));

            } catch (JSONException e) {
                Log.e(TAG, "🔋 💥 Error creating battery status response", e);
            }
        } else {
            Log.w(TAG, "🔋 ❌ Cannot send battery status - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "🔋 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "🔋 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "🔋 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendWifiScanResultsOverBle(List<String> networks) {
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 SEND WIFI SCAN RESULTS OVER BLE");
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 Networks found: " + (networks != null ? networks.size() : 0));
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "📡 ✅ Service manager and Bluetooth manager available");
            
            try {
                // Send networks in chunks of 4 to avoid BLE message size issues
                int CHUNK_SIZE = 4;
                
                if (networks == null || networks.isEmpty()) {
                    return;
                }
                
                // Split and send in chunks
                for (int i = 0; i < networks.size(); i += CHUNK_SIZE) {
                    int endIdx = Math.min(i + CHUNK_SIZE, networks.size());
                    List<String> chunk = networks.subList(i, endIdx);
                    
                    JSONObject response = new JSONObject();
                    response.put("type", "wifi_scan_result");
                    response.put("timestamp", System.currentTimeMillis());
                    
                    org.json.JSONArray networksArray = new org.json.JSONArray();
                    for (String network : chunk) {
                        networksArray.put(network);
                        Log.d(TAG, "📡 📶 Found network: " + network);
                    }
                    response.put("networks", networksArray);

                    String jsonString = response.toString();
                    Log.d(TAG, "📡 📤 Sending WiFi scan results chunk: " + jsonString);
                    Log.d(TAG, "📡 📊 Message size: " + jsonString.getBytes(StandardCharsets.UTF_8).length + " bytes");
                    
                    boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                    Log.d(TAG, "📡 " + (sent ? "✅ WiFi scan chunk sent successfully" : "❌ Failed to send WiFi scan chunk"));
                    
                    // Small delay between chunks
                    if (i + CHUNK_SIZE < networks.size()) {
                        try {
                            Thread.sleep(100);
                        } catch (InterruptedException e) {
                            Log.e(TAG, "Interrupted while sending chunks", e);
                        }
                    }
                }

            } catch (JSONException e) {
                Log.e(TAG, "📡 💥 Error creating WiFi scan results response", e);
            }
        } else {
            Log.w(TAG, "📡 ❌ Cannot send WiFi scan results - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "📡 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "📡 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "📡 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendAckResponse(long messageId) {
        Log.d(TAG, "✅ =========================================");
        Log.d(TAG, "✅ SEND ACK RESPONSE");
        Log.d(TAG, "✅ =========================================");
        Log.d(TAG, "✅ Message ID: " + messageId);
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "✅ ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject ackResponse = new JSONObject();
                ackResponse.put("type", "msg_ack");
                ackResponse.put("mId", messageId);
                ackResponse.put("timestamp", System.currentTimeMillis());

                String jsonString = ackResponse.toString();
                Log.d(TAG, "✅ 📤 Sending ACK response: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ " + (sent ? "✅ ACK response sent successfully" : "❌ Failed to send ACK response"));

            } catch (JSONException e) {
                Log.e(TAG, "✅ 💥 Error creating ACK response JSON", e);
            }
        } else {
            Log.w(TAG, "✅ ❌ Cannot send ACK response - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "✅ ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "✅ ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "✅ ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendTokenStatusResponse(boolean success) {
        Log.d(TAG, "🔑 =========================================");
        Log.d(TAG, "🔑 SEND TOKEN STATUS RESPONSE");
        Log.d(TAG, "🔑 =========================================");
        Log.d(TAG, "🔑 Token status: " + (success ? "SUCCESS" : "FAILED"));
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "🔑 ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject response = new JSONObject();
                response.put("type", "token_status");
                response.put("success", success);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "🔑 📤 Sending token status response: " + jsonString);

                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
                Log.d(TAG, "🔑 " + (sent ? "✅ Token status response sent successfully" : "❌ Failed to send token status response"));

            } catch (JSONException e) {
                Log.e(TAG, "🔑 💥 Error creating token status response", e);
            }
        } else {
            Log.w(TAG, "🔑 ❌ Cannot send token status response - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "🔑 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "🔑 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "🔑 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
        Log.d(TAG, "📸 =========================================");
        Log.d(TAG, "📸 SEND MEDIA SUCCESS RESPONSE");
        Log.d(TAG, "📸 =========================================");
        Log.d(TAG, "📸 Request ID: " + requestId);
        Log.d(TAG, "📸 Media URL: " + mediaUrl);
        Log.d(TAG, "📸 Media Type: " + mediaType);
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "📸 ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject response = new JSONObject();
                response.put("type", "media_success");
                response.put("requestId", requestId);
                response.put("mediaUrl", mediaUrl);
                response.put("mediaType", mediaType);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📸 📤 Sending media success response: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "📸 " + (sent ? "✅ Media success response sent successfully" : "❌ Failed to send media success response"));

            } catch (JSONException e) {
                Log.e(TAG, "📸 💥 Error creating media success response", e);
            }
        } else {
            Log.w(TAG, "📸 ❌ Cannot send media success response - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "📸 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "📸 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "📸 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
        Log.d(TAG, "❌ =========================================");
        Log.d(TAG, "❌ SEND MEDIA ERROR RESPONSE");
        Log.d(TAG, "❌ =========================================");
        Log.d(TAG, "❌ Request ID: " + requestId);
        Log.d(TAG, "❌ Error Message: " + errorMessage);
        Log.d(TAG, "❌ Media Type: " + mediaType);
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "❌ ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject response = new JSONObject();
                response.put("type", "media_error");
                response.put("requestId", requestId);
                response.put("errorMessage", errorMessage);
                response.put("mediaType", mediaType);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "❌ 📤 Sending media error response: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "❌ " + (sent ? "✅ Media error response sent successfully" : "❌ Failed to send media error response"));

            } catch (JSONException e) {
                Log.e(TAG, "❌ 💥 Error creating media error response", e);
            }
        } else {
            Log.w(TAG, "❌ ❌ Cannot send media error response - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "❌ ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "❌ ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "❌ ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public void sendKeepAliveAck(String streamId, String ackId) {
        Log.d(TAG, "💓 =========================================");
        Log.d(TAG, "💓 SEND KEEP ALIVE ACK");
        Log.d(TAG, "💓 =========================================");
        Log.d(TAG, "💓 Stream ID: " + streamId);
        Log.d(TAG, "💓 ACK ID: " + ackId);
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "💓 ✅ Service manager and Bluetooth manager available");
            
            try {
                JSONObject keepAliveResponse = new JSONObject();
                keepAliveResponse.put("type", "keep_alive_ack");
                keepAliveResponse.put("streamId", streamId);
                keepAliveResponse.put("ackId", ackId);
                keepAliveResponse.put("timestamp", System.currentTimeMillis());

                String jsonString = keepAliveResponse.toString();
                Log.d(TAG, "💓 📤 Sending keep-alive ACK: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "💓 " + (sent ? "✅ Keep-alive ACK sent successfully" : "❌ Failed to send keep-alive ACK"));

            } catch (JSONException e) {
                Log.e(TAG, "💓 💥 Error creating keep-alive ACK response", e);
            }
        } else {
            Log.w(TAG, "💓 ❌ Cannot send keep-alive ACK - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "💓 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "💓 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "💓 ❌ Bluetooth not connected");
            }
        }
    }
    
    @Override
    public boolean sendBluetoothData(byte[] data) {
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 SEND BLUETOOTH DATA");
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 Data length: " + (data != null ? data.length : 0) + " bytes");
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "📡 ✅ Service manager and Bluetooth manager available");
            
            boolean sent = serviceManager.getBluetoothManager().sendData(data);
            Log.d(TAG, "📡 " + (sent ? "✅ Bluetooth data sent successfully" : "❌ Failed to send Bluetooth data"));
            return sent;
        } else {
            Log.w(TAG, "📡 ❌ Cannot send Bluetooth data - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "📡 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "📡 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "📡 ❌ Bluetooth not connected");
            }
            return false;
        }
    }
    
    @Override
    public boolean sendBluetoothResponse(JSONObject response) {
        Log.d(TAG, "📤 =========================================");
        Log.d(TAG, "📤 SEND BLUETOOTH RESPONSE");
        Log.d(TAG, "📤 =========================================");
        Log.d(TAG, "📤 Response: " + (response != null ? response.toString() : "null"));
        
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            Log.d(TAG, "📤 ✅ Service manager and Bluetooth manager available");
            
            try {
                String jsonString = response.toString();
                Log.d(TAG, "📤 📤 Sending JSON response: " + jsonString);
                
                boolean sent = serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "📤 " + (sent ? "✅ Bluetooth response sent successfully" : "❌ Failed to send Bluetooth response"));
                return sent;
            } catch (Exception e) {
                Log.e(TAG, "📤 💥 Error sending Bluetooth response", e);
                return false;
            }
        } else {
            Log.w(TAG, "📤 ❌ Cannot send Bluetooth response - not connected to BLE device");
            if (serviceManager == null) Log.w(TAG, "📤 ❌ Service manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() == null) Log.w(TAG, "📤 ❌ Bluetooth manager is null");
            if (serviceManager != null && serviceManager.getBluetoothManager() != null && !serviceManager.getBluetoothManager().isConnected()) {
                Log.w(TAG, "📤 ❌ Bluetooth not connected");
            }
            return false;
        }
    }
} 