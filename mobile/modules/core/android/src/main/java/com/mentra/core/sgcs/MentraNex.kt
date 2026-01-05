package com.mentra.core.sgcs

import android.os.Handler
import android.os.Looper
import android.util.Log

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings

import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue


import mentraos.ble.MentraosBle.PhoneToGlasses
import mentraos.ble.MentraosBle.DisplayText
import mentraos.ble.MentraosBle.HeadUpAngleConfig
import mentraos.ble.MentraosBle.DisplayHeightConfig
import mentraos.ble.MentraosBle.BrightnessConfig
import mentraos.ble.MentraosBle.AutoBrightnessConfig
import mentraos.ble.MentraosBle.MicStateConfig

import com.mentra.core.sgcs.SGCManager
import com.mentra.core.Bridge

import com.mentra.core.utils.DeviceTypes
import com.mentra.core.utils.BitmapJavaUtils
import com.mentra.core.utils.G1FontLoaderKt
import com.mentra.core.utils.G1Text
import com.mentra.core.utils.SmartGlassesConnectionState
import com.mentra.lc3Lib.Lc3Cpp
import com.mentra.core.utils.audio.Lc3Player

class MentraNex : SGCManager() {
    companion object {
        private const val TAG = "MentraNex";

        private val MAIN_SERVICE_UUID: UUID = UUID.fromString("00004860-0000-1000-8000-00805f9b34fb")
        private val WRITE_CHAR_UUID: UUID = UUID.fromString("000071FF-0000-1000-8000-00805f9b34fb")
        private val NOTIFY_CHAR_UUID: UUID = UUID.fromString("000070FF-0000-1000-8000-00805f9b34fb")
        private val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val PACKET_TYPE_JSON: Byte = 0x01.toByte()
        private const val PACKET_TYPE_PROTOBUF: Byte = 0x02.toByte()
        private const val PACKET_TYPE_AUDIO: Byte = 0xA0.toByte()
        private const val PACKET_TYPE_IMAGE: Byte = 0xB0.toByte()

        private const val MAIN_TASK_HANDLER_CODE_GATT_STATUS_CHANGED: Int = 110
        private const val MAIN_TASK_HANDLER_CODE_DISCOVER_SERVICES: Int = 120
        private const val MAIN_TASK_HANDLER_CODE_CHARACTERISTIC_VALUE_NOTIFIED: Int = 210

        // actions of device or gatt
        private const val MAIN_TASK_HANDLER_CODE_CONNECT_DEVICE: Int = 310
        private const val MAIN_TASK_HANDLER_CODE_DISCONNECT_DEVICE: Int = 320
        private const val MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE: Int = 350
        private const val MAIN_TASK_HANDLER_CODE_CANCEL_RECONNECT_DEVICE: Int = 360
        private const val MAIN_TASK_HANDLER_CODE_RECONNECT_GATT: Int = 370
        private const val MAIN_TASK_HANDLER_CODE_SCAN_START: Int = 410
        private const val MAIN_TASK_HANDLER_CODE_SCAN_END: Int = 420

        // actions of NEX Glasses
        private const val MAIN_TASK_HANDLER_CODE_BATTERY_QUERY: Int = 620
        private const val MAIN_TASK_HANDLER_CODE_HEART_BEAT: Int = 630

        private const val MTU_517: Int = 517
        private const val MTU_DEFAULT: Int = 23

        // Constants for text wall display
        private const val TEXT_COMMAND: Int = 0x4E // Text command
        private const val DISPLAY_WIDTH: Int = 488
        private const val DISPLAY_USE_WIDTH: Int = 488 // How much of the display to use
        private const val FONT_MULTIPLIER: Float = 1.0f / 50.0f
        private const val OLD_FONT_SIZE: Int = 21 // Font size
        private const val FONT_DIVIDER: Float = 2.0f
        private const val LINES_PER_SCREEN: Int = 5 // Lines per screen
        private const val MAX_CHUNK_SIZE_DEFAULT: Int = 176 // Maximum chunk size for BLE packets

        private const val INITIAL_CONNECTION_DELAY_MS = 350L // Adjust this value as needed

        private const MICBEAT_INTERVAL_MS: Long = (1000 * 60) * 30; // micbeat every 30 minutes
    }

    private var mainDevice: BluetoothDevice? = null
    private var bluetoothAdapter: BluetoothAdapter = BluetoothAdapter.getDefaultAdapter()

    private var isScanningForCompatibleDevices: Boolean = false

    private var isMainConnected = false
    private var isKilled: Boolean = false
    private var lastConnectionTimestamp: Long = 0
    private var lastSendTimestamp: Long = 0
    private const val DELAY_BETWEEN_CHUNKS_SEND: Long = 10 // Adjust this value as needed

    private val fontLoader: G1FontLoaderKt = G1FontLoaderKt()
    private val textRenderer: G1Text = G1Text()
    private var preferredMainDeviceId: String? = null

    private var mainGlassGatt: BluetoothGatt? = null
    private var mainWriteChar: BluetoothGattCharacteristic? = null
    private var mainNotifyChar: BluetoothGattCharacteristic? = null
    private var currentMtu: Int = 0
    private var deviceMaxMTU: Int = 0

    private var MAX_CHUNK_SIZE: Int = MAX_CHUNK_SIZE_DEFAULT // Maximum chunk size for BLE packets
    private var BMP_CHUNK_SIZE: Int = 194 // BMP chunk size

    @Volatile private var isWorkerRunning = false
    // Queue to hold pending requests
    private val sendQueue = LinkedBlockingQueue<Array<SendRequest>>()
    private val mainWaiter = BooleanWaiter()
    private val mainServicesWaiter = BooleanWaiter()

    private var shouldUseGlassesMic: Boolean = true
    private var microphoneStateBeforeDisconnection: Boolean = false

    private var bleScanCallback: ScanCallback? = null

    private val findCompatibleDevicesHandler: Handler? = null

    private final BluetoothGattCallback mainGattCallback = createGattCallback();

    init {
        type = DeviceTypes.NEX
        hasMic = true
        micEnabled = false
        preferredMainDeviceId = CoreManager.getInstance().getDeviceName()
    }

    private val mainTaskHandler = Handler(Looper.getMainLooper(), Handler.Callback { msg ->
        val msgCode = msg.what
        Bridge.log("Nex: handleMessage msgCode: $msgCode")
        Bridge.log("Nex: handleMessage obj: ${msg.obj}")
        
        when (msgCode) {
            MAIN_TASK_HANDLER_CODE_GATT_STATUS_CHANGED -> { }

            MAIN_TASK_HANDLER_CODE_DISCOVER_SERVICES -> {
                val statusBool = msg.obj as? Boolean ?: false
                if (statusBool) {
                    mainGlassGatt?.let { initNexGlasses(it) }
                }
            }

            MAIN_TASK_HANDLER_CODE_CHARACTERISTIC_VALUE_NOTIFIED -> {
                val characteristic = msg.obj as? BluetoothGattCharacteristic
                characteristic?.let { onCharacteristicChangedHandler(it) }
            }

            MAIN_TASK_HANDLER_CODE_CONNECT_DEVICE -> {}
            MAIN_TASK_HANDLER_CODE_DISCONNECT_DEVICE -> {}

            MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE -> {
                mainDevice?.let { attemptGattConnection(it) }
            }

            MAIN_TASK_HANDLER_CODE_CANCEL_RECONNECT_DEVICE -> {}
            MAIN_TASK_HANDLER_CODE_RECONNECT_GATT -> {}
            MAIN_TASK_HANDLER_CODE_SCAN_START -> {}
            MAIN_TASK_HANDLER_CODE_SCAN_END -> {}

            MAIN_TASK_HANDLER_CODE_BATTERY_QUERY -> {
                queryBatteryStatus()
            }

            MAIN_TASK_HANDLER_CODE_HEART_BEAT -> {
                // Note: Heartbeat is now handled by receiving ping from glasses
                // This case is kept for backward compatibility but no longer used
                Bridge.log("Nex: Heartbeat handler called - no longer sending periodic pings")
            }
        }
        true
    })

    // Data class to represent a send request
    private data class SendRequest( val data: ByteArray, var waitTime: Int = -1) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false

            other as SendRequest

            if (!data.contentEquals(other.data)) return false
            if (waitTime != other.waitTime) return false

            return true
        }

        override fun hashCode(): Int {
            var result = data.contentHashCode()
            result = 31 * result + waitTime
            return result
        }
    }

    private class BooleanWaiter {
        @Volatile
        private var flag = true // initially true

        @Synchronized
        fun waitWhileTrue() {
            while (flag) {
                (this as Object).wait()
            }
        }

        @Synchronized
        fun setTrue() {
            flag = true
        }

        @Synchronized
        fun setFalse() {
            flag = false
            (this as Object).notifyAll()
        }
    }

    // Network Management
    override fun requestWifiScan () {}
    override fun sendWifiCredentials(ssid: String, password: String) {}
    override fun sendHotspotState(enabled: Boolean) {}

    // Gallery: Not supported on Nex (No camera)
    override fun queryGalleryStatus() {}
    override fun sendGalleryMode() {}

    // Camera & Media: Not supported on Nex (No camera)
    override fun requestPhoto(requestId: String, appId: String, size: String, webhookUrl: String?, authToken: String?, compress: String?) {}
    override fun startRtmpStream(message: MutableMap<String, Any>) { }
    override fun stopRtmpStream() { }
    override fun sendRtmpKeepAlive(message: MutableMap<String, Any>) { }
    override fun startBufferRecording() { }
    override fun stopBufferRecording() { }
    override fun saveBufferVideo(requestId: String, durationSeconds: Int) { }
    override fun startVideoRecording(requestId: String, save: Boolean) { }
    override fun stopVideoRecording(requestId: String) { }

    // Button Settings: Not supported on Nex
    override fun sendButtonPhotoSettings() { }
    override fun sendButtonModeSetting() { }
    override fun sendButtonVideoRecordingSettings() { }
    override fun sendButtonMaxRecordingTime() { }
    override fun sendButtonCameraLedSetting() { }

    // Connection
    override fun findCompatibleDevices() {
        if (isScanningForCompatibleDevices) {
            Bridge.log("Scan already in progress, skipping...")
            return
        }
        
        isScanningForCompatibleDevices = true
        val scanner = bluetoothAdapter.bluetoothLeScanner ?: run {
            Bridge.log("BluetoothLeScanner not available", Log.ERROR)
            isScanningForCompatibleDevices = false
            return
        }

        val foundDeviceNames = mutableListOf<String>()
        if (findCompatibleDevicesHandler == null) {
            findCompatibleDevicesHandler = Handler(Looper.getMainLooper())
        }

        // Optional: add filters if you want to narrow the scan
        val filters = mutableListOf<ScanFilter>()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .build()

        // Create a modern ScanCallback instead of the deprecated LeScanCallback
        bleScanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                val name = device.name
                val address = device.address
                
                name?.let {
                    Bridge.log("bleScanCallback onScanResult: $name address $address")
                    synchronized(foundDeviceNames) {
                        if (!foundDeviceNames.contains(it)) {
                            foundDeviceNames.add(it)
                            Bridge.log("Found smart glasses: $name")
                        }
                    }
                }
            }

            override fun onBatchScanResults(results: List<ScanResult>) {
                // If needed, handle batch results here
            }

            override fun onScanFailed(errorCode: Int) {
                Bridge.log("BLE scan failed with code: $errorCode", Log.ERROR)
            }
        }

        // Start scanning
        scanner.startScan(filters, settings, bleScanCallback)
        Bridge.log("Started scanning for smart glasses with BluetoothLeScanner...")
        scanner.flushPendingScanResults(bleScanCallback)
        
        // Stop scanning after 10 seconds (adjust as needed)
        findCompatibleDevicesHandler?.postDelayed({
            bleScanCallback?.let { scanner.stopScan(it) }
            isScanningForCompatibleDevices = false
            bleScanCallback = null
            Bridge.log("Stopped scanning for smart glasses.")
        }, 10000)
    }

    override fun connectById(id: String) {
        preferredMainDeviceId = id
        connectToSmartGlasses()
    }

    override fun getConnectedBluetoothName(): String {
        return mainDevice?.getName() ?: ""
    }

    override fun disconnect() {
        ready = false;
        destroy();
    }

    override fun forget() {
        ready = false;
        destroy();
        CoreManager.getInstance().handleConnectionStateChanged();
    }

    override fun cleanup() {
        // TODO: Later
    }

    // Device
    override fun setHeadUpAngle(angle: Int) {
        // Validate headUpAngle range (0 ~ 60)
        val validatedAngle = angle.coerceIn(0, 60)
        Bridge.log("Nex: === SENDING HEAD UP ANGLE COMMAND TO GLASSES ===")
        Bridge.log("Nex: Head Up Angle: $validatedAngle degrees (validated range: 0-60)")
        val headUpAngleConfig = HeadUpAngleConfig.newBuilder().setAngle(validatedAngle).build()
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setHeadUpAngle(headUpAngleConfig)
            .build()
        val cmdBytes = generateProtobufCommandBytes(phoneToGlasses)
        sendDataSequentially(cmdBytes, 10)
        Bridge.log("Nex: Sent headUp angle command => Angle: $validatedAngle")
    }

    override fun getBatteryStatus() {
        Bridge.log("Nex: Requesting battery status");
        queryBatteryStatus()
    }

    override fun exit() {
        sendDataSequentially(byteArrayOf(0x18.toByte()), 100)
    }

    override fun sendRgbLedControl( requestId: String, packageName: String?, action: String, color: String?, ontime: Int, offtime: Int, count: Int) {
        Bridge.log("sendRgbLedControl - not supported on Nex");
        Bridge.sendRgbLedControlResponse(requestId, false, "device_not_supported");
    }

    // Not supported in Nex
    override fun setSilentMode(enabled: Boolean) { }

    // Display
    override fun setBrightness(level: Int, autoMode: Boolean) {
        // TODO: test this logic. Is it correct? Should we send both or just one?
        Bridge.log("Nex: setBrightness() - level: " + level + "%, autoMode: " + autoMode);
        sendBrightnessCommand(level);
        sendAutoBrightnessCommand(autoMode);
    }

    override fun clearDisplay() { 
        Bridge.log("Nex: clearDisplay() - sending space");
        sendTextWall(" ")
    }

    override fun sendTextWall(text: String) {
        Bridge.log("Nex: sendTextWall() - text: " + text);
        val textChunks: ByteArray = createTextWallChunksForNex(text)
        sendDataSequentially(textChunks);
    }

    override fun sendDoubleTextWall(top: String, bottom: String) {
        Bridge.log("Nex: sendDoubleTextWall() - top: " + top + ", bottom: " + bottom);
        val finalText = buildString {
            textTop?.let { append(it) }
            textTop?.let { append("\n") }
            textBottom?.let { append(it) }
        }
        val textChunks = createTextWallChunksForNex(finalText)
        sendDataSequentially(textChunks)
    }

    override fun displayBitmap(base64ImageData: String): Boolean {
        try {
            val bmpData: ByteArray? = android.util.Base64.decode(base64ImageData, android.util.Base64.DEFAULT)
            if (bmpData == null || bmpData.length == 0) {
                Log.e(TAG, "Failed to decode base64 image data");
                return false;
            }

            displayBitmapImageForNexGlasses(bmpData)

        } catch (e: Exception) {
            Log.e(TAG, e.getMessage());
            null
        }

    }
    override fun showDashboard() {
        exit()
    }

    override fun setDashboardPosition(height: Int, depth: Int) {
        Bridge.log("Nex: setDashboardPosition() - height: " + height + ", depth: " + depth);
        sendDashboardPositionCommand(height, depth);
    }

    // Audio Control
    // TODO: Validate this logic. looks weird.
    override fun setMicEnabled(enabled: Boolean) {
        Bridge.log("Nex: setMicEnabled(): $enabled")
        // Update the shouldUseGlassesMic flag to reflect the current state
        shouldUseGlassesMic = enabled
        Bridge.log("Nex: Updated shouldUseGlassesMic to: $shouldUseGlassesMic")
        if (enabled) {
            Bridge.log("Nex: Microphone enabled, starting audio input handling")
            sendSetMicEnabled(true, 10)
            startMicBeat(MICBEAT_INTERVAL_MS.toInt())
        } else {
            Bridge.log("Nex: Microphone disabled, stopping audio input handling")
            sendSetMicEnabled(false, 10)
            stopMicBeat()
        }
    }

    override fun sortMicRanking(list: MutableList<String>): MutableList<String> {
        return list
    }

    //==================== HELPER FUNCTIONS =================================================
    private fun connectToSmartGlasses() {
        // Register bonding receiver
        Bridge.log("connectToSmartGlasses start")
        Bridge.log("try to ConnectToSmartGlassesing deviceModelName: ${device.deviceModelName} deviceAddress: ${device.deviceAddress}")
        preferredMainDeviceId = CoreManager.getInstance().getDeviceName()
        if (!bluetoothAdapter.isEnabled) {
            return
        }
        when {
            !device.deviceModelName.isNullOrEmpty() && !device.deviceAddress.isNullOrEmpty() -> {
                stopScan()
                mainDevice = bluetoothAdapter.getRemoteDevice(device.deviceAddress)
                mainTaskHandler?.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE, 0)
            }
            savedNexMainAddress != null -> {
                mainDevice = bluetoothAdapter.getRemoteDevice(savedNexMainAddress)
                mainTaskHandler?.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE, 0)
            }
            else -> {
                // Start scanning for devices
                stopScan()
                connectionState = SmartGlassesConnectionState.SCANNING
                connectionEvent(connectionState) // TODO: Figure out where is connection event defined????
                startScan()
            }
        }
    }

    private fun destroy() {
        Bridge.log("Nex: MentraNexSGC ONDESTROY")
        showHomeScreen()
        isKilled = true
        // stop BLE scanning
        stopScan()
        // Save current microphone state before destroying
        microphoneStateBeforeDisconnection = isMicrophoneEnabled
        Bridge.log("Nex: Saved microphone state during destroy: $microphoneStateBeforeDisconnection")
        // disable the microphone and stop sending micbeat
        stopMicBeat()
        // Stop periodic notifications
        stopPeriodicNotifications()
        mainGlassGatt?.let { gatt ->
            gatt.disconnect()
            gatt.close()
            mainGlassGatt = null
        }
        lc3AudioPlayer?.let { player ->
            try {
                player.stopPlay()
                Bridge.log("Nex: LC3 audio player stopped and cleaned up")
            } catch (e: Exception) {
                Bridge.log("Nex: Error stopping LC3 audio player during destroy: ${e.message}", Log.ERROR)
            } finally {
                lc3AudioPlayer = null
            }
        }
        // Clean up handlers
        mainTaskHandler?.removeCallbacksAndMessages(null)
        whiteListHandler?.removeCallbacksAndMessages(null)
        micEnableHandler?.removeCallbacksAndMessages(null)
        notificationHandler?.removeCallbacks(notificationRunnable)
        textWallHandler?.removeCallbacks(textWallRunnable)
        findCompatibleDevicesHandler?.removeCallbacksAndMessages(null)
        // Free LC3 decoder
        if (lc3DecoderPtr != 0L) {
            L3cCpp.freeDecoder(lc3DecoderPtr)
            lc3DecoderPtr = 0L
        }
        currentImageChunks.clear()
        isImageSendProgressing = false
        sendQueue.clear()
        // Add a dummy element to unblock the take() call if needed
        sendQueue.offer(emptyArray()) // is this needed?
        isWorkerRunning = false
        isMainConnected = false
        Bridge.log("Nex: MentraNexSGC cleanup complete")
    }

    private fun startScan() {
        val scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            Bridge.log("BluetoothLeScanner not available.", Log.ERROR)
            return
        }

        // Optionally, define filters if needed
        val filters = mutableListOf<ScanFilter>()
        // For example, to filter by device name:
        // filters.add(ScanFilter.Builder().setDeviceName("Even G1_").build())

        // Set desired scan settings
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        // Start scanning
        isScanning = true
        scanner.startScan(filters, settings, modernScanCallback)
        scanner.flushPendingScanResults(modernScanCallback)
        Bridge.log("CALL START SCAN - Started scanning for devices...")

        // Ensure scanning state is immediately communicated to UI
        connectionState = SmartGlassesConnectionState.SCANNING
        connectionEvent(connectionState)

        // Stop the scan after some time (e.g., 10-15s instead of 60 to avoid
        // throttling)
        // handler.postDelayed({ stopScan() }, 10000)
    }

    private fun stopScan() {
        val scanner = bluetoothAdapter.bluetoothLeScanner
        scanner?.stopScan(modernScanCallback)
        isScanning = false
        Bridge.log("Stopped scanning for devices")
        
        if (bleScanCallback != null && isScanningForCompatibleDevices) {
            scanner?.stopScan(bleScanCallback)
            isScanningForCompatibleDevices = false
        }
    }

    private fun displayBitmapImageForNexGlasses(bmpData: ByteArray, width: Int, height: Int) {
        Bridge.log("Starting BMP display process for ${width}x$height image")

        try {
            if (bmpData.isEmpty()) {
                Bridge.log("Invalid BMP data provided", Log.ERROR)
                return
            }

            Bridge.log("Processing BMP data, size: ${bmpData.size} bytes")

            // Generate proper 2-byte hex stream ID (e.g., "002A") as per protobuf specification
            val totalChunks = (bmpData.size + BMP_CHUNK_SIZE - 1) / BMP_CHUNK_SIZE
            val streamId = "%04X".format(random.nextInt(0x10000)) // 4-digit hex format
            
            val startImageSendingBytes = createStartSendingImageChunksCommand(streamId, totalChunks, width, height)
            sendDataSequentially(startImageSendingBytes)

            // Send all chunks with proper stream ID parsing
            val chunks = createBmpChunksForNexGlasses(streamId, bmpData, totalChunks)
            currentImageChunks = chunks
            sendDataSequentially(chunks)

            // Note: The following are commented out in the original
            // sendBmpEndCommand()
            // sendBmpCRC(bmpData)
            // lastThingDisplayedWasAnImage = true

        } catch (e: Exception) {
            Bridge.log("Error in displayBitmapImage: ${e.message}", Log.ERROR)
        }
    }

    private fun createBmpChunksForNexGlasses(streamId: String, bmpData: ByteArray, totalChunks: Int): List<ByteArray> {
        val chunks = mutableListOf<ByteArray>()
        Bridge.log("Creating $totalChunks chunks from ${bmpData.size} bytes")
        
        // Parse hex stream ID to bytes (e.g., "002A" -> 0x00, 0x2A)
        val streamIdInt = streamId.toInt(16)
        
        repeat(totalChunks) { i ->
            val start = i * BMP_CHUNK_SIZE
            val end = minOf(start + BMP_CHUNK_SIZE, bmpData.size)
            val chunk = bmpData.copyOfRange(start, end)
            
            val header = ByteArray(4 + chunk.size).apply {
                this[0] = PACKET_TYPE_IMAGE // 0xB0
                this[1] = (streamIdInt shr 8).toByte() // Stream ID high byte
                this[2] = streamIdInt.toByte()         // Stream ID low byte
                this[3] = i.toByte()                   // Chunk index
                System.arraycopy(chunk, 0, this, 4, chunk.size)
            }
            chunks.add(header)
        }
        return chunks
    }

    private fun createStartSendingImageChunksCommand(streamId: String, totalChunks: Int, width: Int, height: Int): ByteArray {
        Bridge.log("=== SENDING IMAGE DISPLAY COMMAND TO GLASSES ===")
        Bridge.log("Image Stream ID: $streamId")
        Bridge.log("Total Chunks: $totalChunks")
        Bridge.log("Image Position: X=0, Y=0")
        Bridge.log("Image Dimensions: ${width}x$height")
        Bridge.log("Image Encoding: raw")
        
        val displayImage = DisplayImage.newBuilder()
            .setStreamId(streamId)
            .setTotalChunks(totalChunks)
            .setX(0)
            .setY(0)
            .setWidth(width)
            .setHeight(height)
            .setEncoding("raw")
            .build()

        // Create the PhoneToGlasses using its builder and set the DisplayImage with msg_id
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setMsgId("img_start_1")
            .setDisplayImage(displayImage)
            .build()

        return generateProtobufCommandBytes(phoneToGlasses)
    }

    private fun sendDashboardPositionCommand(height: Int, depth: Int) {
        // clamp height to 0-8 and depth to 1-9
        val clampedHeight = height.coerceIn(0, 8)
        val clampedDepth = depth.coerceIn(1, 9)
        Bridge.log("Nex: === SENDING DASHBOARD POSITION COMMAND TO GLASSES ===")
        Bridge.log("Nex: Dashboard Position - Height: $clampedHeight (0-8), Depth: $clampedDepth (1-9)")
        val displayHeightConfig = DisplayHeightConfig.newBuilder()
            .setHeight(clampedHeight)
            .build()
        
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setDisplayHeight(displayHeightConfig)
            .build()
        val cmdBytes = generateProtobufCommandBytes(phoneToGlasses)
        sendDataSequentially(cmdBytes, 10)
        Bridge.log("Nex: Sent dashboard height/depth command => Height: $clampedHeight, Depth: $clampedDepth")
    }

    private fun sendBrightnessCommand(brightness: Int) {
        // Validate brightness range
        val validBrightness = if (brightness != -1) {
            (brightness * 63) / 100
        } else {
            (30 * 63) / 100 // Default to 30% if brightness is -1
        }

        Bridge.log("Nex: === SENDING BRIGHTNESS COMMAND TO GLASSES ===")
        Bridge.log("Nex: Brightness Value: $brightness (validated: $validBrightness)")

        val brightnessConfig = BrightnessConfig.newBuilder()
            .setValue(brightness)
            .build()

        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setBrightness(brightnessConfig)
            .build()

        val cmdBytes = generateProtobufCommandBytes(phoneToGlasses)
        sendDataSequentially(cmdBytes, 10)

        Bridge.log("Nex: Sent auto light brightness command => Brightness: $brightness")
    }

    private fun sendAutoBrightnessCommand(autoLight: Boolean) {
        Bridge.log("Nex: === SENDING AUTO BRIGHTNESS COMMAND TO GLASSES ===")
        Bridge.log("Nex: Auto Brightness Enabled: $autoLight")

        val autoBrightnessConfig = AutoBrightnessConfig.newBuilder()
            .setEnabled(autoLight)
            .build()
            
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setAutoBrightness(autoBrightnessConfig)
            .build()

        val cmdBytes = generateProtobufCommandBytes(phoneToGlasses)
        sendDataSequentially(cmdBytes, 10)

        Bridge.log("Nex: Sent auto light sendAutoBrightnessCommand => $autoLight")
    }

    private fun queryBatteryStatus() {
        Bridge.log("Nex: === SENDING BATTERY STATUS QUERY TO GLASSES ===")
        val batteryQueryPacket = constructBatteryLevelQuery()
        sendDataSequentially(batteryQueryPacket, 250)
    }

    private fun constructBatteryLevelQuery(): ByteArray {
        val batteryStateRequest = BatteryStateRequest.newBuilder().build()
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setBatteryState(batteryStateRequest)
            .build()
        return generateProtobufCommandBytes(phoneToGlasses)
    }

    private fun createTextWallChunksForNex(text: String): ByteArray {
        val textNewBuilder = DisplayText.newBuilder()
            .setColor(10000)
            .setText(text)
            .setSize(48)
            .setX(20)
            .setY(260)
            .build()

        Bridge.log("Nex: === SENDING TEXT TO GLASSES ===")
        Bridge.log("Nex: Text: \"$text\"")
        Bridge.log("Nex: Text Length: ${text.length} characters")
        Bridge.log("Nex: DisplayText Builder: $textNewBuilder")

        // Create the PhoneToGlasses using its builder and set the DisplayText
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setDisplayText(textNewBuilder)
            .build()

        return generateProtobufCommandBytes(phoneToGlasses)
    }

    private fun generateProtobufCommandBytes(phoneToGlasses: PhoneToGlasses): ByteArray {
        val contentBytes = phoneToGlasses.toByteArray()
        val chunk = ByteBuffer.allocate(contentBytes.size + 1)

        chunk.put(PACKET_TYPE_PROTOBUF)
        chunk.put(contentBytes)

        // Enhanced logging for protobuf messages
        val result = chunk.array()
        logProtobufMessage(phoneToGlasses, result)

        return result
    }

    // Enhanced logging method for protobuf messages
    private fun logProtobufMessage(phoneToGlasses: PhoneToGlasses, fullMessage: ByteArray) {
        val logMessage = buildString {
            appendLine("=== PROTOBUF MESSAGE TO GLASSES ===")
            appendLine("Message Type: ${phoneToGlasses.payloadCase}")

            // Extract and log text content if present
            when {
                phoneToGlasses.hasDisplayText() -> {
                    val text = phoneToGlasses.displayText.text
                    appendLine("Text Content: \"$text\"")
                    appendLine("Text Length: ${text.length} characters")
                }
                phoneToGlasses.hasDisplayScrollingText() -> {
                    val text = phoneToGlasses.displayScrollingText.text
                    appendLine("Scrolling Text Content: \"$text\"")
                    appendLine("Text Length: ${text.length} characters")
                }
            }

            // Log message size information
            appendLine("Protobuf Payload Size: ${phoneToGlasses.toByteArray().size} bytes")
            appendLine("Total Message Size: ${fullMessage.size} bytes")
            appendLine("Packet Type: 0x${PACKET_TYPE_PROTOBUF.toString(16).padStart(2, '0').uppercase()}")
            append("=====================================")
        }

        Bridge.log("Nex: $logMessage")
    }

    // Non-blocking function to add new send request
    private fun sendDataSequentially(data: ByteArray) {
        val chunks = arrayOf(SendRequest(data))
        sendQueue.offer(chunks)
        startWorkerIfNeeded()
    }

    // Non-blocking function to add new send request with wait time
    private fun sendDataSequentially(data: ByteArray, waitTime: Int) {
        val chunks = arrayOf(SendRequest(data, waitTime))
        sendQueue.offer(chunks)
        startWorkerIfNeeded()
    }

    private fun sendDataSequentially(data: List<ByteArray>) {
        val chunks = Array(data.size) { i -> SendRequest(data[i]) }
        sendQueue.offer(chunks)
        startWorkerIfNeeded()
    }

    // Start the worker thread if it's not already running
    @Synchronized
    private fun startWorkerIfNeeded() {
        if (!isWorkerRunning) {
            isWorkerRunning = true
            Thread({ processQueue() }, "MentraNexSGCProcessQueue").start()
        }
    }

    private fun processQueue() {
        // First wait until the services are ready to receive data
        Bridge.log("Nex: PROC_QUEUE - waiting on services waiters")
        try {
            mainServicesWaiter.waitWhileTrue()
        } catch (e: InterruptedException) {
            Bridge.log("Nex: Interrupted waiting for descriptor writes: $e", Log.ERROR)
        }
        Bridge.log("Nex: PROC_QUEUE - DONE waiting on services waiters")

        while (!isKilled) {
            try {
                // Make sure services are ready before processing requests
                mainServicesWaiter.waitWhileTrue()

                // This will block until data is available
                val requests = sendQueue.take()

                for (request in requests) {
                    if (isKilled) {
                        isWorkerRunning = false
                        break
                    }

                    try {
                        // Force an initial delay so BLE gets all setup
                        val timeSinceConnection = System.currentTimeMillis() - lastConnectionTimestamp
                        if (timeSinceConnection < INITIAL_CONNECTION_DELAY_MS) {
                            Thread.sleep(INITIAL_CONNECTION_DELAY_MS - timeSinceConnection)
                        }

                        // Send to main glass
                        if (mainGlassGatt != null && mainWriteChar != null && isMainConnected) {
                            mainWaiter.setTrue()
                            mainWriteChar?.value = request.data
                            mainGlassGatt?.writeCharacteristic(mainWriteChar)
                            lastSendTimestamp = System.currentTimeMillis()
                        }

                        mainWaiter.waitWhileTrue()

                        Thread.sleep(DELAY_BETWEEN_CHUNKS_SEND)

                        // If the packet asked us to do a delay, then do it
                        if (request.waitTime != -1) {
                            Thread.sleep(request.waitTime.toLong())
                        }
                    } catch (e: InterruptedException) {
                        Bridge.log("Nex: Error sending data: ${e.message}", Log.ERROR)
                        if (isKilled) break
                    }
                }
            } catch (e: InterruptedException) {
                if (isKilled) {
                    Bridge.log("Nex: Process queue thread interrupted - shutting down")
                    break
                }
                Bridge.log("Nex: Error in queue processing: ${e.message}", Log.ERROR)
            }
        }

        Bridge.log("Nex: Process queue thread exiting")
        isWorkerRunning = false
    }

    private fun sendSetMicEnabled(enable: Boolean, delay: Long) {
        Bridge.log("Nex: setMicEnabled called with enable: $enable and delay: $delay")
        Bridge.log("Nex: Running set mic enabled: $enable")
        isMicrophoneEnabled = enable // Update the state tracker
        micEnabled = enable
        
        micEnableHandler?.postDelayed({
            if (!isConnected()) {
                Bridge.log("Nex: Tryna start mic: Not connected to glasses")
                return@postDelayed
            }
            Bridge.log("Nex: === SENDING MICROPHONE STATE COMMAND TO GLASSES ===")
            Bridge.log("Nex: Microphone Enabled: $enable")
            val micStateConfig = MicStateConfig.newBuilder()
                .setEnabled(enable)
                .build()
            val phoneToGlasses = PhoneToGlasses.newBuilder()
                .setMicState(micStateConfig)
                .build()
            val micConfigBytes = generateProtobufCommandBytes(phoneToGlasses)
            sendDataSequentially(micConfigBytes, 10) // wait some time to setup the mic
            Bridge.log("Nex: Sent MIC command: ${micConfigBytes.joinToString("") { "%02x".format(it) }}")
        }, delay)
    }

    private fun initNexGlasses(gatt: BluetoothGatt) {
        // Start MTU discovery with our maximum target
        Bridge.log("Nex: 🔍 MTU Discovery: Requesting maximum MTU size: $MTU_517")
        Bridge.log("Nex: 🎯 Target: Use $MTU_517 bytes max, or $MTU_DEFAULT bytes default")
        Bridge.log("Nex: 📤 Requesting MTU: $MTU_517 bytes")
        gatt.requestMtu(MTU_517) // Request our maximum MTU

        val uartService = gatt.getService(MAIN_SERVICE_UUID)

        if (uartService != null) {
            val writeChar = uartService.getCharacteristic(WRITE_CHAR_UUID)
            val notifyChar = uartService.getCharacteristic(NOTIFY_CHAR_UUID)

            writeChar?.let { 
                mainWriteChar = it
                Bridge.log("Nex: glass TX characteristic found")
            }

            notifyChar?.let {
                mainNotifyChar = it
                enableNotification(gatt, it)
                Bridge.log("Nex: glass RX characteristic found")
            }

            // Mark as connected but wait for setup below to update connection state
            isMainConnected = true
            Bridge.log("Nex: PROC_QUEUE - left side setup complete")

            if (isMainConnected) {
                // Do first battery status query
                mainTaskHandler.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_BATTERY_QUERY, 10)

                // Restore previous microphone state or disable if this is the first connection
                val shouldRestoreMic = microphoneStateBeforeDisconnection
                Bridge.log("Nex: `Restoring microphone state to: $shouldRestoreMic (previous state: $microphoneStateBeforeDisconnection)")
                
                if (shouldRestoreMic) {
                    startMicBeat(MICBEAT_INTERVAL_MS.toInt())
                } else {
                    stopMicBeat()
                }

                // Enable our AugmentOS notification key
                sendWhiteListCommand(10)

                showHomeScreen() // Turn on the NexGlasses display
                updateConnectionState()

                // Post protobuf schema version information (only once)
                if (!protobufVersionPosted) {
                    postProtobufSchemaVersionInfo()
                    protobufVersionPosted = true
                }

                // Query glasses protobuf version from firmware
                queryGlassesProtobufVersionFromFirmware()
            }
        } else {
            Log.e(TAG, " glass UART service not found")
        }
    }

    private fun stopPeriodicNotifications() {
        notificationHandler?.removeCallbacks(notificationRunnable)
        Bridge.log("Stopped periodic notifications")
    }

    private fun startMicBeat(delay: Int) {
        Bridge.log("Nex: Starting micbeat")
        if (micBeatCount > 0) {
            stopMicBeat()
        }
        sendSetMicEnabled(true, 10)
        micBeatRunnable = Runnable {
            Bridge.log("Nex: SENDING MIC BEAT")
            setMicEnabled(shouldUseGlassesMic, 1)
            micBeatHandler.postDelayed(micBeatRunnable, MICBEAT_INTERVAL_MS)
        }
        micBeatHandler.postDelayed(micBeatRunnable, delay.toLong())
    }

    private fun stopMicBeat() {
        sendSetMicEnabled(false, 10)
        if (micBeatHandler != null) {
            micBeatHandler.removeCallbacksAndMessages(null);
            micBeatHandler.removeCallbacksAndMessages(micBeatRunnable);
            micBeatRunnable = null;
            micBeatCount = 0;
        }
    }

    private fun enableNotification(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        Bridge.log("Nex: PROC_QUEUE - Starting notification setup")
        
        // Enable notifications
        val result = gatt.setCharacteristicNotification(characteristic, true)
        Bridge.log("Nex: PROC_QUEUE - setCharacteristicNotification result: $result")

        // Set write type for the characteristic
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        Bridge.log("Nex: PROC_QUEUE - write type set")

        // Add delay
        Bridge.log("Nex: PROC_QUEUE - waiting to enable notification...")
        try {
            Thread.sleep(100)
        } catch (e: InterruptedException) {
            Log.e(TAG, "Error sending data: " + e.getMessage());
        }

        // Get and configure descriptor
        val descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)
        descriptor?.let {
            Bridge.log
            it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            val writeResult = gatt.writeDescriptor(it)
            Bridge.log("Nex: PROC_QUEUE - set descriptor with result: $writeResult")
        }
    }

    private fun sendWhiteListCommand(delay: Int) {
        if (whiteListedAlready) return
        
        whiteListedAlready = true
        Bridge.log("Nex: Sending whitelist command")
        
        whiteListHandler.postDelayed({
            val chunks = getWhitelistChunks()
            sendDataSequentially(chunks)
            
            // Uncomment if needed for debugging:
            // chunks.forEach { chunk ->
            //     Bridge.log("Nex: Sending this chunk for white list: ${bytesToUtf8(chunk)}")
            //     sendDataSequentially(chunk)
            //     // Thread.sleep(150) // Uncomment if delay between chunks is needed
            // }
        }, delay.toLong())
    }

    fun getWhitelistChunks(): List<ByteArray> {
        // Define the hardcoded whitelist
        val apps = listOf(AppInfo("com.augment.os", "AugmentOS"))
        val whitelistJson = createWhitelistJson(apps)

        Bridge.log("Creating chunks for hardcoded whitelist: $whitelistJson")

        // Convert JSON to bytes and split into chunks
        return createWhitelistChunks(whitelistJson)
    }

    private fun createWhitelistJson(apps: List<AppInfo>): String {
        return try {
            val appList = JSONArray().apply {
                apps.forEach { app ->
                    put(JSONObject().apply {
                        put("id", app.id)
                        put("name", app.name)
                    })
                }
            }

            JSONObject().apply {
                put("calendar_enable", false)
                put("call_enable", false)
                put("msg_enable", false)
                put("ios_mail_enable", false)
                put("app", JSONObject().apply {
                    put("list", appList)
                    put("enable", true)
                })
            }.toString()
        } catch (e: JSONException) {
            Bridge.log("Error creating whitelist JSON: ${e.message}", Log.ERROR)
            "{}"
        }
    }

    // Data class to hold app info
    data class AppInfo(
        val id: String,
        val name: String
    )

    // Helper function to split JSON into chunks
    private fun createWhitelistChunks(json: String): List<ByteArray> {
        val jsonBytes = json.toByteArray(Charsets.UTF_8)
        val totalChunks = (jsonBytes.size + MAX_CHUNK_SIZE - 1) / MAX_CHUNK_SIZE

        return List(totalChunks) { chunkIndex ->
            val start = chunkIndex * MAX_CHUNK_SIZE
            val end = (start + MAX_CHUNK_SIZE).coerceAtMost(jsonBytes.size)
            val payloadChunk = jsonBytes.copyOfRange(start, end)

            // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
            val header = byteArrayOf(
                WHITELIST_CMD.toByte(),
                totalChunks.toByte(),
                chunkIndex.toByte()
            )

            header + payloadChunk
        }
    }

    private fun showHomeScreen() {
        Bridge.log("Nex: showHomeScreen")
        
        if (lastThingDisplayedWasAnImage) {
            // clearNexScreen()
            lastThingDisplayedWasAnImage = false
        }
    }

    private fun updateConnectionState() {
        connectionState = if (isMainConnected) {
            SmartGlassesConnectionState.CONNECTED.also {
                Bridge.log("Nex: Main glasses connected")
                lastConnectionTimestamp = System.currentTimeMillis()
                // Removed commented sleep code as it's not needed
                connectionEvent(it)
            }
        } else {
            SmartGlassesConnectionState.DISCONNECTED.also {
                Bridge.log("Nex: No Main glasses connected")
                connectionEvent(it)
            }
        }
    }

    private fun createGattCallback(): BluetoothGattCallback {
        return object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                Bridge.log("onConnectionStateChange status State ${status == BluetoothGatt.GATT_SUCCESS}")
                Bridge.log("onConnectionStateChange connected State ${newState == BluetoothProfile.STATE_CONNECTED}")

                if (status == BluetoothGatt.GATT_SUCCESS) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        Bridge.log("glass connected, discovering services...")
                        gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                        gatt.setPreferredPhy(
                            BluetoothDevice.PHY_LE_2M_MASK, 
                            BluetoothDevice.PHY_LE_2M_MASK,
                            BluetoothDevice.PHY_OPTION_NO_PREFERRED
                        )

                        isMainConnected = true
                        mainReconnectAttempts = 0
                        Bridge.log("Both glasses connected. Stopping BLE scan.")
                        stopScan()

                        if (!isWorkerRunning) {
                            Bridge.log("Worker thread is not running. Starting it.")
                            startWorkerIfNeeded()
                        }

                        Bridge.log("Discover services calling...")
                        gatt.discoverServices()
                        updateConnectionState()
                        mainDevice?.let { device ->
                            savedNexMainName = device.name
                            savedNexMainAddress = device.address
                            savePairedDeviceNames()
                            savePairedDeviceAddress()
                        }
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        handleDisconnection(gatt)
                    }
                } else {
                    handleConnectionFailure(gatt, status)
                }
            }

            private fun handleDisconnection(gatt: BluetoothGatt) {
                Bridge.log("glass disconnected, stopping heartbeats")
                Bridge.log("Entering STATE_DISCONNECTED branch")
                
                // Save current microphone state before disconnection
                microphoneStateBeforeDisconnection = isMicrophoneEnabled
                Bridge.log("Saved microphone state before disconnection: $microphoneStateBeforeDisconnection")
                
                // Reset protobuf version posted flag for next connection
                protobufVersionPosted = false
                
                // Reset chunk sizes to defaults
                MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                mainServicesWaiter.setTrue()
                Bridge.log("Set mainServicesWaiter to true")
                forceSideDisconnection()
                Bridge.log("Called forceSideDisconnection()")
                currentMTU = 0
                
                // Stop any periodic transmissions
                stopMicBeat()
                sendQueue.clear()
                Bridge.log("Stopped heartbeat monitoring and mic beat; cleared sendQueue")
                updateConnectionState()
                Bridge.log("Updated connection state after disconnection")
                
                gatt.device?.let {
                    Bridge.log("Closing GATT connection for device: ${it.address}")
                    gatt.disconnect()
                    gatt.close()
                    Bridge.log("GATT connection closed")
                } ?: run {
                    Bridge.log("No GATT device available to disconnect")
                }
            }

            private fun handleConnectionFailure(gatt: BluetoothGatt, status: Int) {
                // Save current microphone state before connection failure
                microphoneStateBeforeDisconnection = isMicrophoneEnabled
                Bridge.log("Saved microphone state before connection failure: $microphoneStateBeforeDisconnection")
                
                currentMTU = 0
                MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                Bridge.log("Unexpected connection state encountered for glass: $status")
                stopMicBeat()
                sendQueue.clear()

                // Mark as not ready
                mainServicesWaiter.setTrue()
                Bridge.log("Stopped heartbeat monitoring and mic beat; cleared sendQueue due to connection failure")
                Bridge.log("glass connection failed with status: $status")
                
                isMainConnected = false
                mainReconnectAttempts++
                
                mainGlassGatt?.let {
                    it.disconnect()
                    it.close()
                    mainGlassGatt = null
                }

                forceSideDisconnection()
                Bridge.log("Called forceSideDisconnection() after connection failure")
                Bridge.log("GATT connection disconnected and closed due to failure")

                mainTaskHandler?.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE, 0)
            }

            private fun forceSideDisconnection() {
                Bridge.log("forceSideDisconnection() called")
                isMainConnected = false
                mainReconnectAttempts++
                Bridge.log("Main glass: Marked as disconnected and incremented mainReconnectAttempts to $mainReconnectAttempts")
                
                mainGlassGatt?.let {
                    Bridge.log("Main glass GATT exists. Disconnecting and closing mainGlassGatt")
                    it.disconnect()
                    it.close()
                    mainGlassGatt = null
                } ?: run {
                    Bridge.log("Main glass GATT is already null")
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val statusBool = status == BluetoothGatt.GATT_SUCCESS
                mainTaskHandler?.obtainMessage(
                    MAIN_TASK_HANDLER_CODE_DISCOVER_SERVICES,
                    if (statusBool) 1 else 0,
                    0
                )?.sendToTarget()
            }

            override fun onCharacteristicWrite(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                Bridge.log("onCharacteristicWrite callback - ")
                val values = characteristic.value ?: byteArrayOf()
                
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Bridge.log("onCharacteristicWrite PROC_QUEUE - glass write successful")
                    Bridge.log("onCharacteristicWrite len - ${values.size}")
                    val packetHex = bytesToHex(values)
                    Bridge.log("onCharacteristicWrite Values - $packetHex")
                    
                    if (values.isNotEmpty()) {
                        val packetType = values[0]
                        val protobufData = values.copyOfRange(1, values.size)
                        
                        if (packetType.toInt() == PACKET_TYPE_PROTOBUF) {
                            // just for test
                            decodeProtobufsByWrite(protobufData, packetHex)
                        }
                    }
                } else {
                    Bridge.log("glass write failed with status: $status", Log.ERROR)
                    if (status == 133) {
                        Bridge.log("GOT THAT 133 STATUS!")
                    }
                }
                
                // clear the waiter
                mainWaiter.setFalse()
            }

            override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
                Bridge.log("PROC - GOT DESCRIPTOR WRITE: $status")
                // clear the waiter
                mainServicesWaiter.setFalse()
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                val statusBool = status == BluetoothGatt.GATT_SUCCESS
                Bridge.log("🔄 MTU Negotiation Result: Success=$statusBool, Device MTU=$mtu, Status=$status")
                
                if (statusBool) {
                    // Store device capability and calculate actual negotiated MTU
                    deviceMaxMTU = mtu // Record what device actually supports
                    // The actual negotiated MTU is the minimum of our request and device capability
                    currentMTU = MTU_517.coerceAtMost(mtu)
                    
                    Bridge.log("🎯 MTU Negotiation Complete:")
                    Bridge.log("   📱 App Requested: $MTU_517 bytes")
                    Bridge.log("   📡 Device Supports: $deviceMaxMTU bytes")
                    Bridge.log("   🤝 Negotiated MTU: $currentMTU bytes")
                    
                    // Calculate optimal chunk sizes based on negotiated MTU
                    MAX_CHUNK_SIZE = currentMTU - 10
                    BMP_CHUNK_SIZE = currentMTU - 20 // BMP has more config bytes
                    
                    Bridge.log("✅ MTU Configuration Complete:")
                    Bridge.log("   📊 Final MTU: $currentMTU bytes")
                    Bridge.log("   📦 Data Chunk Size: $MAX_CHUNK_SIZE bytes")
                    Bridge.log("   🖼️ Image Chunk Size: $BMP_CHUNK_SIZE bytes")
                    Bridge.log("   🔧 Device Maximum: $deviceMaxMTU bytes")
                } else {
                    Bridge.log("❌ MTU Request Failed - Status: $status, Requested: $mtu", Log.WARN)
                    
                    // Simple fallback strategy: 247 → 23
                    if (mtu == MTU_517) {
                        Bridge.log("🔄 247 bytes failed, trying default: $MTU_DEFAULT bytes...")
                        Bridge.log("📤 Requesting MTU: $MTU_DEFAULT bytes (fallback)")
                        gatt.requestMtu(MTU_DEFAULT)
                    } else {
                        Bridge.log("⚠️ All MTU requests failed, using defaults", Log.WARN)
                        currentMTU = MTU_DEFAULT
                        deviceMaxMTU = MTU_DEFAULT
                        MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                        BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT
                        
                        Bridge.log("📋 Fallback Configuration:")
                        Bridge.log("   📊 Default MTU: $MTU_DEFAULT bytes")
                        Bridge.log("   📦 Data Chunk Size: $MAX_CHUNK_SIZE bytes")
                        Bridge.log("   🖼️ Image Chunk Size: $BMP_CHUNK_SIZE bytes")
                    }
                }
            }

            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                val msg = Message.obtain().apply {
                    what = MAIN_TASK_HANDLER_CODE_CHARACTERISTIC_VALUE_NOTIFIED
                    obj = characteristic // Attach any object you want
                }
                mainTaskHandler.sendMessage(msg)
            }
        }
    }

    private fun onCharacteristicChangedHandler(characteristic: BluetoothGattCharacteristic) {
        if (characteristic.uuid == NOTIFY_CHAR_UUID) {
            val data = characteristic.value
            val deviceName = mainGlassGatt?.device?.name ?: return
            val packetHex = bytesToHex(data)
            Bridge.log("onCharacteristicChangedHandler len: ${data.size}")
            Bridge.log("onCharacteristicChangedHandler: $packetHex")
            
            if (data.isEmpty()) return
            
            val packetType = data[0].toInt() and 0xFF // Convert to unsigned byte
            Bridge.log("onCharacteristicChangedHandler packetType: ${String.format("%02X ", packetType)}")
            
            when (packetType) {
                PACKET_TYPE_JSON -> {
                    val jsonData = data.copyOfRange(1, data.size)
                    decodeJsons(jsonData)
                }
                PACKET_TYPE_PROTOBUF -> {
                    val protobufData = data.copyOfRange(1, data.size)
                    decodeProtobufs(protobufData, packetHex)
                }
                PACKET_TYPE_AUDIO -> {
                    // Check for audio packet header
                    if (data[0] == 0xA0.toByte()) {
                        val sequenceNumber = data[1]
                        val receiveTime = System.currentTimeMillis()

                        // Basic sequence validation
                        if (lastReceivedLc3Sequence != -1 && (lastReceivedLc3Sequence + 1).toByte() != sequenceNumber) {
                            Bridge.log("LC3 packet sequence mismatch. Expected: ${lastReceivedLc3Sequence + 1}, Got: $sequenceNumber", Log.WARN)
                        }
                        lastReceivedLc3Sequence = sequenceNumber.toInt()

                        val lc3Data = data.copyOfRange(2, data.size)

                        Bridge.log("Received LC3 audio packet seq=$sequenceNumber, size=${lc3Data.size}")

                        // Play LC3 audio directly through LC3 player
                        if (lc3AudioPlayer != null && isLc3AudioEnabled) {
                            // Use the original packet format that LC3 player expects
                            lc3AudioPlayer?.write(data, 0, data.size)
                            Bridge.log("Playing LC3 audio directly through LC3 player: ${data.size} bytes")
                        } else if (!isLc3AudioEnabled) {
                            Bridge.log("LC3 audio disabled - skipping LC3 audio output")
                        } else {
                            Bridge.log("LC3 player not available - skipping LC3 audio output")
                        }

                        // Still decode for callback compatibility
                        if (lc3DecoderPtr != 0L) {
                            val pcmData = L3cCpp.decodeLC3(lc3DecoderPtr, lc3Data)
                            Bridge.log("pcmData size:${pcmData?.size ?: 0}")
                            audioProcessingCallback?.let { callback ->
                                if (!pcmData.isNullOrEmpty()) {
                                    callback.onAudioDataAvailable(pcmData)
                                }
                            } ?: run {
                                // If we get here, it means the callback wasn't properly registered
                                Bridge.log("Audio processing callback is null - callback registration failed!", Log.ERROR)
                            }
                        }
                    }
                }
                PACKET_TYPE_IMAGE -> {
                    // Handle image packet if needed
                }
                else -> {
                    Bridge.log("unknown packetType: ${String.format("%02X ", packetType)}")
                }
            }
        }
    }

    private fun decodeJsons(jsonBytes: ByteArray) {
        val jsonString = String(jsonBytes, Charset.defaultCharset())
        try {
            val commandObject = JSONObject(jsonString)
            when (val type = commandObject.getString("type")) {
                "image_transfer_complete" -> {
                    // Handle image transfer complete
                }
                "disconnect" -> {
                    // Handle disconnect
                }
                "request_battery_state" -> {
                    // Handle battery state request
                }
                "charging_state" -> {
                    // Handle charging state
                }
                "device_info" -> {
                    // val deviceInfo = gson.fromJson(jsonString, DeviceInfo::class.java)
                }
                "enter_pairing_mode" -> {
                    // Handle pairing mode
                }
                "request_head_position" -> {
                    // Handle head position request
                }
                "set_head_up_angle" -> {
                    // Handle head up angle
                }
                "ping" -> {
                    // Handle ping
                }
                "vad_event" -> {
                    // Handle VAD event
                }
                "imu_data" -> {
                    // Handle IMU data
                }
                "button_event" -> {
                    // Handle button event
                }
                "head_gesture" -> {
                    // Handle head gesture
                }
            }
        } catch (e: Exception) {
            Bridge.log("Error decoding JSON: ${e.message}", Log.ERROR)
        }
    }

    private fun decodeProtobufs(protobufBytes: ByteArray, packetHex: String) {
        try {
            val glassesToPhone = GlassesToPhone.parseFrom(protobufBytes)
            val payloadCase = glassesToPhone.payloadCase.toString()
            
            Bridge.log("decodeProtobufs glassesToPhone: $glassesToPhone")
            Bridge.log("decodeProtobufs glassesToPhone payloadCase: $payloadCase")
            
            if (isDebugMode) {
                EventBus.getDefault().post(BleCommandReceiver(payloadCase, packetHex))
            }

            when (glassesToPhone.payloadCase) {
                GlassesToPhone.PayloadCase.BATTERY_STATUS -> {
                    val batteryStatus = glassesToPhone.batteryStatus
                    batteryMain = batteryStatus.level
                    EventBus.getDefault().post(BatteryLevelEvent(batteryStatus.level, batteryStatus.charging))
                    Bridge.log("batteryStatus: $batteryStatus")
                }
                GlassesToPhone.PayloadCase.CHARGING_STATE -> {
                    val chargingState = glassesToPhone.chargingState
                    EventBus.getDefault().post(BatteryLevelEvent(batteryMain, chargingState.state == State.CHARGING))
                    Bridge.log("chargingState: $chargingState")
                }
                GlassesToPhone.PayloadCase.DEVICE_INFO -> {
                    val deviceInfo = glassesToPhone.deviceInfo
                    Bridge.log("deviceInfo: $deviceInfo")
                }
                GlassesToPhone.PayloadCase.HEAD_POSITION -> {
                    val headPosition = glassesToPhone.headPosition
                    EventBus.getDefault().post(HeadUpAngleEvent(headPosition.angle))
                    Bridge.log("headPosition: $headPosition")
                }
                GlassesToPhone.PayloadCase.HEAD_UP_ANGLE_SET -> {
                    val headUpAngleResponse = glassesToPhone.headUpAngleSet
                    Bridge.log("headUpAngleResponse: $headUpAngleResponse")
                }
                GlassesToPhone.PayloadCase.PING -> {
                    lastHeartbeatReceivedTime = System.currentTimeMillis()
                    Bridge.log("=== RECEIVED PING FROM GLASSES === (Time: $lastHeartbeatReceivedTime)")
                    sendPongResponse()
                }
                GlassesToPhone.PayloadCase.VAD_EVENT -> {
                    // val vadEvent = glassesToPhone.vadEvent
                    // EventBus.getDefault().post(VadEvent(vadEvent.vad))
                }
                GlassesToPhone.PayloadCase.IMAGE_TRANSFER_COMPLETE -> {
                    val transferComplete = glassesToPhone.imageTransferComplete
                    Bridge.log("transferComplete: $transferComplete")
                    
                    when (transferComplete.status) {
                        ImageTransferComplete.Status.OK -> {
                            currentImageChunks.clear()
                            isImageSendProgressing = false
                        }
                        ImageTransferComplete.Status.INCOMPLETE -> {
                            val missingChunksList = transferComplete.missingChunksList
                            reSendImageMissingChunks(missingChunksList)
                        }
                        else -> {}
                    }
                }
                GlassesToPhone.PayloadCase.IMU_DATA -> {
                    val imuData = glassesToPhone.imuData
                    Bridge.log("imuData: $imuData")
                }
                GlassesToPhone.PayloadCase.BUTTON_EVENT -> {
                    val buttonEvent = glassesToPhone.buttonEvent
                    Bridge.log("buttonEvent: $buttonEvent")
                    // buttonEvent.button.number
                    // EventBus.getDefault().post(ButtonPressEvent(
                    //     smartGlassesDevice.deviceModelName,
                    //     buttonId,
                    //     pressType,
                    //     timestamp
                    // ))
                }
                GlassesToPhone.PayloadCase.HEAD_GESTURE -> {
                    val headGesture = glassesToPhone.headGesture
                    Bridge.log("headGesture: $headGesture")
                    // EventBus.getDefault().post(GlassesHeadUpEvent())
                    // EventBus.getDefault().post(GlassesHeadDownEvent())
                    // EventBus.getDefault().post(GlassesTapOutputEvent(2, isRight, System.currentTimeMillis()))
                }
                GlassesToPhone.PayloadCase.VERSION_RESPONSE -> {
                    val versionResponse = glassesToPhone.versionResponse
                    Bridge.log("=== RECEIVED GLASSES PROTOBUF VERSION RESPONSE ===")
                    Bridge.log("Glasses Protobuf Version: ${versionResponse.version}")
                    Bridge.log("Message ID: ${versionResponse.msgId}")
                    
                    if (versionResponse.commit.isNotEmpty()) {
                        Bridge.log("Commit: ${versionResponse.commit}")
                    }
                    if (versionResponse.buildDate.isNotEmpty()) {
                        Bridge.log("Build Date: ${versionResponse.buildDate}")
                    }
                    
                    // Post glasses protobuf version event to update UI
                    EventBus.getDefault().post(ProtocolVersionResponseEvent(
                        versionResponse.version,
                        versionResponse.commit,
                        versionResponse.buildDate,
                        versionResponse.msgId
                    ))
                }
                GlassesToPhone.PayloadCase.PAYLOAD_NOT_SET,
                null -> {
                    // Do nothing
                }
            }
        } catch (e: InvalidProtocolBufferException) {
            Bridge.log("Error decoding protobuf: ${e.message}", Log.ERROR)
        }
    }

    private fun decodeProtobufsByWrite(protobufBytes: ByteArray, packetHex: String) {
        try {
            val phoneToGlasses = PhoneToGlasses.parseFrom(protobufBytes)
            Bridge.log("decodeProtobufsByWrite phoneToGlasses: $phoneToGlasses")
            Bridge.log("decodeProtobufsByWrite phoneToGlasses payloadCase: ${phoneToGlasses.payloadCase}")
            val payloadCase = phoneToGlasses.payloadCase.toString()
            if (isDebugMode) {
                EventBus.getDefault().post(BleCommandSender(payloadCase, packetHex))
            }
        } catch (e: Exception) {
            Bridge.log("Error in decodeProtobufsByWrite: ${e.message}", Log.ERROR)
        }
    }

    private fun reSendImageMissingChunks(missingChunksIndexList: List<Int>) {
        if (!isImageSendProgressing || currentImageChunks.isEmpty() || missingChunksIndexList.isEmpty()) {
            return
        }
        val missingChunks = missingChunksIndexList.map { index -> 
            currentImageChunks[index] 
        }
        
        sendDataSequentially(missingChunks)
    }

    private fun sendPongResponse() {
        // Respond to ping from glasses with pong
        lastHeartbeatReceivedTime = System.currentTimeMillis()
        Bridge.log("=== SENDING PONG RESPONSE TO GLASSES === (Time: $lastHeartbeatReceivedTime)")
        
        val pongPacket = constructPongResponse()

        // Send the pong response
        if (pongPacket != null) {
            sendDataSequentially(pongPacket, 100)
            Bridge.log("Pong response sent successfully")
            
            // Notify mobile app about pong sent
            notifyHeartbeatSent(System.currentTimeMillis())
        } else {
            Bridge.log("Failed to construct pong response packet", Log.ERROR)
        }

        // Still query battery periodically (every 10 pings received)
        if (batteryMain == -1 || heartbeatCount % 10 == 0) {
            mainTaskHandler.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_BATTERY_QUERY, 500)
        }

        heartbeatCount++
        
        // Notify mobile app about heartbeat received
        notifyHeartbeatReceived(lastHeartbeatReceivedTime)
    }

    private fun notifyHeartbeatSent(timestamp: Long) {
        lastHeartbeatSentTime = timestamp
        // Send heartbeat event to mobile app via EventBus
        EventBus.getDefault().post(HeartbeatSentEvent(timestamp))
    }
    /**
     * Notify mobile app about heartbeat received
     */
    private fun notifyHeartbeatReceived(timestamp: Long) {
        // Send heartbeat event to mobile app via EventBus
        EventBus.getDefault().post(HeartbeatReceivedEvent(timestamp))
    }

    private fun attemptGattConnection(device: BluetoothDevice) {
        if (device == null) {
            Bridge.log("Cannot connect to GATT: Device is null", Log.WARN)
            return
        }

        val deviceName = device.name
        if (deviceName.isNullOrEmpty()) {
            Bridge.log("Skipping null/empty device name: ${device.address}... this means something horrific has occurred. Look into this.", Log.ERROR)
            return
        }

        Bridge.log("attemptGattConnection called for device: $deviceName (${device.address})")

        connectionState = SmartGlassesConnectionState.CONNECTING
        Bridge.log("Setting connectionState to CONNECTING. Notifying connectionEvent.")
        connectionEvent(connectionState)

        connectLeftDevice(device)
    }

    private fun connectLeftDevice(device: BluetoothDevice) {
        if (mainGlassGatt == null) {
            Bridge.log("Attempting GATT connection for Main Glass...")
            mainGlassGatt = device.connectGatt(context, false, mainGattCallback)
            isMainConnected = false
            Bridge.log("Main GATT connection initiated. isMainConnected set to false.")
        } else {
            Bridge.log("Main Glass GATT already exists")
        }
    }

    private fun getProtobufSchemaVersion(): Int {
        return try {
            // Get the protobuf descriptor and extract the schema version
            val fileDescriptor = mentraos.ble.MentraosBle.getDescriptor().file
            
            Bridge.log("Proto file descriptor: ${fileDescriptor.name}")
            
            // Method 1: Try to access the custom mentra_schema_version option
            try {
                // Get the file options from the descriptor
                val options = fileDescriptor.options
                Bridge.log("Got file options: $options")
                
                // Try to access the custom option using the extension registry
                // First, check if the extension is available in the generated code
                try {
                    // Look for the generated extension in the MentraosBle class
                    val fields = mentraos.ble.MentraosBle::class.java.declaredFields
                    for (field in fields) {
                        if (field.name.contains("schema", ignoreCase = true) || 
                            field.name.contains("version", ignoreCase = true)) {
                            Bridge.log("Found potential version field: ${field.name}")
                            field.isAccessible = true
                            try {
                                val value = field.get(null)
                                if (value is com.google.protobuf.Extension<*, *>) {
                                    @Suppress("UNCHECKED_CAST")
                                    val ext = value as com.google.protobuf.Extension<com.google.protobuf.DescriptorProtos.FileOptions, Int>
                                    if (options.hasExtension(ext)) {
                                        val version = options.getExtension(ext)
                                        Bridge.log("Found schema version via extension: $version")
                                        return version
                                    }
                                }
                            } catch (fieldException: Exception) {
                                Bridge.log("Field access failed for ${field.name}: ${fieldException.message}")
                            }
                        }
                    }
                } catch (extensionException: Exception) {
                    Bridge.log("Extension search failed: ${extensionException.message}")
                }
            } catch (optionsException: Exception) {
                Bridge.log("Options access failed: ${optionsException.message}")
            }
            
            // Method 2: Try to read from the actual proto file content
            try {
                val protoVersion = readProtoVersionFromProject()
                if (protoVersion != null) {
                    Bridge.log("Read proto version from project: $protoVersion")
                    return protoVersion.toInt()
                }
            } catch (projectException: Exception) {
                Bridge.log("Project file reading failed: ${projectException.message}")
            }
            
            Bridge.log("Could not extract protobuf schema version dynamically, using fallback", Log.WARN)
            1 // Fallback to version 1
        } catch (e: Exception) {
            Bridge.log("Error getting protobuf schema version: ${e.message}", Log.ERROR, e)
            1 // Fallback to version 1
        }
    }

    /**
     * Attempts to read the protobuf schema version from the proto file in the project
     */
    private fun readProtoVersionFromProject(): String? {
        // Try to read from assets first
        try {
            context.assets.open("mentraos_ble.proto").use { inputStream ->
                val content = inputStream.bufferedReader().use { it.readText() }
                return extractVersionFromProtoContent(content)
            }
        } catch (e: Exception) {
            Bridge.log("Could not read from assets: ${e.message}")
        }

        // Try to read from resources
        try {
            val resId = context.resources.getIdentifier("mentraos_ble", "raw", context.packageName)
            if (resId != 0) {
                context.resources.openRawResource(resId).use { inputStream ->
                    val content = inputStream.bufferedReader().use { it.readText() }
                    return extractVersionFromProtoContent(content)
                }
            }
        } catch (e: Exception) {
            Bridge.log("Could not read from resources: ${e.message}")
        }

        // Try to read from the project directory structure
        try {
            val projectPaths = arrayOf(
                // Relative to Android project root
                "../../mcu_client/mentraos_ble.proto",
                "../../../mcu_client/mentraos_ble.proto",
                "../../../../mcu_client/mentraos_ble.proto",
                // Absolute paths from common Android locations
                "/data/data/${context.packageName}/../../mcu_client/mentraos_ble.proto",
                // Try external storage
                "${android.os.Environment.getExternalStorageDirectory()}/MentraOS/mcu_client/mentraos_ble.proto"
            )

            for (path in projectPaths) {
                try {
                    val protoFile = java.io.File(path)
                    Bridge.log("Checking path: ${protoFile.absolutePath}")
                    if (protoFile.exists() && protoFile.canRead()) {
                        Bridge.log("Found proto file at: ${protoFile.absolutePath}")
                        val content = protoFile.readText(Charsets.UTF_8)
                        return extractVersionFromProtoContent(content)
                    }
                } catch (e: Exception) {
                    Bridge.log("Path check failed for $path: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Bridge.log("Project file reading failed: ${e.message}")
        }

        return null
    }

    /**
     * Extracts version number from proto file content
     */
    private fun extractVersionFromProtoContent(content: String): String? {
        return try {
            // Look for the mentra_schema_version option
            val pattern = Regex("""option\s*\(\s*mentra_schema_version\s*\)\s*=\s*(\d+)\s*;""")
            val matchResult = pattern.find(content)
            
            matchResult?.let {
                val version = it.groupValues[1]
                Bridge.log("Extracted version from proto content: $version")
                version
            } ?: run {
                Bridge.log("No mentra_schema_version found in proto content")
                null
            }
        } catch (e: Exception) {
            Bridge.log("Error extracting version from proto content: ${e.message}", Log.ERROR)
            null
        }
    }

    private fun queryGlassesProtobufVersionFromFirmware() {
        Bridge.log("=== SENDING GLASSES PROTOBUF VERSION REQUEST ===")
        
        // Generate unique message ID for this request
        val msgId = "ver_req_${System.currentTimeMillis()}"
        
        val versionRequest = VersionRequest.newBuilder()
            .setMsgId(msgId)
            .build()
        val phoneToGlasses = PhoneToGlasses.newBuilder()
            .setMsgId(msgId)
            .setVersionRequest(versionRequest)
            .build()
        val versionQueryPacket = generateProtobufCommandBytes(phoneToGlasses)
        sendDataSequentially(versionQueryPacket, 100)
        
        Bridge.log("Sent glasses protobuf version request with msg_id: $msgId")
    }
}