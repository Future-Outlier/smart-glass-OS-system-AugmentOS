import {Audio, AVPlaybackStatus} from "expo-av"

interface AudioPlayRequest {
  requestId: string
  audioUrl: string
  appId?: string
  volume?: number
  stopOtherAudio?: boolean
}

interface PlaybackState {
  sound: Audio.Sound
  requestId: string
  appId?: string
  startTime: number
  completed: boolean // Guard against double callbacks
  onComplete: (requestId: string, success: boolean, error: string | null, duration: number | null) => void
}

class AudioPlaybackService {
  private static instance: AudioPlaybackService | null = null
  private currentPlayback: PlaybackState | null = null
  private isInitialized = false

  private constructor() {}

  public static getInstance(): AudioPlaybackService {
    if (!AudioPlaybackService.instance) {
      AudioPlaybackService.instance = new AudioPlaybackService()
    }
    return AudioPlaybackService.instance
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      })
      this.isInitialized = true
      console.log("AUDIO: Audio mode initialized")
    } catch (error) {
      console.error("AUDIO: Failed to initialize audio mode:", error)
      throw error
    }
  }

  /**
   * Play audio from a URL.
   * Returns a promise that resolves with playback result when audio finishes or errors.
   */
  public async play(
    request: AudioPlayRequest,
    onComplete: (requestId: string, success: boolean, error: string | null, duration: number | null) => void,
  ): Promise<void> {
    const {requestId, audioUrl, appId, volume = 1.0, stopOtherAudio = true} = request

    console.log(`AUDIO: Play request ${requestId}${appId ? ` from ${appId}` : ""}: ${audioUrl}`)

    try {
      await this.ensureInitialized()

      // Stop current playback if requested
      if (stopOtherAudio && this.currentPlayback) {
        console.log(`AUDIO: Stopping current playback for ${this.currentPlayback.requestId}`)
        await this.stopCurrentPlayback()
      }

      // Create and load the sound
      const {sound} = await Audio.Sound.createAsync(
        {uri: audioUrl},
        {
          shouldPlay: true,
          volume: Math.max(0, Math.min(1, volume)),
        },
        (status: AVPlaybackStatus) => this.onPlaybackStatusUpdate(status, requestId, onComplete),
      )

      this.currentPlayback = {
        sound,
        requestId,
        appId,
        startTime: Date.now(),
        completed: false,
        onComplete,
      }

      console.log(`AUDIO: Started playback for ${requestId}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error loading audio"
      console.error(`AUDIO: Failed to play ${requestId}:`, errorMessage)
      onComplete(requestId, false, errorMessage, null)
    }
  }

  /**
   * Handle playback status updates from expo-av
   */
  private onPlaybackStatusUpdate(
    status: AVPlaybackStatus,
    requestId: string,
    onComplete: (requestId: string, success: boolean, error: string | null, duration: number | null) => void,
  ): void {
    // Guard against double callbacks - check if this playback is still current and not completed
    if (!this.currentPlayback || this.currentPlayback.requestId !== requestId || this.currentPlayback.completed) {
      return
    }

    if (!status.isLoaded) {
      // Handle error state
      if (status.error) {
        console.error(`AUDIO: Playback error for ${requestId}:`, status.error)
        this.currentPlayback.completed = true
        onComplete(requestId, false, status.error, null)
        this.cleanupCurrentPlayback(requestId)
      }
      return
    }

    // Check if playback finished
    if (status.didJustFinish) {
      const durationMs = status.durationMillis || 0
      const durationSeconds = durationMs / 1000
      console.log(`AUDIO: Playback finished for ${requestId}, duration: ${durationSeconds}s`)
      this.currentPlayback.completed = true
      onComplete(requestId, true, null, durationSeconds)
      this.cleanupCurrentPlayback(requestId)
    }
  }

  /**
   * Stop playback for a specific app.
   * If appId is not provided or current playback has no appId, stops all playback.
   */
  public async stopForApp(appId?: string): Promise<void> {
    if (!this.currentPlayback) return

    // If no appId provided, or current playback has no appId, or they match - stop
    if (!appId || !this.currentPlayback.appId || this.currentPlayback.appId === appId) {
      console.log(`AUDIO: Stopping playback${appId ? ` for app ${appId}` : ""}`)
      await this.stopCurrentPlayback()
    }
  }

  /**
   * Stop all audio playback
   */
  public async stopAll(): Promise<void> {
    if (this.currentPlayback) {
      console.log("AUDIO: Stopping all playback")
      await this.stopCurrentPlayback()
    }
  }

  /**
   * Internal method to stop current playback
   */
  private async stopCurrentPlayback(): Promise<void> {
    if (!this.currentPlayback) return

    const {sound, requestId, startTime, onComplete} = this.currentPlayback
    this.currentPlayback.completed = true // Mark as completed to prevent callback

    try {
      await sound.stopAsync()
      await sound.unloadAsync()
      console.log(`AUDIO: Stopped and unloaded ${requestId}`)
    } catch (error) {
      console.error(`AUDIO: Error stopping playback ${requestId}:`, error)
    }

    // Notify that playback was interrupted so cloud can clear the request mapping
    const elapsedSeconds = (Date.now() - startTime) / 1000
    onComplete(requestId, true, null, elapsedSeconds)

    this.currentPlayback = null
  }

  /**
   * Cleanup after playback completes
   */
  private async cleanupCurrentPlayback(requestId: string): Promise<void> {
    if (this.currentPlayback && this.currentPlayback.requestId === requestId) {
      try {
        await this.currentPlayback.sound.unloadAsync()
      } catch (error) {
        console.error(`AUDIO: Error unloading sound ${requestId}:`, error)
      }
      this.currentPlayback = null
    }
  }

  /**
   * Check if audio is currently playing
   */
  public isPlaying(): boolean {
    return this.currentPlayback !== null && !this.currentPlayback.completed
  }

  /**
   * Get current playback app ID
   */
  public getCurrentAppId(): string | null {
    return this.currentPlayback?.appId || null
  }
}

const audioPlaybackService = AudioPlaybackService.getInstance()
export default audioPlaybackService
