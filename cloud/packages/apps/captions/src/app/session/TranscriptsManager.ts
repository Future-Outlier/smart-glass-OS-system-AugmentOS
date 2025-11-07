import {TranscriptionData} from "@mentra/sdk"
import {UserSession} from "./UserSession"
import {randomUUID} from "crypto"

export interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  timestamp: string | null
  isFinal: boolean
  receivedAt: number
}

interface SSEClient {
  send(data: any): void
}

export class TranscriptsManager {
  readonly userSession: UserSession
  readonly logger: UserSession["logger"]
  readonly disposables: Array<() => void> = []

  private transcripts: TranscriptEntry[] = []
  private maxTranscripts = 100
  private sseClients: Set<SSEClient> = new Set()
  private currentSpeaker = "Speaker 1"
  private lastInterimId: string | null = null

  constructor(userSession: UserSession) {
    this.userSession = userSession
    this.logger = userSession.logger.child({service: "TranscriptsManager"})
    const onTranscription = this.onTranscription.bind(this)
    this.disposables.push(this.userSession.appSession.events.onTranscription(onTranscription))
  }

  private async onTranscription(transcriptData: TranscriptionData) {
    this.logger.info(`Received transcription: ${transcriptData.text} (final: ${transcriptData.isFinal})`)

    const entry = this.createEntry(transcriptData)

    if (transcriptData.isFinal) {
      this.replaceInterim(entry)
    } else {
      this.updateInterim(entry)
    }

    this.broadcast(entry)
  }

  private createEntry(data: TranscriptionData): TranscriptEntry {
    const id = data.isFinal && this.lastInterimId ? this.lastInterimId : randomUUID()

    return {
      id,
      speaker: this.currentSpeaker,
      text: data.text,
      timestamp: data.isFinal ? this.formatTimestamp(new Date()) : null,
      isFinal: data.isFinal,
      receivedAt: Date.now(),
    }
  }

  private updateInterim(entry: TranscriptEntry): void {
    // Remove existing interim transcript
    this.transcripts = this.transcripts.filter((t) => t.isFinal)

    // Add new interim
    this.transcripts.push(entry)
    this.lastInterimId = entry.id

    this.logger.info(`Updated interim transcript: ${entry.text}`)
  }

  private replaceInterim(entry: TranscriptEntry): void {
    // Remove interim transcript
    this.transcripts = this.transcripts.filter((t) => t.isFinal)

    // Add final transcript
    this.transcripts.push(entry)
    this.lastInterimId = null

    // Enforce max transcripts limit (circular buffer)
    if (this.transcripts.length > this.maxTranscripts) {
      this.transcripts = this.transcripts.slice(-this.maxTranscripts)
    }

    this.logger.info(`Added final transcript: ${entry.text}`)
  }

  private formatTimestamp(date: Date): string {
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, "0")
    return `${displayHours}:${displayMinutes} ${ampm}`
  }

  private broadcast(entry: TranscriptEntry): void {
    const message = {
      type: entry.isFinal ? "final" : "interim",
      id: entry.id,
      speaker: entry.speaker,
      text: entry.text,
      timestamp: entry.timestamp,
    }

    for (const client of this.sseClients) {
      try {
        client.send(message)
      } catch (error) {
        this.logger.error(`Failed to send to SSE client: ${error}`)
      }
    }
  }

  public getAll(): TranscriptEntry[] {
    return this.transcripts
  }

  public addSSEClient(client: SSEClient): void {
    this.sseClients.add(client)
    this.logger.info(`SSE client connected. Total clients: ${this.sseClients.size}`)
  }

  public removeSSEClient(client: SSEClient): void {
    this.sseClients.delete(client)
    this.logger.info(`SSE client disconnected. Total clients: ${this.sseClients.size}`)
  }

  dispose() {
    this.disposables.forEach((dispose) => dispose())
    this.sseClients.clear()
  }
}
