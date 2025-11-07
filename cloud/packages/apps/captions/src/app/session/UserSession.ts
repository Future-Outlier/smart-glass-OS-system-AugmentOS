import {AppSession} from "@mentra/sdk"
import {TranscriptsManager} from "./TranscriptsManager"
import {SettingsManager} from "./SettingsManager"
import {DisplayManager} from "./DisplayManager"

export class UserSession {
  static readonly userSessions: Map<string, UserSession> = new Map<string, UserSession>()
  readonly userId: string
  readonly appSession: AppSession
  readonly logger: AppSession["logger"]
  readonly transcripts: TranscriptsManager
  readonly settings: SettingsManager
  readonly display: DisplayManager

  constructor(appSession: AppSession) {
    this.appSession = appSession
    this.userId = appSession.userId
    this.logger = appSession.logger
    this.transcripts = new TranscriptsManager(this)
    this.settings = new SettingsManager(this)
    this.display = new DisplayManager(this)
    UserSession.userSessions.set(this.userId, this)
  }

  dispose() {
    this.transcripts.dispose()
    this.settings.dispose()
    this.display.dispose()
    UserSession.userSessions.delete(this.userId)
  }

  public static getUserSession(userId: string): UserSession | undefined {
    return UserSession.userSessions.get(userId)
  }
}
