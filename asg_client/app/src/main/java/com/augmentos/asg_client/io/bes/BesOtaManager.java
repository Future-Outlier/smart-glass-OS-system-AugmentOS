package com.augmentos.asg_client.io.bes;

import android.util.Log;

import com.augmentos.asg_client.io.bes.events.BesOtaProgressEvent;
import com.augmentos.asg_client.io.bes.protocol.*;
import com.augmentos.asg_client.io.bes.util.BesOtaUtil;
import com.augmentos.asg_client.io.bluetooth.core.ComManager;

import org.greenrobot.eventbus.EventBus;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Manages BES2700 firmware OTA updates
 * Handles file loading, packet transmission, state tracking, and protocol state machine
 */
public class BesOtaManager implements BesOtaUartListener, BesOtaCommandListener {
    private static final String TAG = "BesOtaManager";
    
    // Static flag to track if BES OTA is in progress
    public static volatile boolean isBesOtaInProgress = false;
    
    private static BesOtaManager mInstance;
    private static byte[] sCurrentFirmwareVersion = null; // Store current firmware version bytes
    private String filePath;
    private boolean bInit = false;
    private byte[] fileData = null;
    private int fileLen = 0;
    private int sentPos = 0;
    private int curSentLen = 0;
    private int confirmTimes = 0;
    private int confirmSentPos = 0;
    private boolean bWait4Confirm = false;
    
    private ComManager comManager;
    private BesOtaCommandListener mListener;

    /**
     * Constructor - receives ComManager instance from AsgClientService
     * @param comManager The ComManager instance for UART communication
     */
    public BesOtaManager(ComManager comManager) {
        this.comManager = comManager;
    }
    
    /**
     * Get singleton instance (for checking isBesOtaInProgress flag)
     * @return BesOtaManager instance
     */
    public static BesOtaManager getInstance() {
        return mInstance;
    }
    
    /**
     * Set singleton instance (called by AsgClientService)
     * @param instance The BesOtaManager instance
     */
    public static void setInstance(BesOtaManager instance) {
        mInstance = instance;
    }
    
    /**
     * Get current firmware version from BES device
     * @return byte array with [major, minor, patch, build] or null if not available
     */
    public static byte[] getCurrentFirmwareVersion() {
        return sCurrentFirmwareVersion;
    }
    
    /**
     * Convert server version code (long) to BES firmware version format (byte array)
     * Server version format: XYYYYZZ where X=major, Y=minor, Z=patch
     * BES format: [major, minor, patch, build]
     * @param versionCode Server version code
     * @return byte array [major, minor, patch, build]
     */
    public static byte[] parseServerVersionCode(long versionCode) {
        int major = (int)(versionCode / 1000000);
        int minor = (int)((versionCode / 1000) % 1000);
        int patch = (int)(versionCode % 1000);
        int build = 0; // Build not specified in version code
        
        return new byte[]{(byte)major, (byte)minor, (byte)patch, (byte)build};
    }
    
    /**
     * Compare two BES firmware versions
     * @param v1 First version
     * @param v2 Second version
     * @return true if v1 is newer than v2, false otherwise
     */
    public static boolean isNewerVersion(byte[] v1, byte[] v2) {
        if (v1 == null || v2 == null || v1.length < 4 || v2.length < 4) {
            return false;
        }
        
        // Compare major.minor.patch.build
        for (int i = 0; i < 4; i++) {
            int b1 = v1[i] & 0xFF;
            int b2 = v2[i] & 0xFF;
            if (b1 > b2) return true;
            if (b1 < b2) return false;
        }
        return false;
    }
    
    public void registerCmdListener(BesOtaCommandListener listener) {
        mListener = listener;
    }
    
    /**
     * Initialize firmware file and prepare for OTA
     * @param filePath Path to firmware .bin file
     * @return true if initialized successfully, false otherwise
     */
    public boolean init(String filePath) {
        this.filePath = filePath;
        bInit = false;
        File f = new File(this.filePath);
        if (!f.exists()) {
            Log.e(TAG, "BES firmware file not exist: " + this.filePath);
            return false;
        }
        try {
            FileInputStream inputStream = new FileInputStream(filePath);
            fileLen = inputStream.available();
            fileData = new byte[fileLen];
            inputStream.read(fileData, 0, fileLen);
            inputStream.close();
            bInit = true;
            if (fileLen > BesOtaUtil.MAX_FILE_SIZE) {
                Log.e(TAG, "BES firmware file too big, len=" + fileLen);
                return false;
            }
            Log.d(TAG, "BES firmware loaded, size=" + fileLen + " bytes");
            return true;
        } catch (FileNotFoundException e) {
            Log.e(TAG, "BES firmware file not found", e);
        } catch (IOException e) {
            Log.e(TAG, "Error reading BES firmware file", e);
        }
        return false;
    }
    
    /**
     * Start firmware update process
     * @param filePath Path to firmware .bin file
     * @return true if started successfully
     */
    public boolean startFirmwareUpdate(String filePath) {
        if (!init(filePath)) {
            Log.e(TAG, "Failed to initialize firmware update");
            return false;
        }
        
        // Set OTA in progress flag
        isBesOtaInProgress = true;
        
        // Enable OTA mode on ComManager
        if (comManager != null) {
            comManager.setOtaUpdating(true);
            comManager.setFastMode(true); // 5ms sleep for fast transfer
        }
        
        // Emit started event
        EventBus.getDefault().post(BesOtaProgressEvent.createStarted(fileLen));
        
        // Start protocol sequence - send first command
        byte[] data = SCmd_GetProtocolVersion();
        if (send(data)) {
            Log.i(TAG, "BES firmware update started");
            return true;
        } else {
            Log.e(TAG, "Failed to send initial command");
            EventBus.getDefault().post(BesOtaProgressEvent.createFailed("Failed to send initial command"));
            cleanup();
            return false;
        }
    }
    
    /**
     * Cleanup and reset state
     */
    private void cleanup() {
        isBesOtaInProgress = false;
        if (comManager != null) {
            comManager.setOtaUpdating(false);
            comManager.setFastMode(false);
        }
        bInit = false;
        fileData = null;
        sentPos = 0;
        confirmTimes = 0;
    }

    // ========== Protocol Commands ==========
    
    public byte[] SCmd_GetProtocolVersion() {
        if (!bInit) return null;
        BesCmd_GetProtocolVersion cmd = new BesCmd_GetProtocolVersion();
        return cmd.getSendData();
    }

    public byte[] SCmd_SetUser() {
        if (!bInit) return null;
        BesCmd_SetUser cmd = new BesCmd_SetUser();
        return cmd.getSendData();
    }

    public byte[] SCmd_GetFirmwareVersion() {
        if (!bInit) return null;
        BesCmd_GetFirmwareVersion cmd = new BesCmd_GetFirmwareVersion();
        return cmd.getSendData();
    }

    public byte[] SCmd_SelectSide() {
        if (!bInit) return null;
        BesCmd_SelectSide cmd = new BesCmd_SelectSide();
        return cmd.getSendData();
    }

    public byte[] SCmd_CheckBreakPoint() {
        if (!bInit) return null;
        BesCmd_CheckBreakpoint cmd = new BesCmd_CheckBreakpoint();
        return cmd.getSendData();
    }

    public byte[] SCmd_SetStartInfo() {
        if (!bInit) return null;
        BesCmd_SetStartInfo cmd = new BesCmd_SetStartInfo();
        if (!cmd.setFilePath(filePath)) {
            return null;
        }
        return cmd.getSendData();
    }

    public byte[] SCmd_SetConfig(boolean bClearUserData, String btName, String bleName, String btAddress, String bleAddress) {
        if (!bInit) return null;
        BesCmd_SetConfig cmd = new BesCmd_SetConfig();
        cmd.setClearUserData(bClearUserData);
        if (btName != null && btName.length() > 0)
            cmd.setUpdateBtName(true, btName);
        if (bleName != null && bleName.length() > 0)
            cmd.setUpdateBleName(true, bleName);
        if (btAddress != null && btAddress.length() > 0)
            cmd.setUpdateBtAddress(true, btAddress);
        if (bleAddress != null && bleAddress.length() > 0)
            cmd.setUpdateBleAddress(true, bleAddress);
        if (!cmd.setFilePath(filePath)) {
            return null;
        }
        bWait4Confirm = false;
        return cmd.getSendData();
    }
    
    public byte[] SCmd_SendFileData() {
        if (!bInit) return null;
        BesCmd_SendData cmd = new BesCmd_SendData();
        int len = curSentLen;
        if (len > 0) {
            byte[] data = new byte[len];
            System.arraycopy(fileData, sentPos, data, 0, len);
            cmd.setFileData(data);
            return cmd.getSendData();
        }
        return null;
    }

    public void addSentSize(int size) {
        sentPos += size;
    }

    public void crc32ConfirmSuccess() {
        confirmTimes++;
        confirmSentPos = sentPos;
        bWait4Confirm = false;
    }

    public int getConfirmLength() {
        return confirmSentPos;
    }
    
    public int getTotalLength() {
        return fileLen;
    }
    
    public boolean isSentFinish() {
        return confirmSentPos == fileLen;
    }

    public boolean isNeedSegmentVerify() {
        if (bWait4Confirm) {
            return true;
        }
        int minSize = Math.min(BesOtaUtil.SEGMENT_SIZE * (confirmTimes + 1), fileLen);
        if (sentPos + BesOtaUtil.PACKET_SIZE >= minSize) {
            curSentLen = minSize - sentPos;
            bWait4Confirm = true;
        } else {
            curSentLen = BesOtaUtil.PACKET_SIZE;
        }
        return false;
    }

    public byte[] SCmd_SegmentVerify() {
        if (!bInit) return null;
        int srcPos = BesOtaUtil.SEGMENT_SIZE * confirmTimes;
        byte[] crcSegmentData = new byte[sentPos - srcPos];
        System.arraycopy(fileData, srcPos, crcSegmentData, 0, crcSegmentData.length);
        long crc32 = BesOtaUtil.crc32(crcSegmentData, 0, crcSegmentData.length);
        Log.d(TAG, "Segment CRC32=" + crc32 + ", sentPos=" + sentPos + ", confirmTimes=" + confirmTimes);
        byte[] crcBytes = BesOtaUtil.long2Bytes(crc32);
        BesCmd_SegmentVerify cmd = new BesCmd_SegmentVerify();
        cmd.setSegmentCrc32(crcBytes);
        return cmd.getSendData();
    }

    public byte[] SCmd_FinshSend() {
        if (!bInit) return null;
        BesCmd_FinishSend cmd = new BesCmd_FinishSend();
        return cmd.getSendData();
    }

    public byte[] SCmd_OtaApply() {
        if (!bInit) return null;
        BesCmd_Apply cmd = new BesCmd_Apply();
        return cmd.getSendData();
    }

    // ========== Receive Parser ==========
    
    private static final int RECV_BUFFER_SIZE = 512;
    private byte[] recvBuffer = new byte[512];
    private int curRecvLen = 0;

    public BesOtaMessage parseRecv(byte[] data, int offset, int len) {
        if (data == null) return null;
        
        BesOtaMessage m = new BesOtaMessage();
        
        if (curRecvLen > 0) {
            // Continuation of previous packet
            m.cmd = recvBuffer[0];
            if (curRecvLen + len > RECV_BUFFER_SIZE) {
                Log.e(TAG, "Receive buffer overflow, curRecvLen=" + curRecvLen + ", len=" + len);
                m.error = true;
                curRecvLen = 0;
                return m;
            }
            System.arraycopy(data, offset, recvBuffer, curRecvLen, len);
            curRecvLen += len;
            if (curRecvLen < BesBaseCommand.MIN_LENGTH) {
                Log.d(TAG, "Receive incomplete, curRecvLen=" + curRecvLen);
                return null;
            }
            m.len = BesOtaUtil.bytes2Int(recvBuffer, 1, 4);
            
            if (m.len + BesBaseCommand.MIN_LENGTH == curRecvLen) {
                m.error = false;
                curRecvLen = 0;
                if (m.len > 0) {
                    m.body = new byte[m.len];
                    System.arraycopy(recvBuffer, BesBaseCommand.MIN_LENGTH, m.body, 0, m.body.length);
                }
                return m;
            } else if (m.len + BesBaseCommand.MIN_LENGTH < curRecvLen || curRecvLen > RECV_BUFFER_SIZE) {
                Log.e(TAG, "Receive error, curRecvLen=" + curRecvLen + ", expected=" + (m.len + BesBaseCommand.MIN_LENGTH));
                m.error = true;
                curRecvLen = 0;
                return m;
            }
            return null;
        } else {
            // New packet
            if (len < BesBaseCommand.MIN_LENGTH) {
                System.arraycopy(data, offset, recvBuffer, 0, len);
                curRecvLen += len;
                return null;
            }
            m.cmd = data[0];
            m.len = BesOtaUtil.bytes2Int(data, 1, 4);
            if (m.len + BesBaseCommand.MIN_LENGTH == len) {
                m.error = false;
                if (m.len > 0) {
                    m.body = new byte[m.len];
                    System.arraycopy(data, offset + BesBaseCommand.MIN_LENGTH, m.body, 0, m.body.length);
                }
                return m;
            } else if (m.len + BesBaseCommand.MIN_LENGTH < len || len > RECV_BUFFER_SIZE) {
                Log.e(TAG, "Receive error, len=" + len + ", expected=" + (m.len + BesBaseCommand.MIN_LENGTH));
                m.error = true;
                curRecvLen = 0;
                return m;
            } else {
                System.arraycopy(data, offset, recvBuffer, 0, len);
                curRecvLen = len;
                return null;
            }
        }
    }

    // ========== BesOtaUartListener Implementation ==========
    
    @Override
    public void onOtaRecv(byte[] data, int size) {
        Log.d(TAG, "Received OTA data, size=" + size);
        BesOtaMessage otaMsg = parseRecv(data, 0, size);
        if (otaMsg != null) {
            if (!otaMsg.error) {
                dealOtaRecvCmd(otaMsg);
            } else {
                Log.e(TAG, "Received error in OTA message");
            }
        }
    }

    // ========== BesOtaCommandListener Implementation ==========
    
    @Override
    public void onParseResult(byte cmd, byte[] data) {
        // Callback for parsed commands (if needed)
        if (mListener != null) {
            mListener.onParseResult(cmd, data);
        }
    }

    // ========== Protocol State Machine ==========
    
    private void dealOtaRecvCmd(BesOtaMessage msg) {
        if (msg == null) return;
        
        if (msg.cmd == BesProtocolConstants.RCMD_GET_PROTOCOL_VERSION) {
            byte[] data = SCmd_SetUser();
            send(data);
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SET_USER) {
            if (msg.len == 1 && msg.body[0] == 1) {
                byte[] data = SCmd_GetFirmwareVersion();
                send(data);
            } else {
                Log.e(TAG, "Set user type error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_GET_FIRMWARE_VERSION) {
            Log.d(TAG, "Received firmware version, len=" + msg.len);
            if (msg.len > 9) {
                if (BesOtaUtil.isMagicCodeValid(msg.body, 0, 4)) {
                    byte[] firmware = BesOtaUtil.getFirmwareVersion(msg.body, 5, 4);
                    if (firmware != null) {
                        // Store current firmware version for comparison
                        sCurrentFirmwareVersion = firmware;
                        Log.i(TAG, "Current firmware version: " + firmware[0] + "." + firmware[1] + "." + firmware[2] + "." + firmware[3]);
                    }
                    byte[] data = SCmd_SelectSide();
                    send(data);
                } else {
                    Log.e(TAG, "Invalid magic code in firmware version");
                }
            } else {
                Log.e(TAG, "Invalid firmware version length");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SELECT_SIDE) {
            if (msg.len == 1 && msg.body[0] == 1) {
                byte[] data = SCmd_CheckBreakPoint();
                send(data);
            } else {
                Log.e(TAG, "Select side error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_GET_BREAKPOINT) {
            if (msg.len == 40) {
                byte[] data = SCmd_SetStartInfo();
                send(data);
            } else {
                Log.e(TAG, "Get breakpoint error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SET_START_INFO) {
            if (msg.len == 10) {
                if (BesOtaUtil.isMagicCodeValid(msg.body, 0, 4)) {
                    byte[] data = SCmd_SetConfig(false, null, null, null, null);
                    send(data);
                } else {
                    Log.e(TAG, "Set start info: invalid magic code");
                }
            } else {
                Log.e(TAG, "Set start info error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SET_CONFIG) {
            if (msg.len == 1 && msg.body[0] == 1) {
                sendOtaData();
            } else {
                Log.e(TAG, "Set config error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SEND_DATA) {
            sendOtaData();
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SEGMENT_VERIFY) {
            if (msg.len == 1 && msg.body[0] == 1) {
                int sent = getConfirmLength();
                int percent = 100 * sent / getTotalLength();
                Log.i(TAG, "OTA progress: " + percent + "%");
                
                // Emit progress event
                EventBus.getDefault().post(BesOtaProgressEvent.createProgress(percent, sent, getTotalLength(), "Sending firmware data"));
                
                crc32ConfirmSuccess();
                if (isSentFinish()) {
                    byte[] data = SCmd_FinshSend();
                    send(data);
                } else {
                    sendOtaData();
                }
            } else {
                Log.e(TAG, "Segment verify error");
                EventBus.getDefault().post(BesOtaProgressEvent.createFailed("Segment verification failed"));
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_SEND_FINISH) {
            if (msg.len == 1 && msg.body[0] == 1) {
                byte[] data = SCmd_OtaApply();
                send(data);
            } else {
                Log.e(TAG, "Send finish error");
            }
        }
        else if (msg.cmd == BesProtocolConstants.RCMD_APPLY) {
            if (msg.len == 1 && msg.body[0] == 1) {
                Log.i(TAG, "BES firmware update SUCCESS! BES will reboot.");
                EventBus.getDefault().post(BesOtaProgressEvent.createFinished());
            } else {
                Log.e(TAG, "Apply firmware error");
                EventBus.getDefault().post(BesOtaProgressEvent.createFailed("Failed to apply firmware"));
            }
            // Cleanup regardless
            cleanup();
        }
    }

    private void sendOtaData() {
        if (isNeedSegmentVerify()) {
            byte[] data = SCmd_SegmentVerify();
            send(data);
            return;
        }

        byte[] data = SCmd_SendFileData();
        if (send(data)) {
            addSentSize(data.length - BesBaseCommand.MIN_LENGTH);
        }
    }

    private boolean send(byte[] data) {
        if (comManager != null && data != null) {
            return comManager.sendOta(data);
        }
        return false;
    }
}

