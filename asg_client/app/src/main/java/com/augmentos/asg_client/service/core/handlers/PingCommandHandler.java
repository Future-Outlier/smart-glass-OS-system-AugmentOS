package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;

import org.json.JSONObject;

/**
 * Handler for ping commands.
 * Follows Single Responsibility Principle by handling only ping commands.
 */
public class PingCommandHandler implements ICommandHandler {
    private static final String TAG = "PingCommandHandler";
    
    private final ICommunicationManager communicationManager;
    private final IResponseBuilder responseBuilder;

    public PingCommandHandler(ICommunicationManager communicationManager, 
                            IResponseBuilder responseBuilder) {
        this.communicationManager = communicationManager;
        this.responseBuilder = responseBuilder;
    }

    @Override
    public String getCommandType() {
        return "ping";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        Log.d(TAG, "🏓 =========================================");
        Log.d(TAG, "🏓 HANDLE PING COMMAND");
        Log.d(TAG, "🏓 =========================================");
        Log.d(TAG, "🏓 Received ping data: " + (data != null ? data.toString() : "null"));
        
        try {
            Log.d(TAG, "🏓 🔨 Building ping response...");
            JSONObject pingResponse = responseBuilder.buildPingResponse();
            Log.d(TAG, "🏓 📤 Sending ping response: " + pingResponse.toString());
            
            boolean sent = communicationManager.sendBluetoothResponse(pingResponse);
            Log.d(TAG, "🏓 " + (sent ? "✅ Ping command handled successfully" : "❌ Failed to send ping response"));
            return sent;
        } catch (Exception e) {
            Log.e(TAG, "🏓 💥 Error handling ping command", e);
            return false;
        }
    }
} 