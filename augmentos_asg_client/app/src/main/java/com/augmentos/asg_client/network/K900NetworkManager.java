package com.augmentos.asg_client.network;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * Implementation of INetworkManager for K900 devices.
 * Uses K900-specific broadcasts to control WiFi and hotspot functionality.
 */
public class K900NetworkManager extends BaseNetworkManager {
    private static final String TAG = "K900NetworkManager";
    
    // K900-specific constants
    private static final String K900_BROADCAST_ACTION = "com.xy.xsetting.action";
    private static final String K900_SYSTEM_UI_PACKAGE = "com.android.systemui";
    
    // Default hotspot configuration
    private static final String DEFAULT_HOTSPOT_SSID = "AugmentOS_";
    private static final String DEFAULT_HOTSPOT_PASSWORD = "augmentos1234";
    
    private final WifiManager wifiManager;
    private final DebugNotificationManager notificationManager;
    private BroadcastReceiver wifiStateReceiver;
    
    /**
     * Create a new K900NetworkManager
     * @param context The application context
     */
    public K900NetworkManager(Context context) {
        super(context);
        this.wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        this.notificationManager = new DebugNotificationManager(context);
        
        notificationManager.showDebugNotification(
                "K900 Network Manager", 
                "Using K900-specific network APIs");

        enableScan5GWifi(context, false);
    }
    
    @Override
    public void initialize() {
        super.initialize();
        registerWifiStateReceiver();
        
        // Check if we're already connected to WiFi
        if (isConnectedToWifi()) {
            notificationManager.showWifiStateNotification(true);
        } else {
            notificationManager.showWifiStateNotification(false);
            // Auto-enable WiFi if not connected
            enableWifi();
        }
    }
    
    @Override
    public void enableWifi() {
        // Use K900 API to enable WiFi
        try {
            // First try using standard WifiManager
            if (!wifiManager.isWifiEnabled()) {
                wifiManager.setWifiEnabled(true);
                notificationManager.showDebugNotification(
                        "WiFi Enabling", 
                        "Attempting to enable WiFi");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error enabling WiFi", e);
        }
    }
    
    @Override
    public void disableWifi() {
        // Use K900 API to disable WiFi
        try {
            // First try using standard WifiManager
            if (wifiManager.isWifiEnabled()) {
                wifiManager.setWifiEnabled(false);
                notificationManager.showDebugNotification(
                        "WiFi Disabling", 
                        "Disabling WiFi");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error disabling WiFi", e);
        }
    }

    public static void enableScan5GWifi(Context context, boolean bEnable)
    {
        Intent nn = new Intent("com.xy.xsetting.action");
        nn.putExtra("cmd", "scan5g");
        nn.putExtra("enable", bEnable);
        nn.setPackage("com.android.systemui");
        context.sendBroadcast(nn);
    }
    
    @Override
    public void startHotspot(String ssid, String password) {
        // Use a reasonable default if not provided
        if (ssid == null || ssid.isEmpty()) {
            ssid = DEFAULT_HOTSPOT_SSID + System.currentTimeMillis() % 1000;
        }
        
        if (password == null || password.isEmpty() || password.length() < 8) {
            password = DEFAULT_HOTSPOT_PASSWORD;
        }
        
        // Use K900 API to start hotspot
        try {
            // Send the K900-specific broadcast to start the hotspot
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.setPackage(K900_SYSTEM_UI_PACKAGE);
            intent.putExtra("cmd", "ap_start");
            intent.putExtra("enable", true);
            intent.putExtra("ssid", ssid);
            intent.putExtra("pwd", password);
            context.sendBroadcast(intent);
            
            notificationManager.showDebugNotification(
                    "Hotspot Starting", 
                    "Attempting to start hotspot with SSID: " + ssid);
            
            // Mark the hotspot as enabled
            notifyHotspotStateChanged(true);
            notificationManager.showHotspotStateNotification(true);
        } catch (Exception e) {
            Log.e(TAG, "Error starting hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Error starting hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void stopHotspot() {
        // Use K900 API to stop hotspot
        try {
            // Send the K900-specific broadcast to stop the hotspot
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.setPackage(K900_SYSTEM_UI_PACKAGE);
            intent.putExtra("cmd", "ap_start");
            intent.putExtra("enable", false);
            context.sendBroadcast(intent);
            
            notificationManager.showDebugNotification(
                    "Hotspot Stopping", 
                    "Attempting to stop hotspot");
            
            // Mark the hotspot as disabled
            notifyHotspotStateChanged(false);
            notificationManager.showHotspotStateNotification(false);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Error stopping hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void connectToWifi(String ssid, String password) {
        Log.d(TAG, "K900 WiFi Connection: Attempting to connect to WiFi: " + ssid);
        if (ssid == null || ssid.isEmpty()) {
            Log.e(TAG, "Cannot connect to WiFi with empty SSID");
            return;
        }

        try {
            // First ensure WiFi is enabled
            if (!wifiManager.isWifiEnabled()) {
                wifiManager.setWifiEnabled(true);
            }

            // For K900, try to use K900-specific broadcast
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.setPackage(K900_SYSTEM_UI_PACKAGE);
            intent.putExtra("cmd", "connectwifi");
            intent.putExtra("ssid", ssid);
            intent.putExtra("pwd", password);
            context.sendBroadcast(intent);

            Log.d(TAG, "Sent K900-specific WiFi connection broadcast");

            notificationManager.showDebugNotification(
                    "K900 WiFi Connection",
                    "Attempting to connect to: " + ssid);

            // Poll connection status
            new Thread(() -> {
                Log.d(TAG, "Starting WiFi connection polling thread");
                try {
                    for (int i = 0; i < 15; i++) { // Try for up to 30 seconds
                        Log.d(TAG, "Polling WiFi connection status, attempt " + (i + 1));
                        Log.d(TAG, "@313421 Current WiFi state: " + (isConnectedToWifi() ? "CONNECTED" : "DISCONNECTED"));
                        Thread.sleep(2000);
                        if (isConnectedToWifi()) {
                            Log.d(TAG, "WiFi is connected after polling");
                            String currentSsid = getCurrentWifiSsid();
                            Log.d(TAG, "WiFi connected successfully. Current SSID: " + currentSsid);
                            
                            // Verify we're connected to the intended network
                            if (currentSsid.equals(ssid)) {
                                Log.d(TAG, "Successfully connected to intended network: " + ssid);
                                new Handler(Looper.getMainLooper()).post(() -> {
                                    notifyWifiStateChanged(true);
                                    notificationManager.showWifiStateNotification(true);
                                });
                                return;
                            } else {
                                Log.w(TAG, "Connected to different network than intended. Expected: " + ssid + ", Got: " + currentSsid);
                                // Continue polling in case we connect to the right network
                            }
                        } else {
                            Log.d(TAG, "WiFi is not connected yet");
                        }
                    }

                    // If we get here, fall back to manual approach
                    String currentSsid = getCurrentWifiSsid();
                    Log.d(TAG, "WiFi connection attempt timed out. Current SSID (if any): " + currentSsid);
                    new Handler(Looper.getMainLooper()).post(() -> {
                        notificationManager.showDebugNotification(
                                "WiFi Connection Failed",
                                "Unable to connect automatically. Please connect to " +
                                        ssid + " manually.");
                        promptConnectToWifi(ssid, password);
                    });
                } catch (InterruptedException e) {
                    Log.e(TAG, "WiFi connection polling interrupted", e);
                }
            }).start();

        } catch (Exception e) {
            Log.e(TAG, "Error connecting to WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Error",
                    "Error connecting to WiFi: " + e.getMessage());
        }
    }

    /**
     * Prompt the user to connect to a specific WiFi network
     */
    private void promptConnectToWifi(String ssid, String password) {
        // We can't connect to WiFi automatically without system permissions
        // Prompt the user to connect manually
        notificationManager.showDebugNotification(
                "Manual WiFi Connection Required",
                "Please connect to WiFi network: " + ssid + " manually using the WiFi settings.");

        // Open the WiFi settings
        Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }
    
    /**
     * Register a receiver to listen for WiFi state changes
     */
    private void registerWifiStateReceiver() {
        if (wifiStateReceiver != null) {
            return;  // Already registered
        }
        
        wifiStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (WifiManager.NETWORK_STATE_CHANGED_ACTION.equals(intent.getAction())) {
                    boolean connected = isConnectedToWifi();
                    
                    // Always update the notification based on the actual connection state
                    notificationManager.showWifiStateNotification(connected);
                    
                    // Important: This will verify the state and use the accurate value
                    notifyWifiStateChanged(connected);
                    
                    Log.d(TAG, "WiFi state changed broadcast - actual state: " + (connected ? "CONNECTED" : "DISCONNECTED"));
                    
                    if (!connected && !isHotspotEnabled) {
                        // Consider starting the hotspot if WiFi becomes disconnected
                        // and the hotspot isn't already running
                        Log.d(TAG, "WiFi disconnected, may need to start hotspot");
                    }
                }
            }
        };
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        context.registerReceiver(wifiStateReceiver, filter);
    }
    
    /**
     * Unregister the WiFi state receiver
     */
    private void unregisterWifiStateReceiver() {
        if (wifiStateReceiver != null) {
            try {
                context.unregisterReceiver(wifiStateReceiver);
                wifiStateReceiver = null;
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering WiFi receiver", e);
            }
        }
    }
    
    /**
     * Get a list of configured WiFi networks
     * @return a list of WiFi network names (SSIDs)
     */
    @Override
    public List<String> getConfiguredWifiNetworks() {
        List<String> networks = new ArrayList<>();
        
        try {
            // If WiFi manager is not available, return empty list
            if (wifiManager == null) {
                Log.e(TAG, "WiFi manager not available");
                return networks;
            }
            
            Log.d(TAG, "K900 device: getting configured networks");
            
            final boolean[] receiverProcessed = {false};
            
            // Send a K900-specific broadcast to get configured networks
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.setPackage(K900_SYSTEM_UI_PACKAGE);
            intent.putExtra("cmd", "get_wifi_list");
            
            // Register a receiver to get the response
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent != null && intent.hasExtra("wifi_list")) {
                        String[] wifiList = intent.getStringArrayExtra("wifi_list");
                        if (wifiList != null) {
                            for (String ssid : wifiList) {
                                if (ssid != null && !ssid.isEmpty()) {
                                    networks.add(ssid);
                                    Log.d(TAG, "Found K900 configured network: " + ssid);
                                }
                            }
                        }
                    }
                    receiverProcessed[0] = true;
                }
            };
            
            // Register the receiver temporarily
            IntentFilter filter = new IntentFilter("com.xy.xsetting.wifi_list");
            context.registerReceiver(receiver, filter);
            
            // Send the request
            context.sendBroadcast(intent);
            
            // Wait for the response with timeout
            long startTime = System.currentTimeMillis();
            while (!receiverProcessed[0] && System.currentTimeMillis() - startTime < 1000) {
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            
            // Unregister the receiver
            try {
                context.unregisterReceiver(receiver);
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering receiver", e);
            }
            
            // If we didn't get any networks from the K900 API, at least add the current network
            if (networks.isEmpty()) {
                String currentSsid = getCurrentWifiSsid();
                if (!currentSsid.isEmpty()) {
                    networks.add(currentSsid);
                    Log.d(TAG, "Added current network to configured networks: " + currentSsid);
                }
            }
            
            // Log the result
            if (networks.isEmpty()) {
                Log.d(TAG, "No configured networks found on K900 device");
            } else {
                Log.d(TAG, "Found " + networks.size() + " networks on K900 device");
            }
            
            return networks;
        } catch (Exception e) {
            Log.e(TAG, "Error getting configured WiFi networks", e);
            return networks;
        }
    }
    
    @Override
    public void shutdown() {
        super.shutdown();
        unregisterWifiStateReceiver();
    }
}