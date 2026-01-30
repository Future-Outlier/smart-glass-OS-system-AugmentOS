package com.mentra.asg_client.io.ota.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.mentra.asg_client.io.ota.utils.OtaConstants;
import com.mentra.asg_client.io.ota.events.DownloadProgressEvent;
import com.mentra.asg_client.io.ota.events.InstallationProgressEvent;
import com.mentra.asg_client.io.ota.events.MtkOtaProgressEvent;
import com.mentra.asg_client.io.bes.events.BesOtaProgressEvent;
import com.mentra.asg_client.io.ota.helpers.OtaHelper;
import com.mentra.asg_client.events.BatteryStatusEvent;
import com.mentra.asg_client.SysControl;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;

public class OtaService extends Service {
    private static final String TAG = OtaConstants.TAG;
    private static final String CHANNEL_ID = "ota_service_channel";
    private static final int NOTIFICATION_ID = 2001;
    
    private OtaHelper otaHelper;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "OtaService onCreate");
        
        // Create notification channel
        createNotificationChannel();
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification("OTA Service Running"));
        
        // TEMPORARY: Kill external OTA updater app if it's running
        // This prevents dual OTA checks when updating from older versions
        try {
            Log.w(TAG, "Stopping external OTA updater app to prevent conflicts");
            SysControl.stopApp(this, "com.augmentos.otaupdater");
            Log.i(TAG, "External OTA updater stopped");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop external OTA updater", e);
        }
        
        // Initialize OTA helper singleton
        otaHelper = OtaHelper.initialize(this);
        
        // Register EventBus
        if (!EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().register(this);
        }
        
        // OtaHelper will automatically start checking:
        // - After 15 seconds (initial check)
        // - Every 30 minutes (periodic checks)
        // - When WiFi becomes available
        Log.i(TAG, "OTA service initialized - checks will begin automatically");
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "OtaService onStartCommand");
        return START_STICKY;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "OtaService onDestroy");
        
        // Unregister EventBus
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }
        
        // Clean up OTA helper
        if (otaHelper != null) {
            otaHelper.cleanup();
        }
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "OTA Update Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("OTA update service notifications");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    private Notification createNotification(String contentText) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ASG Client OTA")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }
    
    private void updateNotification(String contentText) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification(contentText));
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onDownloadProgress(DownloadProgressEvent event) {
        Log.d(TAG, "Download progress: " + event.toString());
        
        switch (event.getStatus()) {
            case STARTED:
                updateNotification("Downloading update...");
                break;
            case PROGRESS:
                updateNotification("Downloading: " + event.getProgress() + "%");
                break;
            case FINISHED:
                updateNotification("Download complete");
                break;
            case FAILED:
                updateNotification("Download failed: " + event.getErrorMessage());
                break;
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onInstallationProgress(InstallationProgressEvent event) {
        Log.d(TAG, "Installation progress: " + event.toString());
        
        switch (event.getStatus()) {
            case STARTED:
                updateNotification("Installing update...");
                break;
            case FINISHED:
                updateNotification("Installation complete");
                break;
            case FAILED:
                updateNotification("Installation failed: " + event.getErrorMessage());
                break;
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onBatteryStatus(BatteryStatusEvent event) {
        // OtaHelper is already subscribed to EventBus and will receive this event directly
        // No need to re-post the event - this was causing an infinite loop
        Log.d(TAG, "Received battery status: " + event.getBatteryLevel() + "%, charging: " + event.isCharging());
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onMtkOtaProgress(MtkOtaProgressEvent event) {
        Log.d(TAG, "MTK OTA progress: " + event.toString());
        
        // Parse progress percentage from message if available
        int progress = 0;
        try {
            if (event.getMessage() != null && !event.getMessage().isEmpty()) {
                progress = Integer.parseInt(event.getMessage());
            }
        } catch (NumberFormatException e) {
            // Message is not a number, use 0
        }
        
        switch (event.getStatus()) {
            case STARTED:
                updateNotification("MTK firmware update started");
                if (otaHelper != null) {
                    otaHelper.sendMtkInstallProgressToPhone("STARTED", 0, null);
                }
                break;
            case WRITE_PROGRESS:
                updateNotification("Writing MTK firmware: " + progress + "%");
                if (otaHelper != null) {
                    otaHelper.sendMtkInstallProgressToPhone("PROGRESS", progress, null);
                }
                break;
            case UPDATE_PROGRESS:
                updateNotification("Installing MTK firmware: " + progress + "%");
                if (otaHelper != null) {
                    otaHelper.sendMtkInstallProgressToPhone("PROGRESS", progress, null);
                }
                break;
            case SUCCESS:
                updateNotification("MTK firmware updated successfully");
                
                // Mark MTK as updated this session to prevent re-update before reboot
                OtaHelper.setMtkUpdatedThisSession();
                
                if (otaHelper != null) {
                    otaHelper.sendMtkInstallProgressToPhone("FINISHED", 100, null);
                }
                // Delay 1 second to ensure FINISHED message is sent over BLE before proceeding
                Log.i(TAG, "📱 MTK update success - waiting 1 second before checking for BES update");
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    // Send broadcast to notify app that MTK update is complete
                    sendMtkUpdateCompleteMessage();
                    
                    // MTK A/B updates are staged - no reboot needed yet
                    // Check if BES update is pending and start it
                    // BES update will power-cycle the system, which also applies MTK A/B slot switch
                    if (otaHelper != null && otaHelper.hasPendingBesUpdate()) {
                        Log.i(TAG, "📱 MTK complete - starting pending BES update");
                        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                            otaHelper.startPendingBesUpdate();
                        }, 2000); // 2 second delay to let phone process MTK FINISHED
                    } else {
                        Log.i(TAG, "📱 MTK complete - no BES update pending, user must reboot manually");
                    }
                }, 1000);
                break;
            case ERROR:
                updateNotification("MTK firmware update failed: " + event.getMessage());
                if (otaHelper != null) {
                    otaHelper.sendMtkInstallProgressToPhone("FAILED", 0, event.getMessage());
                }
                break;
        }
    }
    
    private void sendMtkUpdateCompleteMessage() {
        Log.i(TAG, "Sending MTK update complete broadcast");
        Intent intent = new Intent("com.mentra.asg_client.MTK_UPDATE_COMPLETE");
        sendBroadcast(intent);
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onBesOtaProgress(BesOtaProgressEvent event) {
        // Note: BES install PROGRESS is sent to phone via sr_adota from BES chip directly (via BLE)
        // We can't send via UART during BES OTA because it's busy with firmware transfer
        // We only handle STARTED/FINISHED/FAILED here for logging and internal state management
        
        switch (event.getStatus()) {
            case STARTED:
                Log.i(TAG, "BES firmware update started");
                updateNotification("BES firmware update started");
                // Note: Can't send to phone - UART busy, phone will get progress via sr_adota
                break;
            case PROGRESS:
                // Progress is handled by BES chip sending sr_adota via BLE
                // No need to try sending via UART (it would fail anyway)
                updateNotification("Sending BES firmware: " + event.getProgress() + "%");
                break;
            case FINISHED:
                Log.i(TAG, "BES firmware update finished successfully");
                updateNotification("BES firmware updated successfully");
                // Note: BES chip will send sr_adota with progress=100 or type=success
                break;
            case FAILED:
                Log.e(TAG, "BES firmware update failed: " + event.getErrorMessage());
                updateNotification("BES firmware update failed: " + event.getErrorMessage());
                // Try to notify phone of failure (might work if UART recovers)
                if (otaHelper != null) {
                    otaHelper.sendBesInstallProgressToPhone("FAILED", 0, event.getErrorMessage());
                }
                break;
        }
    }
}