import {createAudioPlayer, AudioPlayer, AudioStatus, setAudioModeAsync} from "expo-audio"
import {BackgroundTimer} from "@/utils/timers"

interface AudioPlayRequest {
  requestId: string
  audioUrl: string
  appId?: string
  volume?: number
  stopOtherAudio?: boolean
}

interface PlaybackState {
  player: AudioPlayer
  requestId: string
  appId?: string
  startTime: number
  completed: boolean // Guard against double callbacks
  onComplete: (requestId: string, success: boolean, error: string | null, duration: number | null) => void
}

class AudioPlaybackService {
  private static instance: AudioPlaybackService | null = null
  private activePlaybacks: Map<string, PlaybackState> = new Map()
  private audioModeConfigured: boolean = false

  private constructor() {}

  /**
   * Configure audio mode for background playback.
   * Must be called before playing audio to ensure playback continues when app is backgrounded.
   */
  private async ensureAudioModeConfigured(): Promise<void> {
    if (this.audioModeConfigured) return

    try {
      await setAudioModeAsync({
        shouldPlayInBackground: true,
        playsInSilentMode: true,
      })
      this.audioModeConfigured = true
      console.log("AUDIO: Audio mode configured for background playback")
    } catch (error) {
      console.error("AUDIO: Failed to configure audio mode:", error)
      // Don't block playback if audio mode config fails
    }
  }

  public static getInstance(): AudioPlaybackService {
    if (!AudioPlaybackService.instance) {
      AudioPlaybackService.instance = new AudioPlaybackService()
    }
    return AudioPlaybackService.instance
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
      // Ensure audio mode is configured for background playback
      await this.ensureAudioModeConfigured()

      // Stop all other playback if requested
      if (stopOtherAudio && this.activePlaybacks.size > 0) {
        console.log(`AUDIO: Stopping ${this.activePlaybacks.size} active playback(s)`)
        await this.stopAllPlaybacks()
      } else {
        // Even if no active playbacks, add a small delay to ensure any recently
        // completed AudioTrack resources are fully released by Android
        await this.delay(50)
      }

      // Create the player with the audio URL
      const player = createAudioPlayer({uri: audioUrl})

      // Set volume
      player.volume = Math.max(0, Math.min(1, volume))

      const playbackState: PlaybackState = {
        player,
        requestId,
        appId,
        startTime: Date.now(),
        completed: false,
        onComplete,
      }

      this.activePlaybacks.set(requestId, playbackState)

      // Add status listener for completion/error handling
      player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        this.onPlaybackStatusUpdate(status, requestId)
      })

      // Start playback
      player.play()

      console.log(`AUDIO: Started playback for ${requestId}, active count: ${this.activePlaybacks.size}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error loading audio"
      console.error(`AUDIO: Failed to play ${requestId}:`, errorMessage)
      onComplete(requestId, false, errorMessage, null)
    }
  }

  /**
   * Handle playback status updates from expo-audio
   */
  private onPlaybackStatusUpdate(status: AudioStatus, requestId: string): void {
    const playback = this.activePlaybacks.get(requestId)

    // Guard against callbacks for unknown or completed playbacks
    if (!playback || playback.completed) {
      return
    }

    // Check if playback finished
    if (status.didJustFinish) {
      const durationMs = (status.duration || 0) * 1000 // expo-audio uses seconds
      console.log(`AUDIO: Playback finished for ${requestId}, duration: ${durationMs}ms`)
      playback.completed = true
      playback.onComplete(requestId, true, null, durationMs)
      this.cleanupPlayback(requestId)
    }
  }

  /**
   * Stop playback for a specific app.
   * If appId is not provided, stops all playback.
   */
  public async stopForApp(appId?: string): Promise<void> {
    if (this.activePlaybacks.size === 0) return

    if (!appId) {
      // No appId provided - stop all
      console.log("AUDIO: Stopping all playback (no appId specified)")
      await this.stopAllPlaybacks()
      return
    }

    // Find and stop all playbacks for this app
    const toStop: string[] = []
    this.activePlaybacks.forEach((playback, reqId) => {
      if (playback.appId === appId) {
        toStop.push(reqId)
      }
    })

    if (toStop.length > 0) {
      console.log(`AUDIO: Stopping ${toStop.length} playback(s) for app ${appId}`)
      await Promise.all(toStop.map(reqId => this.stopPlayback(reqId)))
    }
  }

  /**
   * Stop all audio playback
   */
  public async stopAll(): Promise<void> {
    if (this.activePlaybacks.size > 0) {
      console.log(`AUDIO: Stopping all ${this.activePlaybacks.size} playback(s)`)
      await this.stopAllPlaybacks()
    }
  }

  /**
   * Internal method to stop all playbacks
   */
  private async stopAllPlaybacks(): Promise<void> {
    const requestIds = Array.from(this.activePlaybacks.keys())
    await Promise.all(requestIds.map(reqId => this.stopPlayback(reqId)))
    // Add delay to allow Android AudioTrack resources to be fully released
    // This prevents "AudioFlinger could not create track, status: -12" errors
    await this.delay(100)
  }

  /**
   * Helper to add a delay using BackgroundTimer for Android compatibility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => BackgroundTimer.setTimeout(resolve, ms))
  }

  /**
   * Internal method to stop a specific playback by requestId
   */
  private async stopPlayback(requestId: string): Promise<void> {
    const playback = this.activePlaybacks.get(requestId)
    if (!playback) return

    playback.completed = true // Mark as completed to prevent callback

    try {
      playback.player.pause()
      playback.player.remove()
      console.log(`AUDIO: Stopped and released ${requestId}`)
    } catch (error) {
      console.error(`AUDIO: Error stopping playback ${requestId}:`, error)
    }

    // Notify that playback was interrupted so cloud can clear the request mapping
    const elapsedMs = Date.now() - playback.startTime
    playback.onComplete(requestId, true, null, elapsedMs)

    this.activePlaybacks.delete(requestId)
  }

  /**
   * Cleanup after playback completes naturally
   */
  private cleanupPlayback(requestId: string): void {
    const playback = this.activePlaybacks.get(requestId)
    if (!playback) return

    try {
      // Pause before removing to ensure AudioTrack stops properly
      playback.player.pause()
      playback.player.remove()
    } catch (error) {
      console.error(`AUDIO: Error releasing player ${requestId}:`, error)
    }
    this.activePlaybacks.delete(requestId)
    console.log(`AUDIO: Cleaned up ${requestId}, active count: ${this.activePlaybacks.size}`)
  }

  /**
   * Check if audio is currently playing
   */
  public isPlaying(): boolean {
    let playing = false
    this.activePlaybacks.forEach(playback => {
      if (!playback.completed) {
        playing = true
      }
    })
    return playing
  }

  /**
   * Get current playback app IDs (all active)
   */
  public getActiveAppIds(): string[] {
    const appIds: string[] = []
    this.activePlaybacks.forEach(playback => {
      if (!playback.completed && playback.appId) {
        appIds.push(playback.appId)
      }
    })
    return appIds
  }

  /**
   * Get number of active playbacks
   */
  public getActiveCount(): number {
    return this.activePlaybacks.size
  }
}

const audioPlaybackService = AudioPlaybackService.getInstance()
export default audioPlaybackService
