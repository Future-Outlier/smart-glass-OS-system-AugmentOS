package com.augmentos.asg_client.io.bes.protocol;

import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;

/**
 * Send file size and metadata to BES
 * Prepares BES for receiving firmware data
 */
public class BesCmd_SetStartInfo extends BesBaseCommand {
    private static final String TAG = "BesCmd_SetStartInfo";
    
    public BesCmd_SetStartInfo() {
        super(BesProtocolConstants.SCMD_SET_START_INFO);
    }

    /**
     * Set the firmware file path and calculate metadata
     * @param filePath Path to firmware .bin file
     * @return true if successful, false if file not found or error
     */
    public boolean setFilePath(String filePath) {
        try {
            File file = new File(filePath);
            if (!file.exists()) {
                Log.e(TAG, "Firmware file not found: " + filePath);
                return false;
            }

            long fileSize = file.length();
            
            // Calculate MD5 hash
            MessageDigest md = MessageDigest.getInstance("MD5");
            FileInputStream fis = new FileInputStream(file);
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                md.update(buffer, 0, bytesRead);
            }
            fis.close();
            byte[] md5Hash = md.digest();

            // Build payload: fileSize (4 bytes) + MD5 (16 bytes)
            byte[] payload = new byte[20];
            
            // File size in little-endian
            payload[0] = (byte) (fileSize & 0xFF);
            payload[1] = (byte) ((fileSize >> 8) & 0xFF);
            payload[2] = (byte) ((fileSize >> 16) & 0xFF);
            payload[3] = (byte) ((fileSize >> 24) & 0xFF);
            
            // MD5 hash
            System.arraycopy(md5Hash, 0, payload, 4, 16);
            
            setPlayload(payload);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error setting file path", e);
            return false;
        }
    }
}

