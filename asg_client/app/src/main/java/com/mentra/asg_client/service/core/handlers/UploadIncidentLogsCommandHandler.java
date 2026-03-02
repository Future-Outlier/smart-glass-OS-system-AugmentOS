package com.mentra.asg_client.service.core.handlers;

import android.content.Context;
import android.util.Log;

import com.mentra.asg_client.reporting.GlassesLogBuffer;
import com.mentra.asg_client.service.legacy.interfaces.ICommandHandler;
import com.mentra.asg_client.service.system.interfaces.IConfigurationManager;
import com.mentra.asg_client.utils.ServerConfigUtil;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Handles the "upload_incident_logs" BLE command sent by the phone when a bug report is submitted.
 * Reads recent logcat output for this process and POSTs it directly to the backend over WiFi,
 * populating the glassesLogs slot on the incident record.
 *
 * <p>The phone sends only a small incidentId (~50 bytes) over BLE; the heavy log upload
 * happens over WiFi, so BLE bandwidth is not impacted.</p>
 */
public class UploadIncidentLogsCommandHandler implements ICommandHandler {

    private static final String TAG = "UploadIncidentLogsHandler";
    private static final int MAX_LOG_LINES = 400;

    private static final MediaType JSON_MEDIA_TYPE =
            MediaType.parse("application/json; charset=utf-8");

    private final Context mContext;
    private final IConfigurationManager mConfigurationManager;

    public UploadIncidentLogsCommandHandler(Context context,
                                            IConfigurationManager configurationManager) {
        mContext = context;
        mConfigurationManager = configurationManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("upload_incident_logs");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        if (!"upload_incident_logs".equals(commandType)) {
            Log.e(TAG, "Unsupported command: " + commandType);
            return false;
        }

        String incidentId;
        try {
            incidentId = data.getString("incidentId");
            if (incidentId == null || incidentId.isEmpty()) {
                Log.e(TAG, "incidentId is missing from upload_incident_logs command");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse incidentId from command data", e);
            return false;
        }

        Log.i(TAG, "📋 Uploading glasses logs for incident: " + incidentId);

        final String finalIncidentId = incidentId;
        new Thread(() -> uploadLogs(finalIncidentId)).start();

        return true;
    }

    private void uploadLogs(String incidentId) {
        try {
            String coreToken = mConfigurationManager.getCoreToken();
            if (coreToken == null || coreToken.isEmpty()) {
                Log.e(TAG, "No coreToken available — cannot upload incident logs");
                return;
            }

            String baseUrl = ServerConfigUtil.getServerBaseUrl(mContext);
            // baseUrl = "https://devapi.mentra.glass:443";
            String url = baseUrl + "/api/incidents/" + incidentId + "/logs";
            Log.d(TAG, "Glasses backend base URL: " + baseUrl + " | POST URL: " + url);

            JSONArray logs = GlassesLogBuffer.getRecentLogs(MAX_LOG_LINES);

            JSONObject body = new JSONObject();
            body.put("source", "glasses");
            body.put("logs", logs);

            RequestBody requestBody = RequestBody.create(body.toString(), JSON_MEDIA_TYPE);

            OkHttpClient client = new OkHttpClient.Builder()
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .readTimeout(15, TimeUnit.SECONDS)
                    .build();

            Request request = new Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer " + coreToken)
                    .post(requestBody)
                    .build();

            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to upload glasses logs for incident " + incidentId, e);
                }

                @Override
                public void onResponse(Call call, Response response) {
                    if (response.isSuccessful()) {
                        Log.i(TAG, "✅ Glasses logs uploaded for incident " + incidentId
                                + " (" + logs.length() + " entries)");
                    } else {
                        Log.e(TAG, "❌ Server rejected glasses logs upload, status: "
                                + response.code() + " for incident " + incidentId);
                    }
                    response.close();
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Error preparing glasses logs upload for incident " + incidentId, e);
        }
    }
}
