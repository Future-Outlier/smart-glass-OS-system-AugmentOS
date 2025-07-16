package com.augmentos.augmentos_core.app;

import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.AugmentOSManagerPackageName;
import static com.augmentos.augmentoslib.SmartGlassesAndroidService.INTENT_ACTION;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.util.Log;
import android.content.pm.PackageManager;
import android.widget.Toast;

import com.google.gson.Gson;
import com.augmentos.augmentoslib.AugmentOSCommand;
import com.augmentos.augmentoslib.ThirdPartyEdgeApp;
import com.augmentos.augmentoslib.ThirdPartyAppType;
import com.augmentos.augmentoslib.events.BulletPointListViewRequestEvent;
import com.augmentos.augmentoslib.events.CommandTriggeredEvent;
import com.augmentos.augmentoslib.events.CoreToManagerOutputEvent;
import com.augmentos.augmentoslib.events.DisplayCustomContentRequestEvent;
import com.augmentos.augmentoslib.events.DoubleTextWallViewRequestEvent;
import com.augmentos.augmentoslib.events.FinalScrollingTextRequestEvent;
import com.augmentos.augmentoslib.events.GlassesTapOutputEvent;
import com.augmentos.augmentoslib.events.HomeScreenEvent;
import com.augmentos.augmentoslib.events.IntermediateScrollingTextRequestEvent;
import com.augmentos.augmentoslib.events.KillAppEvent;
import com.augmentos.augmentoslib.events.NotificationEvent;
import com.augmentos.augmentoslib.events.ReferenceCardImageViewRequestEvent;
import com.augmentos.augmentoslib.events.ReferenceCardSimpleViewRequestEvent;
import com.augmentos.augmentoslib.events.RegisterCommandRequestEvent;
import com.augmentos.augmentoslib.events.RegisterAppRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStartRequestEvent;
import com.augmentos.augmentoslib.events.ScrollingTextViewStopRequestEvent;
import com.augmentos.augmentoslib.events.SmartRingButtonOutputEvent;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;
import com.augmentos.augmentoslib.events.StartAsrStreamRequestEvent;
import com.augmentos.augmentoslib.events.StopAsrStreamRequestEvent;
import com.augmentos.augmentoslib.events.TextLineViewRequestEvent;
import com.augmentos.augmentoslib.events.TextWallViewRequestEvent;
import com.augmentos.augmentoslib.events.TranslateOutputEvent;
import com.augmentos.augmentos_core.events.TriggerSendStatusToAugmentOsManagerEvent;
import com.augmentos.augmentos_core.app.eventbusmessages.AppRequestEvent;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class EdgeAppSystem {
    private String TAG = "AugmentOS_AppSystem";
    private Context mContext;
    private AugmentOSLibBroadcastSender augmentOsLibBroadcastSender;
    private AugmentOSLibBroadcastReceiver augmentOsLibBroadcastReceiver;

    private static final String PREFS_NAME = "AugmentOSPrefs";
    private static final String APPS_KEY = "thirdPartyApps";
    private static final String DASHBOARD_APP_KEY = "dashboardApp";


    private BroadcastReceiver packageInstallReceiver;

    private SharedPreferences sharedPreferences;
    private Gson gson;
    private Map<String, ThirdPartyEdgeApp> thirdPartyApps;
    private String dashboardAppPackageName;
    private Set<String> runningApps;

    private static final int HEALTH_CHECK_INTERVAL_MS = 5000;  // 5 seconds
    private Handler healthCheckHandler;
    private Runnable healthCheckRunnable;
    private com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager smartGlassesManager;

    public EdgeAppSystem(Context context, com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager smartGlassesManager){
        mContext = context;
        this.smartGlassesManager = smartGlassesManager;
        augmentOsLibBroadcastSender = new AugmentOSLibBroadcastSender(mContext);
        augmentOsLibBroadcastReceiver = new AugmentOSLibBroadcastReceiver(mContext);
        runningApps = new HashSet<>();

        //subscribe to event bus events
        EventBus.getDefault().register(this);

        sharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        gson = new Gson();
        thirdPartyApps = new HashMap<>();
        //loadThirdPartyAppsFromStorage();
        //setupPackageInstallReceiver();

        healthCheckHandler = new Handler();
        healthCheckRunnable = new Runnable() {
            @Override
            public void run() {
                performHealthCheck();
                healthCheckHandler.postDelayed(this, HEALTH_CHECK_INTERVAL_MS);
            }
        };

        // TODO: Complete the healthCheck system..
        // healthCheckHandler.post(healthCheckRunnable);
    }

    private void setupPackageInstallReceiver() {
        packageInstallReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_PACKAGE_ADDED.equals(intent.getAction())) {
                    String packageName = intent.getData().getSchemeSpecificPart();
                    Log.d(TAG, "New app installed: " + packageName);

                    // This will pick up any installed but unregistered apps
                    loadThirdPartyAppsFromStorage();

                    EventBus.getDefault().post(new TriggerSendStatusToAugmentOsManagerEvent());
                }
            }
        };

        IntentFilter filter = new IntentFilter(Intent.ACTION_PACKAGE_ADDED);
        filter.addDataScheme("package");
        mContext.registerReceiver(packageInstallReceiver, filter);
    }

    private ThirdPartyEdgeApp getThirdPartyAppIfAppIsAugmentOsThirdPartyApp(String packageName, Context context) {
        PackageManager packageManager = context.getPackageManager();
        Intent augmentOsIntent = new Intent(INTENT_ACTION);
        String thisAppPackageName = context.getPackageName();


        // Query services with the specified action
        List<ResolveInfo> services = packageManager.queryIntentServices(augmentOsIntent, 0);

        for (ResolveInfo resolveInfo : services) {
            if (resolveInfo.serviceInfo != null && resolveInfo.serviceInfo.packageName.equals(packageName)) {
                if (resolveInfo.serviceInfo.packageName.equals(thisAppPackageName)) {
                    Log.d(TAG, "Skipping Core app: " + packageName);
                    continue;
                }

                Log.d(TAG, "AugmentOS App detected: " + packageName);

                String authority = packageName + ".augmentosconfigprovider";
                Uri uri = Uri.parse("content://" + authority + "/config");

                Cursor cursor = context.getContentResolver().query(uri, null, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int jsonColumnIndex = cursor.getColumnIndex("json");
                        if (jsonColumnIndex != -1) {
                            String jsonStr = cursor.getString(jsonColumnIndex);
                            // parse jsonStr, do whatever
                            Log.d(TAG, "WOAH\n\n\n\n\n");
                            Log.d(TAG, "Str: " + jsonStr);
                            Log.d(TAG, "\nEND JSON STR\n\n\n");

                            try {
                                JSONObject jsonObject = new JSONObject(jsonStr); // Parse the jsonStr into a JSONObject
                                String version = jsonObject.has("version") ? jsonObject.getString("version") : "0.0.0";
                                JSONArray settings = jsonObject.has("settings") ? jsonObject.getJSONArray("settings") : new JSONArray();
                                String instructions = jsonObject.has("instructions") ? jsonObject.getString("instructions") : "";
                                return new ThirdPartyEdgeApp(
                                        jsonObject.getString("name"),
                                        jsonObject.getString("description"),
                                        instructions,
                                        resolveInfo.serviceInfo.packageName,
                                        resolveInfo.serviceInfo.name,
                                        version,
                                        resolveInfo.serviceInfo.packageName.equals(AugmentOSManagerPackageName) ? ThirdPartyAppType.CORE_SYSTEM : ThirdPartyAppType.APP,
                                        settings,
                                        new AugmentOSCommand[]{}
                                );
                            } catch (Exception e) {
                                Log.e(TAG, "Error parsing JSON: " + e.getMessage(), e);
                            }
                        }
                    }
                    cursor.close();
                }
            }
        }
        return null;
    }

    public ThirdPartyEdgeApp getDefaultDashboardApp() {
        ThirdPartyEdgeApp defaultDashboard = new ThirdPartyEdgeApp(
                "Default Dashboard",
                "A default dashboard",
                "",
                "packageName",
                "serviceName",
                "1.0.0",
                ThirdPartyAppType.DASHBOARD,
                new JSONArray(),
                new AugmentOSCommand[]{}
        );
        return defaultDashboard;
    }

    public ThirdPartyEdgeApp getSelectedDashboardApp() {
        return thirdPartyApps.get(dashboardAppPackageName);
    }
    public boolean checkIsThirdPartyAppRunningByPackageName(String packageName) {
        return runningApps.contains(packageName);
    }

    public Set<String> getRunningApps() {
        return new HashSet<>(runningApps);
    }

    public boolean startThirdPartyAppByPackageName(String packageName){
        if(runningApps.contains(packageName)){
            Log.d(TAG, "Not starting because already running: " + packageName);
            return false;
        }

        if (thirdPartyApps.containsKey(packageName) && isAppInstalled(packageName)) {
            ThirdPartyEdgeApp app = thirdPartyApps.get(packageName);
            if(augmentOsLibBroadcastSender.startThirdPartyApp(Objects.requireNonNull(app))) {
                runningApps.add(packageName);
                if(smartGlassesManager != null)
                    smartGlassesManager.windowManager.showAppLayer("system", () -> smartGlassesManager.sendReferenceCard("AugmentOS started app:", app.appName), 6);
                return true;
            }
        } else {
            Log.d(TAG, "App " + packageName + " is not installed. Removing from list.");
            unregisterThirdPartyAppByPackageName(packageName);
        }
        return false;
    }

    public void stopThirdPartyAppByPackageName(String packageName){
        if (thirdPartyApps.containsKey(packageName)) {
                runningApps.remove(packageName);
                augmentOsLibBroadcastSender.killThirdPartyApp(Objects.requireNonNull(thirdPartyApps.get(packageName)));
                if (smartGlassesManager != null)
                    smartGlassesManager.windowManager.hideAppLayer(packageName);
        }
    }

    public ThirdPartyEdgeApp getThirdPartyAppByPackageName(String packageName){
        if (thirdPartyApps.containsKey(packageName)){
            return thirdPartyApps.get(packageName);
        }
        return null;
    }

    public void stopAllThirdPartyApps(){
        for (ThirdPartyEdgeApp app : thirdPartyApps.values()) stopThirdPartyAppByPackageName(app.packageName);
    }

    public boolean isAppInstalled(String packageName) {
        PackageManager packageManager = mContext.getPackageManager();
        try {
            packageManager.getPackageInfo(packageName, 0);
            return true;  // Package is installed
        } catch (PackageManager.NameNotFoundException e) {
            return false;  // Package not installed
        }
    }

    @Subscribe
    public void onRegisterAppRequestEvent(RegisterAppRequestEvent e){
        registerThirdPartyApp((ThirdPartyEdgeApp) e.thirdPartyEdgeApp);
    }

    @Subscribe
    public void onCommandTriggeredEvent(CommandTriggeredEvent receivedEvent){
        // TODO: Sort out new implementatation
        //        Log.d(TAG, "Command was triggered: " + receivedEvent.command.getName());
//        AugmentOSCommand command = receivedEvent.command;
//        String args = receivedEvent.args;
//        long commandTriggeredTime = receivedEvent.commandTriggeredTime;
//        if (command != null) {
//            if (command.packageName != null){
//                augmentOsLibBroadcastSender.sendEventToApps(CommandTriggeredEvent.eventId, new CommandTriggeredEvent(command, args, commandTriggeredTime));
//            }
//        }
    }

    @Subscribe
    public void onKillAppEvent(KillAppEvent killAppEvent) {
        augmentOsLibBroadcastSender.sendEventToApps(KillAppEvent.eventId, killAppEvent, killAppEvent.app.packageName);
    }

//    @Subscribe
//    public void onIntermediateTranscript(SpeechRecIntermediateOutputEvent event){
//        boolean appIsSubscribed = true; //TODO: Hash out implementation
//        if(appIsSubscribed){
//            augmentOsLibBroadcastSender.sendEventToApps(SpeechRecIntermediateOutputEvent.eventId, event);
//        }
//    }
//
////    @Subscribe
////    public void onFocusChanged(FocusChangedEvent receivedEvent) {
////        augmentOsLibBroadcastSender.sendEventToApps(FocusChangedEvent.eventId, receivedEvent, receivedEvent.appPackage);
////    }
//
//    @Subscribe
//    public void onFinalTranscript(SpeechRecFinalOutputEvent event){
//        boolean appIsSubscribed = true; //TODO: Hash out implementation
//        if(appIsSubscribed){
//            augmentOsLibBroadcastSender.sendEventToApps(SpeechRecFinalOutputEvent.eventId, event);
//        }
//    }

    @Subscribe
    public void onCoreToManagerOutputEvent(CoreToManagerOutputEvent event){
        augmentOsLibBroadcastSender.sendEventToApps(CoreToManagerOutputEvent.eventId, event, AugmentOSManagerPackageName);
    }

    public void sendTranscriptEventToApp(SpeechRecOutputEvent event, String packageName) {
        augmentOsLibBroadcastSender.sendEventToApps(SpeechRecOutputEvent.eventId, event, packageName);
    }

    public void sendTranslateEventToApp(TranslateOutputEvent event, String packageName) {
        augmentOsLibBroadcastSender.sendEventToApps(TranslateOutputEvent.eventId, event, packageName);
    }

    @Subscribe
    public void onNotificationEvent(NotificationEvent event){
        augmentOsLibBroadcastSender.sendEventToAllApps(NotificationEvent.eventId, event);
    }

    @Subscribe
    public void onSmartRingButtonEvent(SmartRingButtonOutputEvent event){
        boolean appIsSubscribed = true; //TODO: Hash out implementation
        if(appIsSubscribed){
            augmentOsLibBroadcastSender.sendEventToAllApps(SmartRingButtonOutputEvent.eventId, event);
        }
    }

    @Subscribe
    public void onGlassesTapEvent(GlassesTapOutputEvent event){
        boolean appIsSubscribed = true; //TODO: Hash out implementation
        if(appIsSubscribed){
            augmentOsLibBroadcastSender.sendEventToAllApps(GlassesTapOutputEvent.eventId, event);
        }
    }

    public void registerThirdPartyApp(ThirdPartyEdgeApp app) {
        ThirdPartyEdgeApp oldApp = getThirdPartyAppByPackageName(app.packageName);
        if (oldApp != null) {
            Log.d(TAG, "Replacing third party app:" + app.packageName);
            Toast.makeText(mContext, "Replacing third party app:" + app.packageName, Toast.LENGTH_LONG);
            thirdPartyApps.remove(oldApp.packageName);
        }

        thirdPartyApps.put(app.packageName, app);
        saveThirdPartyAppsToStorage();

        // TODO: Evaluate if we should be doing this
        // Manually triggering these status updates seems like it will lead to chaotic spaghetti slot
        // I *think* status updates should be 99% manager-controlled, basically REST API pattern.
        // EventBus.getDefault().post(new TriggerSendStatusToAugmentOsManagerEvent());
    }

    public void unregisterThirdPartyAppByPackageName(String packageName) {
        runningApps.remove(packageName);
        stopThirdPartyAppByPackageName(packageName);
        thirdPartyApps.remove(packageName);
        saveThirdPartyAppsToStorage();
    }

    private void saveThirdPartyAppsToStorage() {
        // Convert the list to JSON and save to SharedPreferences
        String json = gson.toJson(thirdPartyApps);
        sharedPreferences.edit().putString(APPS_KEY, json).apply();
        sharedPreferences.edit().putString(DASHBOARD_APP_KEY, dashboardAppPackageName).apply();
    }

    public void loadThirdPartyAppsFromStorage() {
        Log.d(TAG, "LOADING - third party apps from storage. : " + System.currentTimeMillis());
        HashMap<String, ThirdPartyEdgeApp> newThirdPartyAppList = new HashMap<>();

        ArrayList<String> preinstalledPackageNames = getAllInstalledPackageNames(mContext);
        for (String packageName : preinstalledPackageNames){
            ThirdPartyEdgeApp foundApp = getThirdPartyAppIfAppIsAugmentOsThirdPartyApp(packageName, mContext);
            if(foundApp != null) {
                Log.d(TAG, "Discovered an unregistered App on device: " + packageName);
                // Toast.makeText(mContext, "Discovered an unregistered App on device: " + packageName, Toast.LENGTH_LONG).show();
                newThirdPartyAppList.put(foundApp.packageName, foundApp);
            }
        }

        // TODO Finish dashboard system
        dashboardAppPackageName = sharedPreferences.getString(DASHBOARD_APP_KEY, null);

        thirdPartyApps = newThirdPartyAppList;

        // Save the filtered list back to storage
        saveThirdPartyAppsToStorage();
        Log.d(TAG, "LOADED - third party apps from storage. : " + System.currentTimeMillis());
    }

    public static ArrayList<String> getAllInstalledPackageNames(Context context) {
        ArrayList<String> packageNames = new ArrayList<>();
        PackageManager packageManager = context.getPackageManager();
        List<PackageInfo> packages = packageManager.getInstalledPackages(0);

        for (PackageInfo packageInfo : packages) {
            packageNames.add(packageInfo.packageName);
        }

        return packageNames;
    }

    public ArrayList<ThirdPartyEdgeApp> getThirdPartyApps() {
        return new ArrayList<>(thirdPartyApps.values());
    }

    //respond and approve events below
    @Subscribe
    public void onAppRequestEvent(AppRequestEvent receivedEvent) {
        //map from id to event for all events that don't need permissions
        switch (receivedEvent.eventId) {
            case RegisterCommandRequestEvent.eventId:
                Log.d(TAG, "Resending register command request event");
                EventBus.getDefault().post((RegisterCommandRequestEvent) receivedEvent.serializedEvent);
                return;
            case RegisterAppRequestEvent.eventId:
                Log.d(TAG, "Resending register App request event");
                EventBus.getDefault().post((RegisterAppRequestEvent) receivedEvent.serializedEvent);
                return;
        }

        //  Check if this App should even be running
        if (!checkIsThirdPartyAppRunningByPackageName(receivedEvent.sendingPackage)) {
            Log.d(TAG, "Non-running app '" + receivedEvent.serializedEvent + "' attempting request... weird");
            stopThirdPartyAppByPackageName(receivedEvent.sendingPackage);
            return;
        }

        switch (receivedEvent.eventId) {
            case StartAsrStreamRequestEvent.eventId:
                StartAsrStreamRequestEvent oldStartAsrEvent = (StartAsrStreamRequestEvent) receivedEvent.serializedEvent;

                StartAsrStreamRequestEvent enrichedStartAsrEvent = oldStartAsrEvent.withPackageName(receivedEvent.sendingPackage);
                EventBus.getDefault().post((StartAsrStreamRequestEvent) enrichedStartAsrEvent);
                break;
            case StopAsrStreamRequestEvent.eventId:
                StopAsrStreamRequestEvent oldStopAsrEvent = (StopAsrStreamRequestEvent) receivedEvent.serializedEvent;

                StopAsrStreamRequestEvent enrichedStopAsrEvent = oldStopAsrEvent.withPackageName(receivedEvent.sendingPackage);
                EventBus.getDefault().post((StopAsrStreamRequestEvent) enrichedStopAsrEvent);
                break;
        }

        // For display-related commands
        if (smartGlassesManager != null) {
            switch (receivedEvent.eventId) {
                case ReferenceCardSimpleViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ReferenceCardSimpleViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ReferenceCardSimpleViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case TextWallViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((TextWallViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((TextWallViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case DoubleTextWallViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((DoubleTextWallViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((DoubleTextWallViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case HomeScreenEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((HomeScreenEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((HomeScreenEvent) receivedEvent.serializedEvent);
                    break;
                case ReferenceCardImageViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ReferenceCardImageViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ReferenceCardImageViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case BulletPointListViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((BulletPointListViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((BulletPointListViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case ScrollingTextViewStartRequestEvent.eventId: //mode start command - gives app focus
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ScrollingTextViewStartRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ScrollingTextViewStartRequestEvent) receivedEvent.serializedEvent);
                    break;
                case ScrollingTextViewStopRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((ScrollingTextViewStopRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((ScrollingTextViewStopRequestEvent) receivedEvent.serializedEvent);
                    break;
                case FinalScrollingTextRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((FinalScrollingTextRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((FinalScrollingTextRequestEvent) receivedEvent.serializedEvent);
                    break;
                case IntermediateScrollingTextRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((IntermediateScrollingTextRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((IntermediateScrollingTextRequestEvent) receivedEvent.serializedEvent);
                    break;
                case TextLineViewRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((TextLineViewRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((TextLineViewRequestEvent) receivedEvent.serializedEvent);
                    break;
                case DisplayCustomContentRequestEvent.eventId:
                    smartGlassesManager.windowManager.showAppLayer(receivedEvent.sendingPackage, () -> EventBus.getDefault().post((DisplayCustomContentRequestEvent) receivedEvent.serializedEvent), -1);
                    //EventBus.getDefault().post((DisplayCustomContentRequestEvent) receivedEvent.serializedEvent);
            }
        } else {
            Log.d(TAG, "smartGlassesManager in AppSystem is null!");
        }
    }

    public void performHealthCheck() {
        boolean deltaFound = false;
        Log.d(TAG, "Performing health check") ;
        for (ThirdPartyEdgeApp app : thirdPartyApps.values()) {
            if (runningApps.contains(app.packageName) && !isThirdPartyAppServiceRunning(app)) {
                Log.d(TAG, "Health Check: App " + app.packageName + " not matching expected state... " +
                        "expected: " + runningApps.contains(app.packageName) + ". " +
                        "Removing App from running list to repair state...");
                //startThirdPartyAppByPackageName(app.packageName);
                runningApps.remove(app.packageName);
                deltaFound = true;
            } else if (!runningApps.contains(app.packageName) && isThirdPartyAppServiceRunning(app)) {
                Log.d(TAG, "Health Check: App " + app.packageName + " not matching " +
                        "expected state... expected: " + runningApps.contains(app.packageName) + ". " +
                        "Killing App to repair state...");
                stopThirdPartyAppByPackageName(app.packageName);
                deltaFound = true;
            }
        }

        if (deltaFound) {
            // TODO: SEND THIS DELTA OUT AS A STATUS TO MANAGER???
            //EventBus.getDefault().post(new );
            //sendStatusToManager(); // Send consolidated status to the Manager
        }
    }

    private boolean isThirdPartyAppServiceRunning(ThirdPartyEdgeApp app) {
        ActivityManager manager = (ActivityManager) mContext.getSystemService(Context.ACTIVITY_SERVICE);
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (app.packageName.equals(service.service.getPackageName()) &&
                    app.serviceName.equals(service.service.getClassName())) {
                return true; // Service matches both packageName and serviceName
            }
        }
        return false;
    }

    public void setSmartGlassesManager(com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager manager) {
        this.smartGlassesManager = manager;
    }

    public void destroy(){
        // Safely unregister the AugmentOS lib broadcast receiver
        if (augmentOsLibBroadcastReceiver != null) {
            try {
                augmentOsLibBroadcastReceiver.unregister();
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering augmentOsLibBroadcastReceiver: " + e.getMessage());
            }
        }

        // Safely unregister the package install receiver
        if (packageInstallReceiver != null) {
            try {
                mContext.unregisterReceiver(packageInstallReceiver);
            } catch (IllegalArgumentException e) {
                // This is fine - receiver was not registered or already unregistered
                Log.e(TAG, "Error unregistering packageInstallReceiver: " + e.getMessage());
            }
        }

        // Safely unregister from EventBus
        try {
            if (EventBus.getDefault().isRegistered(this)) {
                EventBus.getDefault().unregister(this);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering from EventBus: " + e.getMessage());
        }

        // Stop the health check handler
        if (healthCheckHandler != null) {
            healthCheckHandler.removeCallbacks(healthCheckRunnable);
        }

        Log.d(TAG, "AppSystem destroyed.");
    }
}