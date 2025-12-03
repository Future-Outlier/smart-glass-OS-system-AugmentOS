import {ViewType} from "@mentra/sdk"
import {TranscriptProcessor} from "../utils"
import {UserSession} from "./UserSession"

export class DisplayManager {
  private processor: TranscriptProcessor
  private inactivityTimer: NodeJS.Timeout | null = null
  private readonly userSession: UserSession
  private readonly logger: UserSession["logger"]

  constructor(userSession: UserSession) {
    this.userSession = userSession
    this.logger = userSession.logger.child({service: "DisplayManager"})

    // Initialize with defaults (will be updated by SettingsManager)
    this.processor = new TranscriptProcessor(30, 3, 30)
  }

  /**
   * Update display settings
   * @param visualWidth - Maximum visual width per line (1 unit = 1 Latin char, CJK = 2 units)
   * @param numberOfLines - Maximum number of lines to display
   */
  updateSettings(visualWidth: number, numberOfLines: number): void {
    this.logger.info(
      `Updating processor settings: visualWidth=${visualWidth}, lines=${numberOfLines}`,
    )

    // Get previous transcript history to preserve it
    const previousHistory = this.processor.getFinalTranscriptHistory()

    // Create new processor with updated settings
    // Note: isChinese parameter is deprecated - visual width handles all languages automatically
    this.processor = new TranscriptProcessor(visualWidth, numberOfLines, 30)

    // Restore transcript history
    for (const transcript of previousHistory) {
      this.processor.processString(transcript, true)
    }

    this.logger.info(`Preserved ${previousHistory.length} transcripts after settings change`)

    // Immediately refresh the display with new settings
    this.refreshDisplay()
  }

  /**
   * Refresh the display with current transcript history using current settings
   * Called after settings change to show instant preview
   */
  private refreshDisplay(): void {
    const history = this.processor.getFinalTranscriptHistory()

    if (history.length === 0) {
      // No transcripts yet, send empty preview
      this.userSession.transcripts.broadcastDisplayPreview("", [""], true)
      return
    }

    // Get the current formatted display from processor
    const currentDisplay = this.processor.getCurrentDisplay()
    const displayLines = this.processor.getCurrentDisplayLines()

    if (currentDisplay.trim()) {
      const cleaned = this.cleanTranscriptText(currentDisplay)
      const lines = cleaned.split("\n")

      this.logger.info(`Refreshing display with new settings: ${lines.length} lines`)

      // Send to glasses
      this.userSession.appSession.layouts.showTextWall(cleaned, {
        view: ViewType.MAIN,
        durationMs: 20000,
      })

      // Broadcast to webview preview
      this.userSession.transcripts.broadcastDisplayPreview(cleaned, lines, true)
    }
  }

  /**
   * Process transcription text and display on glasses
   * @param text - The transcription text
   * @param isFinal - Whether this is a final transcription
   * @param speakerId - Optional speaker ID from diarization (for future speaker labels feature)
   */
  processAndDisplay(text: string, isFinal: boolean, speakerId?: string): void {
    this.logger.info(`Processing transcript: "${text}" (final: ${isFinal}, speaker: ${speakerId || "unknown"})`)
    const formatted = this.processor.processString(text, isFinal)
    this.logger.info(`Formatted for display: "${formatted}"`)
    this.showOnGlasses(formatted, isFinal)
    this.resetInactivityTimer()
  }

  private showOnGlasses(text: string, isFinal: boolean): void {
    const cleaned = this.cleanTranscriptText(text)
    const lines = cleaned.split("\n")

    this.logger.info(
      `Showing on glasses: "${cleaned}" (final: ${isFinal}, duration: ${isFinal ? "20s" : "indefinite"})`,
    )

    // Send to glasses
    this.userSession.appSession.layouts.showTextWall(cleaned, {
      view: ViewType.MAIN,
      durationMs: isFinal ? 20000 : undefined,
    })

    // Broadcast to webview preview
    this.userSession.transcripts.broadcastDisplayPreview(cleaned, lines, isFinal)
  }

  private cleanTranscriptText(text: string): string {
    // Remove leading punctuation marks (both Western and Chinese)
    // Western: . , ; : ! ?
    // Chinese: 。 ， ； ： ！ ？
    return text.replace(/^[.,;:!?。，；：！？]+/, "").trim()
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer)
    }

    // Clear transcript processor history after 40 seconds of inactivity
    this.inactivityTimer = setTimeout(() => {
      this.logger.info("Clearing transcript processor history due to inactivity")

      this.processor.clear()

      // Show empty state to clear the glasses display
      this.userSession.appSession.layouts.showTextWall("", {
        view: ViewType.MAIN,
        durationMs: 1000,
      })
    }, 40000)
  }

  dispose(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer)
    }
  }
}
