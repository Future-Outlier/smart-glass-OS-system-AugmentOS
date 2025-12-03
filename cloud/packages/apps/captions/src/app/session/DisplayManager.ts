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

  updateSettings(lineWidth: number, numberOfLines: number, isChineseLanguage: boolean): void {
    this.logger.info(
      `Updating processor settings: lineWidth=${lineWidth}, lines=${numberOfLines}, isChinese=${isChineseLanguage}`,
    )

    // Get previous transcript history to preserve it
    const previousHistory = this.processor.getFinalTranscriptHistory()

    // Create new processor with updated settings
    this.processor = new TranscriptProcessor(lineWidth, numberOfLines, 30, isChineseLanguage)

    // Restore transcript history
    for (const transcript of previousHistory) {
      this.processor.processString(transcript, true)
    }

    this.logger.info(`Preserved ${previousHistory.length} transcripts after settings change`)
  }

  processAndDisplay(text: string, isFinal: boolean): void {
    this.logger.info(`Processing transcript: "${text}" (final: ${isFinal})`)
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
