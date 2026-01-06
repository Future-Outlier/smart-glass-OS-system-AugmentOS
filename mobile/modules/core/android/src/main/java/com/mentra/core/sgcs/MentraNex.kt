package com.mentra.core.sgcs

import android.os.Message
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.content.Context;

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings

import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue

import mentraos.ble.MentraosBle.GlassesToPhone
import mentraos.ble.MentraosBle.PhoneToGlasses
import mentraos.ble.MentraosBle.ChargingState
import mentraos.ble.MentraosBle.BatteryStatus
import mentraos.ble.MentraosBle.VersionResponse
import mentraos.ble.MentraosBle.HeadGesture
import mentraos.ble.MentraosBle.ButtonEvent
import mentraos.ble.MentraosBle.ImuData
import mentraos.ble.MentraosBle.ImageTransferComplete
import mentraos.ble.MentraosBle.HeadUpAngleResponse
import mentraos.ble.MentraosBle.HeadPosition
import mentraos.ble.MentraosBle.DeviceInfo

import com.mentra.core.sgcs.SGCManager
import com.mentra.core.Bridge

import com.mentra.core.utils.DeviceTypes
import com.mentra.core.utils.ProtobufUtils
import com.mentra.core.utils.NexBluetoothConstants
import com.mentra.core.utils.NexDisplayConstants
import com.mentra.core.utils.NexBluetoothPacketTypes
import com.mentra.core.utils.BitmapJavaUtils
import com.mentra.core.utils.G1FontLoaderKt
import com.mentra.core.utils.G1Text
import com.mentra.core.utils.SmartGlassesConnectionState
import com.mentra.lc3Lib.Lc3Cpp
import com.mentra.core.utils.audio.Lc3Player

class MentraNex : SGCManager() {
    companion object {
        private const val TAG = "MentraNex";

        private const val MTU_517: Int = 517
        private const val MTU_DEFAULT: Int = 23
        
        private const val MAX_CHUNK_SIZE_DEFAULT: Int = 176 // Maximum chunk size for BLE packets
        private const val DELAY_BETWEEN_CHUNKS_SEND: Long = 10 // Adjust this value as needed

        private const val INITIAL_CONNECTION_DELAY_MS = 350L // Adjust this value as needed
        private const val MICBEAT_INTERVAL_MS: Long = (1000 * 60) * 30; // micbeat every 30 minutes

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
    }

    private var heartbeatCount: Int = 0;
    private var micBeatCount: Int = 0;

    private var context: Context? = null
    // private var isDebug: Boolean = true

    private var isLc3AudioEnabled: Boolean = true
    private var lc3AudioPlayer: Lc3Player? = null

    private var mainDevice: BluetoothDevice? = null
    private var bluetoothAdapter: BluetoothAdapter = BluetoothAdapter.getDefaultAdapter()

    private var isScanningForCompatibleDevices: Boolean = false

    private var isMainConnected = false
    private var isKilled: Boolean = false
    private var lastConnectionTimestamp: Long = 0
    private var lastSendTimestamp: Long = 0

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

    private var shouldUseGlassesMic: Boolean = false
    private var microphoneStateBeforeDisconnection: Boolean = false

    private var bleScanCallback: ScanCallback? = null

    private var batteryMain: Int = -1

    init {
        context = Bridge.getContext()
        // isDebug = isDebug(context)
        type = DeviceTypes.NEX
        hasMic = true
        micEnabled = false
        preferredMainDeviceId = CoreManager.getInstance().getDeviceName()
        
        // Initialize LC3 audio player
        lc3AudioPlayer = Lc3Player(context)
        lc3AudioPlayer.init()
        if (isLc3AudioEnabled) {
            lc3AudioPlayer.startPlay()
        }
    }

    private val mainGattCallback: BluetoothGattCallback = createGattCallback()

    private val mainTaskHandler: Handler = Handler(Looper.getMainLooper(), Handler.Callback(::handleMainTaskMessage))
    private val whiteListHandler: Handler = Handler()
    private val micEnableHandler: Handler = Handler()
    private val notificationHandler: Handler = Handler()
    private val textWallHandler: Handler = Handler()
    private val findCompatibleDevicesHandler: Handler? = null

    private var currentImageChunks: List<ByteArray> = emptyList()

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
        val cmdBytes = ProtobufUtils.generateHeadUpAngleConfigCommandBytes(angle)
        sendDataSequentially(cmdBytes, 10)
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
        val brightnessCmdBytes = ProtobufUtils.generateBrightnessConfigCommandBytes(brightness)
        sendDataSequentially(brightnessCmdBytes, 10)

        val autoBrightnessCmdBytes = ProtobufUtils.generateAutoBrightnessConfigCommandBytes(autoMode)
        sendDataSequentially(autoBrightnessCmdBytes, 10)
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
        val cmdBytes = ProtobufUtils.generateDisplayHeightCommandBytes(height, depth)
        sendDataSequentially(cmdBytes, 10)
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
                        
                        if (packetType.toInt() == NexBluetoothPacketTypes.PACKET_TYPE_PROTOBUF) {
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

    private fun handleMainTaskMessage(msg: Message): Boolean {
        val msgCode = msg.what
        Bridge.log("Nex: handleMessage msgCode: $msgCode")
        Bridge.log("Nex: handleMessage obj: ${msg.obj}")
        
        return when (msgCode) {
            MAIN_TASK_HANDLER_CODE_GATT_STATUS_CHANGED -> {}
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

        return true
    }

    private fun initNexGlasses(gatt: BluetoothGatt) {
        // Start MTU discovery with our maximum target
        Bridge.log("Nex: 🔍 MTU Discovery: Requesting maximum MTU size: $MTU_517")
        Bridge.log("Nex: 🎯 Target: Use $MTU_517 bytes max, or $MTU_DEFAULT bytes default")
        Bridge.log("Nex: 📤 Requesting MTU: $MTU_517 bytes")
        gatt.requestMtu(MTU_517) // Request our maximum MTU

        val uartService = gatt.getService(NexBluetoothConstants.MAIN_SERVICE_UUID)

        if (uartService != null) {
            val writeChar = uartService.getCharacteristic(NexBluetoothConstants.WRITE_CHAR_UUID)
            val notifyChar = uartService.getCharacteristic(NexBluetoothConstants.NOTIFY_CHAR_UUID)

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
                Bridge.log("=== SENDING GLASSES PROTOBUF VERSION REQUEST ===")
                val versionQueryPacket = ProtobufUtils.generateVersionRequestCommandBytes()
                Bridge.log("Sent glasses protobuf version request with msg_id: $msgId")
            }
        } else {
            Log.e(TAG, " glass UART service not found")
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
        val descriptor = characteristic.getDescriptor(NexBluetoothConstants.CLIENT_CHARACTERISTIC_CONFIG_UUID)
        descriptor?.let {
            Bridge.log
            it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            val writeResult = gatt.writeDescriptor(it)
            Bridge.log("Nex: PROC_QUEUE - set descriptor with result: $writeResult")
        }
    }

    private fun onCharacteristicChangedHandler(characteristic: BluetoothGattCharacteristic) {
        if (characteristic.uuid == NexBluetoothConstants.NOTIFY_CHAR_UUID) {
            val data = characteristic.value
            val deviceName = mainGlassGatt?.device?.name ?: return
            val packetHex = bytesToHex(data)
            Bridge.log("onCharacteristicChangedHandler len: ${data.size}")
            Bridge.log("onCharacteristicChangedHandler: $packetHex")
            
            if (data.isEmpty()) return
            
            val packetType = data[0].toInt() and 0xFF // Convert to unsigned byte
            Bridge.log("onCharacteristicChangedHandler packetType: ${String.format("%02X ", packetType)}")
            
            when (packetType) {
                NexBluetoothPacketTypes.PACKET_TYPE_JSON -> {
                    val jsonData = data.copyOfRange(1, data.size)
                    decodeJsons(jsonData)
                }
                NexBluetoothPacketTypes.PACKET_TYPE_PROTOBUF -> {
                    val protobufData = data.copyOfRange(1, data.size)
                    decodeProtobufs(protobufData, packetHex)
                }
                NexBluetoothPacketTypes.PACKET_TYPE_AUDIO -> {
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
                NexBluetoothPacketTypes.PACKET_TYPE_IMAGE -> {
                    // Handle image packet if needed
                }
                else -> {
                    Bridge.log("unknown packetType: ${String.format("%02X ", packetType)}")
                }
            }
        }
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

        if (mainGlassGatt == null) {
            Bridge.log("Attempting GATT connection for Main Glass...")
            mainGlassGatt = device.connectGatt(context, false, mainGattCallback)
            isMainConnected = false
            Bridge.log("Main GATT connection initiated. isMainConnected set to false.")
        } else {
            Bridge.log("Main Glass GATT already exists")
        }
    }

    private fun postProtobufSchemaVersionInfo() {
        try {
            // Call the version method only once
            val schemaVersion = ProtobufUtils.getProtoVersion(context)
            
            // Build the info string directly instead of calling getProtobufBuildInfo()
            val fileDescriptorName = mentraos.ble.MentraosBle.getDescriptor().file.name
            val buildInfo = "Schema v$schemaVersion | $fileDescriptorName"
            
            // val event = ProtobufSchemaVersionEvent(
            //     schemaVersion, 
            //     buildInfo, 
            //     smartGlassesDevice?.deviceModelName ?: "Unknown"
            // )
            
            // EventBus.getDefault().post(event)
            Bridge.log("Posted protobuf schema version event: $buildInfo")
        } catch (e: Exception) {
            Bridge.log("Error posting protobuf schema version event: ${e.message}", Log.ERROR, e)
        }
    }

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
            
            val startImageSendingBytes = ProtobufUtils.generateDisplayImageCommandBytes(streamId, totalChunks, width, height)
            sendDataSequentially(startImageSendingBytes)

            // Send all chunks with proper stream ID parsing
            val chunks = ProtobufUtils.createBmpChunksForNexGlasses(streamId, bmpData, totalChunks)
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

    private fun sendWhiteListCommand(delay: Int) {
        if (whiteListedAlready) return
        
        whiteListedAlready = true
        Bridge.log("Nex: Sending whitelist command")
        
        whiteListHandler.postDelayed({
            val chunks = ProtobufUtils.getWhitelistChunks()
            sendDataSequentially(chunks)
            
            // Uncomment if needed for debugging:
            // chunks.forEach { chunk ->
            //     Bridge.log("Nex: Sending this chunk for white list: ${bytesToUtf8(chunk)}")
            //     sendDataSequentially(chunk)
            //     // Thread.sleep(150) // Uncomment if delay between chunks is needed
            // }
        }, delay.toLong())
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
            
            // if (isDebugMode) {
            //     EventBus.getDefault().post(BleCommandReceiver(payloadCase, packetHex))
            // }

            when (glassesToPhone.payloadCase) {
                GlassesToPhone.PayloadCase.BATTERY_STATUS -> {
                    val batteryStatus: BatteryStatus = glassesToPhone.batteryStatus
                    batteryMain = batteryStatus.level
                    EventBus.getDefault().post(BatteryLevelEvent(batteryStatus.level, batteryStatus.charging))
                    Bridge.log("batteryStatus: $batteryStatus")
                }
                GlassesToPhone.PayloadCase.CHARGING_STATE -> {
                    val chargingState: ChargingState = glassesToPhone.chargingState
                    EventBus.getDefault().post(BatteryLevelEvent(batteryMain, chargingState.state == State.CHARGING))
                    Bridge.log("chargingState: $chargingState")
                }
                GlassesToPhone.PayloadCase.DEVICE_INFO -> {
                    val deviceInfo: DeviceInfo = glassesToPhone.deviceInfo
                    Bridge.log("deviceInfo: $deviceInfo")
                }
                GlassesToPhone.PayloadCase.HEAD_POSITION -> {
                    val headPosition: HeadPosition = glassesToPhone.headPosition
                    EventBus.getDefault().post(HeadUpAngleEvent(headPosition.angle))
                    Bridge.log("headPosition: $headPosition")
                }
                GlassesToPhone.PayloadCase.HEAD_UP_ANGLE_SET -> {
                    val headUpAngleResponse: HeadUpAngleResponse = glassesToPhone.headUpAngleSet
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
                    val transferComplete: ImageTransferComplete = glassesToPhone.imageTransferComplete
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
                    val imuData: ImuData = glassesToPhone.imuData
                    Bridge.log("imuData: $imuData")
                }
                GlassesToPhone.PayloadCase.BUTTON_EVENT -> {
                    val buttonEvent: ButtonEvent = glassesToPhone.buttonEvent
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
                    val headGesture: HeadGesture = glassesToPhone.headGesture
                    Bridge.log("headGesture: $headGesture")
                    // EventBus.getDefault().post(GlassesHeadUpEvent())
                    // EventBus.getDefault().post(GlassesHeadDownEvent())
                    // EventBus.getDefault().post(GlassesTapOutputEvent(2, isRight, System.currentTimeMillis()))
                }
                GlassesToPhone.PayloadCase.VERSION_RESPONSE -> {
                    val versionResponse: VersionResponse = glassesToPhone.versionResponse
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
            // if (isDebugMode) {
            //     EventBus.getDefault().post(BleCommandSender(payloadCase, packetHex))
            // }
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
        
        val pongPacket = ProtobufUtils.constructPongResponse()

        // Send the pong response
        if (pongPacket != null) {
            sendDataSequentially(pongPacket, 100)
            Bridge.log("Pong response sent successfully")
            
            // Notify mobile app about pong sent
            lastHeartbeatSentTime = System.currentTimeMillis()
            // EventBus.getDefault().post(HeartbeatSentEvent(timestamp))
        } else {
            Bridge.log("Failed to construct pong response packet", Log.ERROR)
        }

        // Still query battery periodically (every 10 pings received)
        if (batteryMain == -1 || heartbeatCount % 10 == 0) {
            mainTaskHandler.sendEmptyMessageDelayed(MAIN_TASK_HANDLER_CODE_BATTERY_QUERY, 500)
        }

        heartbeatCount++
        
        // Notify mobile app about heartbeat received
        // EventBus.getDefault().post(HeartbeatReceivedEvent(lastHeartbeatReceivedTime))
    }

    private fun createTextWallChunksForNex(text: String): ByteArray {
        // Create the PhoneToGlasses using its builder and set the DisplayText
        return ProtobufUtils.generateDisplayTextCommandBytes(text)
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
            val micConfigBytes = ProtobufUtils.generateMicStateConfigCommandBytes(enable)
            sendDataSequentially(micConfigBytes, 10) // wait some time to setup the mic
            Bridge.log("Nex: Sent MIC command: ${micConfigBytes.joinToString("") { "%02x".format(it) }}")
        }, delay)
    }

    private fun queryBatteryStatus() {
        val batteryQueryPacket = ProtobufUtils.generateBatteryStateRequestCommandBytes()
        sendDataSequentially(batteryQueryPacket, 250)
    }

    ///// PROCESSING THREAD /////////////////

    // Start the worker thread if it's not already running
    @Synchronized
    private fun startWorkerIfNeeded() {
        if (!isWorkerRunning) {
            isWorkerRunning = true
            Thread({ processQueue() }, "MentraNexSGCProcessQueue").start()
        }
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
}