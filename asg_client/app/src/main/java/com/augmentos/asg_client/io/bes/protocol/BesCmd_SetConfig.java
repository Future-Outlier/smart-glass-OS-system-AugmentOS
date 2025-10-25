package com.augmentos.asg_client.io.bes.protocol;

import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

/**
 * Configure BT name, address, and other options
 * Allows customization during firmware update
 */
public class BesCmd_SetConfig extends BesBaseCommand {
    private static final String TAG = "BesCmd_SetConfig";
    
    private boolean clearUserData = false;
    private boolean updateBtName = false;
    private String btName = null;
    private boolean updateBleName = false;
    private String bleName = null;
    private boolean updateBtAddress = false;
    private String btAddress = null;
    private boolean updateBleAddress = false;
    private String bleAddress = null;
    
    public BesCmd_SetConfig() {
        super(BesProtocolConstants.SCMD_SET_CONFIG);
    }

    public void setClearUserData(boolean clear) {
        this.clearUserData = clear;
    }

    public void setUpdateBtName(boolean update, String name) {
        this.updateBtName = update;
        this.btName = name;
    }

    public void setUpdateBleName(boolean update, String name) {
        this.updateBleName = update;
        this.bleName = name;
    }

    public void setUpdateBtAddress(boolean update, String address) {
        this.updateBtAddress = update;
        this.btAddress = address;
    }

    public void setUpdateBleAddress(boolean update, String address) {
        this.updateBleAddress = update;
        this.bleAddress = address;
    }

    /**
     * Set the firmware file path and build config payload
     * @param filePath Path to firmware .bin file
     * @return true if successful
     */
    public boolean setFilePath(String filePath) {
        try {
            File file = new File(filePath);
            if (!file.exists()) {
                Log.e(TAG, "Firmware file not found: " + filePath);
                return false;
            }

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

            // Build payload with config flags and MD5
            // Format: [flags] + [btName?] + [bleName?] + [btAddr?] + [bleAddr?] + MD5
            // For now, simple implementation with MD5 only
            byte[] payload = new byte[16 + 1]; // MD5 + clear flag
            payload[0] = (byte) (clearUserData ? 1 : 0);
            System.arraycopy(md5Hash, 0, payload, 1, 16);
            
            setPlayload(payload);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error setting config", e);
            return false;
        }
    }
}

