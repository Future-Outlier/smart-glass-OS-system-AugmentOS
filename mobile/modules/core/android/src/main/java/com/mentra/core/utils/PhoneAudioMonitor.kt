package com.mentra.core.utils

import android.content.Context
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.mentra.core.Bridge

/**
 * PhoneAudioMonitor - Monitors system audio playback state
 *
 * Used to detect when the phone is playing audio (music, podcasts, etc.)
 * so we can temporarily suspend the LC3 microphone on MentraLive glasses
 * to avoid overloading the MCU when both A2DP output and LC3 mic input
 * are active simultaneously.
 *
 * This class mirrors the iOS PhoneAudioMonitor.swift implementation.
 */
class PhoneAudioMonitor private constructor(private val context: Context) {

    companion object {
        private const val TAG = "PhoneAudioMonitor"

        @Volatile
        private var instance: PhoneAudioMonitor? = null

        @JvmStatic
        fun getInstance(context: Context): PhoneAudioMonitor {
            return instance ?: synchronized(this) {
                instance ?: PhoneAudioMonitor(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }

    // Listener callback for audio state changes
    interface Listener {
        fun onPhoneAudioStateChanged(isPlaying: Boolean)
    }

    private val audioManager: AudioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var listener: Listener? = null
    private var isMonitoring = false
    private var lastKnownState = false

    // Track our own app's audio playback state
    // isMusicActive may not always catch our own app's audio reliably
    private var ownAppAudioPlaying = false

    // AudioPlaybackCallback for API 26+ (real-time detection)
    private var playbackCallback: AudioManager.AudioPlaybackCallback? = null

    // Fallback polling for older devices or edge cases
    private var pollingRunnable: Runnable? = null
    private val POLLING_INTERVAL_MS = 1000L // 1 second polling fallback

    /**
     * Check if any audio is currently playing on the device (including our own app)
     */
    fun isPlaying(): Boolean {
        // Combine: system audio playing OR our own app playing
        return audioManager.isMusicActive || ownAppAudioPlaying
    }

    /**
     * Notify the monitor that our own app started/stopped playing audio
     * Called from RN AudioPlaybackService via Bridge
     */
    fun setOwnAppAudioPlaying(playing: Boolean) {
        if (ownAppAudioPlaying == playing) return

        ownAppAudioPlaying = playing
        Bridge.log("$TAG: Own app audio -> ${if (playing) "PLAYING" else "STOPPED"}")

        // Immediately notify listener if overall state changed
        notifyIfStateChanged(isPlaying())
    }

    /**
     * Start monitoring for phone audio playback changes
     *
     * @param listener Callback to receive audio state change notifications
     */
    fun startMonitoring(listener: Listener) {
        if (isMonitoring) {
            Bridge.log("$TAG: Already monitoring")
            return
        }

        this.listener = listener
        this.lastKnownState = isPlaying()
        this.isMonitoring = true

        Bridge.log("$TAG: Starting audio playback monitoring (initial state: ${if (lastKnownState) "playing" else "not playing"})")

        // Use AudioPlaybackCallback for API 26+ (real-time detection)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            playbackCallback = object : AudioManager.AudioPlaybackCallback() {
                override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>?) {
                    super.onPlaybackConfigChanged(configs)
                    handlePlaybackConfigChanged(configs)
                }
            }
            audioManager.registerAudioPlaybackCallback(playbackCallback!!, mainHandler)
            Bridge.log("$TAG: Registered AudioPlaybackCallback (API 26+)")
        }

        // Also start polling as a fallback/supplement
        // Some audio sources might not trigger the callback reliably
        startPolling()
    }

    /**
     * Stop monitoring for phone audio playback changes
     */
    fun stopMonitoring() {
        if (!isMonitoring) {
            Bridge.log("$TAG: Not currently monitoring")
            return
        }

        Bridge.log("$TAG: Stopping audio playback monitoring")

        // Unregister callback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && playbackCallback != null) {
            audioManager.unregisterAudioPlaybackCallback(playbackCallback!!)
            playbackCallback = null
        }

        // Stop polling
        stopPolling()

        listener = null
        isMonitoring = false
    }

    /**
     * Handle playback configuration changes from AudioPlaybackCallback
     */
    private fun handlePlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>?) {
        // Check if any active playback exists
        val isActive = configs?.any { config ->
            // isActive checks if the player is actively playing
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                config.audioAttributes.usage == android.media.AudioAttributes.USAGE_MEDIA ||
                config.audioAttributes.usage == android.media.AudioAttributes.USAGE_GAME
            } else {
                true // Fallback for older configs
            }
        } ?: false

        // Also check isMusicActive as a secondary signal
        val isMusicActive = audioManager.isMusicActive
        val isPlaying = isActive || isMusicActive

        notifyIfStateChanged(isPlaying)
    }

    /**
     * Start polling isMusicActive as a fallback mechanism
     */
    private fun startPolling() {
        pollingRunnable = object : Runnable {
            override fun run() {
                if (!isMonitoring) return

                val currentState = isPlaying()
                notifyIfStateChanged(currentState)

                mainHandler.postDelayed(this, POLLING_INTERVAL_MS)
            }
        }
        mainHandler.postDelayed(pollingRunnable!!, POLLING_INTERVAL_MS)
    }

    /**
     * Stop the polling mechanism
     */
    private fun stopPolling() {
        pollingRunnable?.let { mainHandler.removeCallbacks(it) }
        pollingRunnable = null
    }

    /**
     * Notify listener if state has changed
     */
    private fun notifyIfStateChanged(isPlaying: Boolean) {
        if (isPlaying != lastKnownState) {
            lastKnownState = isPlaying
            Bridge.log("$TAG: Audio state changed -> ${if (isPlaying) "PLAYING" else "STOPPED"}")

            mainHandler.post {
                listener?.onPhoneAudioStateChanged(isPlaying)
            }
        }
    }

    /**
     * Clean up resources
     */
    fun destroy() {
        stopMonitoring()
        instance = null
    }
}
