import {AppSession, TranscriptionData} from "@mentra/sdk"
import {UserSession} from "./UserSession"

export class TranscriptsManager {
  readonly userSession: UserSession
  readonly logger: AppSession["logger"]
  readonly disposables: Array<() => void> = []

  constructor(userSession: UserSession) {
    this.userSession = userSession
    this.logger = userSession.logger.child({service: "TranscriptsManager"})
    const onTranscription = this.onTranscription.bind(this)
    this.disposables.push(this.userSession.appSession.events.onTranscription(onTranscription))
  }

  private async onTranscription(transcriptData: TranscriptionData) {
    this.logger.info("Received transcription data: " + transcriptData.text)
  }

  dispose() {
    this.disposables.forEach((dispose) => dispose())
  }
}
