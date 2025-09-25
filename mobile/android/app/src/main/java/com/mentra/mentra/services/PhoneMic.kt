package com.mentra.mentra.services

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.mentra.mentra.Bridge
import com.mentra.mentra.MentraManager
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*

class PhoneMic private constructor(private val context: Context) {

    companion object {
        @Volatile private var instance: PhoneMic? = null

        fun getInstance(context: Context): PhoneMic {
            return instance
                    ?: synchronized(this) {
                        instance ?: PhoneMic(context.applicationContext).also { instance = it }
                    }
        }

        // Audio configuration constants
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_MULTIPLIER = 2
    }

    // Audio recording components
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private val isRecording = AtomicBoolean(false)

    // Audio manager and routing
    private val audioManager: AudioManager =
            context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var bluetoothHeadset: BluetoothHeadset? = null

    // Broadcast receivers
    private var audioRouteReceiver: BroadcastReceiver? = null
    private var bluetoothReceiver: BroadcastReceiver? = null

    // Handler for main thread operations
    private val mainHandler = Handler(Looper.getMainLooper())

    // Coroutine scope for async operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        setupAudioRouteListener()
        setupBluetoothListener()
    }

    // MARK: - Public Methods

    /**
     * Check (but don't request) microphone permissions Permissions are requested by React Native
     * UI, not directly by Kotlin
     */
    fun requestPermissions(): Boolean {
        // Instead of requesting permissions directly, we just check the current status
        // This maintains compatibility with existing code that calls this method
        return checkPermissions()
    }

    /** Check if microphone permissions have been granted */
    fun checkPermissions(): Boolean {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
    }

    /** Get a list of available audio input devices */
    fun getAvailableInputDevices(): Map<String, String> {
        val deviceInfo = mutableMapOf<String, String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
            for (device in devices) {
                val name =
                        when (device.type) {
                            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Built-in Microphone"
                            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth Headset"
                            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired Headset"
                            AudioDeviceInfo.TYPE_USB_HEADSET -> "USB Headset"
                            else -> device.productName.toString()
                        }
                deviceInfo[device.id.toString()] = name
            }
        } else {
            // Fallback for older Android versions
            deviceInfo["default"] = "Default Microphone"
            if (audioManager.isBluetoothScoAvailableOffCall) {
                deviceInfo["bluetooth"] = "Bluetooth Headset"
            }
            if (audioManager.isWiredHeadsetOn) {
                deviceInfo["wired"] = "Wired Headset"
            }
        }

        return deviceInfo
    }

    /** Manually set a specific device as preferred input */
    fun setPreferredInputDevice(deviceName: String): Boolean {
        return try {
            when {
                deviceName.contains("bluetooth", ignoreCase = true) ||
                        deviceName.contains("airpods", ignoreCase = true) -> {
                    // Route to Bluetooth SCO
                    if (!audioManager.isBluetoothScoOn) {
                        audioManager.startBluetoothSco()
                        audioManager.isBluetoothScoOn = true
                    }
                    Bridge.log("Successfully routed audio to Bluetooth device")
                    true
                }
                deviceName.contains("speaker", ignoreCase = true) -> {
                    // Route to speaker
                    audioManager.isSpeakerphoneOn = true
                    if (audioManager.isBluetoothScoOn) {
                        audioManager.stopBluetoothSco()
                        audioManager.isBluetoothScoOn = false
                    }
                    Bridge.log("Successfully routed audio to speaker")
                    true
                }
                else -> {
                    // Route to default (earpiece/wired headset)
                    audioManager.isSpeakerphoneOn = false
                    if (audioManager.isBluetoothScoOn) {
                        audioManager.stopBluetoothSco()
                        audioManager.isBluetoothScoOn = false
                    }
                    Bridge.log("Successfully routed audio to default device")
                    true
                }
            }
        } catch (e: Exception) {
            Bridge.log("Failed to set preferred input: ${e.message}")
            false
        }
    }

    /** Start recording from the available microphone */
    fun startRecording(): Boolean {
        // Ensure we're not already recording
        if (isRecording.get()) {
            return true
        }

        // Check permissions first
        if (!checkPermissions()) {
            Bridge.log("MIC: Microphone permissions not granted")
            return false
        }

        // Calculate buffer size
        val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)

        if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            Bridge.log("MIC: Failed to get min buffer size")
            return false
        }

        val bufferSize = minBufferSize * BUFFER_SIZE_MULTIPLIER

        // Create AudioRecord instance
        try {
            audioRecord =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        AudioRecord.Builder()
                                .setAudioSource(MediaRecorder.AudioSource.MIC)
                                .setAudioFormat(
                                        AudioFormat.Builder()
                                                .setSampleRate(SAMPLE_RATE)
                                                .setChannelMask(CHANNEL_CONFIG)
                                                .setEncoding(AUDIO_FORMAT)
                                                .build()
                                )
                                .setBufferSizeInBytes(bufferSize)
                                .build()
                    } else {
                        AudioRecord(
                                MediaRecorder.AudioSource.MIC,
                                SAMPLE_RATE,
                                CHANNEL_CONFIG,
                                AUDIO_FORMAT,
                                bufferSize
                        )
                    }

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Bridge.log("MIC: AudioRecord failed to initialize")
                audioRecord?.release()
                audioRecord = null
                return false
            }

            // Set preferred audio device if available
            setPreferredAudioDevice()

            // Start recording
            audioRecord?.startRecording()
            isRecording.set(true)

            // Start recording thread
            startRecordingThread(bufferSize)

            Bridge.log("MIC: Started recording from: ${getActiveInputDevice() ?: "Unknown device"}")
            return true
        } catch (e: Exception) {
            Bridge.log("MIC: Failed to start recording: ${e.message}")
            audioRecord?.release()
            audioRecord = null
            return false
        }
    }

    /** Stop recording from the microphone */
    fun stopRecording() {
        if (!isRecording.get()) {
            return
        }

        isRecording.set(false)

        // Stop recording thread
        recordingThread?.interrupt()
        recordingThread = null

        // Stop and release AudioRecord
        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (e: Exception) {
            Bridge.log("MIC: Error stopping recording: ${e.message}")
        }

        // Reset audio routing
        if (audioManager.isBluetoothScoOn) {
            audioManager.stopBluetoothSco()
            audioManager.isBluetoothScoOn = false
        }

        Bridge.log("MIC: Stopped recording")
    }

    /** Get the currently active input device name */
    fun getActiveInputDevice(): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioRecord?.routedDevice?.let { device ->
                when (device.type) {
                    AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Built-in Microphone"
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth Headset"
                    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired Headset"
                    AudioDeviceInfo.TYPE_USB_HEADSET -> "USB Headset"
                    else -> device.productName.toString()
                }
            }
        } else {
            when {
                audioManager.isBluetoothScoOn -> "Bluetooth Headset"
                audioManager.isWiredHeadsetOn -> "Wired Headset"
                else -> "Built-in Microphone"
            }
        }
    }

    // MARK: - Private Methods

    private fun startRecordingThread(bufferSize: Int) {
        recordingThread =
                Thread {
                    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)

                    val audioBuffer = ShortArray(bufferSize / 2)

                    while (isRecording.get()) {
                        val readResult = audioRecord?.read(audioBuffer, 0, audioBuffer.size) ?: 0

                        if (readResult > 0) {
                            // Convert short array to byte array (16-bit PCM)
                            val pcmData = ByteArray(readResult * 2)
                            val byteBuffer = ByteBuffer.wrap(pcmData).order(ByteOrder.LITTLE_ENDIAN)

                            for (i in 0 until readResult) {
                                byteBuffer.putShort(audioBuffer[i])
                            }

                            // Send PCM data to MentraManager
                            MentraManager.getInstance()
                                    .handlePcm(
                                            android.util.Base64.encodeToString(
                                                    pcmData,
                                                    android.util.Base64.DEFAULT
                                            )
                                    )
                        }
                    }
                }
                        .apply {
                            name = "AudioRecordingThread"
                            start()
                        }
    }

    private fun setPreferredAudioDevice() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)

            // Prefer Bluetooth device if available
            val bluetoothDevice =
                    devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }

            bluetoothDevice?.let { device ->
                try {
                    audioRecord?.preferredDevice = device
                    Bridge.log("MIC: Set preferred device to Bluetooth")
                } catch (e: Exception) {
                    Bridge.log("MIC: Failed to set preferred device: ${e.message}")
                }
            }
        }
    }

    private fun setupAudioRouteListener() {
        audioRouteReceiver =
                object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        when (intent?.action) {
                            AudioManager.ACTION_AUDIO_BECOMING_NOISY -> {
                                Bridge.log("MIC: Audio becoming noisy (headset disconnected)")
                                handleAudioRouteChange()
                            }
                            AudioManager.ACTION_HEADSET_PLUG -> {
                                val state = intent.getIntExtra("state", -1)
                                if (state == 1) {
                                    Bridge.log("MIC: Headset connected")
                                } else if (state == 0) {
                                    Bridge.log("MIC: Headset disconnected")
                                }
                                handleAudioRouteChange()
                            }
                            AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED -> {
                                val state =
                                        intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
                                when (state) {
                                    AudioManager.SCO_AUDIO_STATE_CONNECTED -> {
                                        Bridge.log("MIC: Bluetooth SCO connected")
                                        handleAudioRouteChange()
                                    }
                                    AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> {
                                        Bridge.log("MIC: Bluetooth SCO disconnected")
                                        handleAudioRouteChange()
                                    }
                                }
                            }
                        }
                    }
                }

        val filter =
                IntentFilter().apply {
                    addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
                    addAction(AudioManager.ACTION_HEADSET_PLUG)
                    addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
                }

        context.registerReceiver(audioRouteReceiver, filter)
    }

    private fun setupBluetoothListener() {
        bluetoothReceiver =
                object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        when (intent?.action) {
                            BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED -> {
                                val state =
                                        intent.getIntExtra(
                                                BluetoothProfile.EXTRA_STATE,
                                                BluetoothProfile.STATE_DISCONNECTED
                                        )
                                when (state) {
                                    BluetoothProfile.STATE_CONNECTED -> {
                                        Bridge.log("MIC: Bluetooth headset connected")
                                        handleAudioRouteChange()
                                    }
                                    BluetoothProfile.STATE_DISCONNECTED -> {
                                        Bridge.log("MIC: Bluetooth headset disconnected")
                                        handleAudioRouteChange()
                                    }
                                }
                            }
                        }
                    }
                }

        val filter =
                IntentFilter().apply { addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED) }

        context.registerReceiver(bluetoothReceiver, filter)

        // Set up Bluetooth profile proxy
        bluetoothAdapter?.getProfileProxy(
                context,
                object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                        if (profile == BluetoothProfile.HEADSET) {
                            bluetoothHeadset = proxy as BluetoothHeadset
                        }
                    }

                    override fun onServiceDisconnected(profile: Int) {
                        if (profile == BluetoothProfile.HEADSET) {
                            bluetoothHeadset = null
                        }
                    }
                },
                BluetoothProfile.HEADSET
        )
    }

    private fun handleAudioRouteChange() {
        // Get available inputs and notify MentraManager
        val availableInputs = getAvailableInputDevices().values.toList()

        mainHandler.post {
            MentraManager.getInstance()
                    .onRouteChange(reason = "AudioRouteChanged", availableInputs = availableInputs)
        }

        // Log current audio route
        logCurrentAudioRoute()
    }

    private fun logCurrentAudioRoute() {
        val routeDescription = StringBuilder("Current audio route:\n")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_ALL)

            val inputs = devices.filter { it.isSource }
            val outputs = devices.filter { it.isSink }

            if (inputs.isEmpty()) {
                routeDescription.append("- No input devices\n")
            } else {
                inputs.forEachIndexed { index, device ->
                    routeDescription.append(
                            "- Input ${index + 1}: ${device.productName} (type: ${device.type})\n"
                    )
                }
            }

            if (outputs.isEmpty()) {
                routeDescription.append("- No output devices")
            } else {
                outputs.forEachIndexed { index, device ->
                    routeDescription.append(
                            "- Output ${index + 1}: ${device.productName} (type: ${device.type})"
                    )
                    if (index < outputs.size - 1) {
                        routeDescription.append("\n")
                    }
                }
            }
        } else {
            // Fallback for older Android versions
            routeDescription.append("- Input: ${getActiveInputDevice() ?: "Unknown"}\n")
            routeDescription.append("- Output: ")
            when {
                audioManager.isBluetoothScoOn -> routeDescription.append("Bluetooth")
                audioManager.isSpeakerphoneOn -> routeDescription.append("Speaker")
                audioManager.isWiredHeadsetOn -> routeDescription.append("Wired Headset")
                else -> routeDescription.append("Earpiece")
            }
        }

        Bridge.log(routeDescription.toString())
    }

    /** Handle audio interruption (e.g., phone call) */
    fun handleInterruption(began: Boolean) {
        mainHandler.post {
            if (began) {
                Bridge.log("Audio session interrupted - another app took control")
                if (isRecording.get()) {
                    MentraManager.getInstance().onInterruption(true)
                }
            } else {
                Bridge.log("Audio session interruption ended")
                MentraManager.getInstance().onInterruption(false)
            }
        }
    }

    /** Clean up resources */
    fun cleanup() {
        stopRecording()

        // Unregister receivers
        try {
            audioRouteReceiver?.let { context.unregisterReceiver(it) }
            bluetoothReceiver?.let { context.unregisterReceiver(it) }
        } catch (e: Exception) {
            Bridge.log("Error unregistering receivers: ${e.message}")
        }

        // Close Bluetooth proxy
        bluetoothAdapter?.closeProfileProxy(BluetoothProfile.HEADSET, bluetoothHeadset)

        // Cancel coroutines
        scope.cancel()

        Bridge.log("MIC: Cleaned up")
    }
}
