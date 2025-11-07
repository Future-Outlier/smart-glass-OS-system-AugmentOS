import path from "path"
import {AppServer, AppSession, TranscriptionData} from "@mentra/sdk"
import {languageToLocale, convertLineWidth} from "./utils"
import {convertToPinyin} from "./utils/ChineseUtils"
import {UserSession} from "./session/UserSession"

/**
 * LiveCaptionsApp - Main application class that extends AppServer
 */
export class LiveCaptionsApp extends AppServer {
  constructor(config: {packageName: string; apiKey: string; port: number; publicDir?: string}) {
    super({
      packageName: config.packageName,
      apiKey: config.apiKey,
      port: config.port,
      publicDir: path.join(__dirname, "./public"),
    })
  }

  /**
   * Called by AppServer when a new session is created
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n🗣️🗣️🗣️Received new session for user ${userId}, session ${sessionId}\n\n`)

    const userSession = new UserSession(session)

    try {
      // Initialize settings
      await userSession.settings.initialize()

      // Get current settings to determine language and processor config
      const language = await userSession.settings.getLanguage()
      const locale = languageToLocale(language)
      const isChineseLanguage = language === "Chinese (Hanzi)"

      let lineWidth = await userSession.settings.getDisplayWidth()
      lineWidth = convertLineWidth(lineWidth.toString(), isChineseLanguage)

      const numberOfLines = await userSession.settings.getDisplayLines()

      // Update display manager with settings
      userSession.display.updateSettings(lineWidth, numberOfLines, isChineseLanguage)

      // Subscribe to transcription events
      const cleanup = session.onTranscriptionForLanguage(locale, (data: TranscriptionData) => {
        this.handleTranscription(userSession, data)
      })

      this.addCleanupHandler(cleanup)

      console.log(`Session initialized for user ${userId} with language ${locale}`)
    } catch (error) {
      console.error("Error initializing session:", error)

      // Fallback: subscribe with default language
      const cleanup = session.onTranscriptionForLanguage("en-US", (data: TranscriptionData) => {
        this.handleTranscription(userSession, data)
      })

      this.addCleanupHandler(cleanup)
    }
  }

  /**
   * Called by AppServer when a session is stopped
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`Session ${sessionId} stopped: ${reason}`)
    UserSession.getUserSession(userId)?.dispose()
  }

  /**
   * Handles transcription data from the MentraOS cloud
   */
  private async handleTranscription(userSession: UserSession, transcriptionData: TranscriptionData): Promise<void> {
    const isFinal = transcriptionData.isFinal
    let newTranscript = transcriptionData.text

    // Check if the language is Chinese and user has selected Pinyin format
    const activeLanguage = await userSession.settings.getLanguage()
    if (activeLanguage === "Chinese (Pinyin)") {
      newTranscript = convertToPinyin(newTranscript)
      console.log(`Converting Chinese to Pinyin`)
    }

    // Process and display on glasses via DisplayManager
    userSession.display.processAndDisplay(newTranscript, isFinal)
  }
}
