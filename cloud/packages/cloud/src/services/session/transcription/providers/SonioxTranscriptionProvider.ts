/**
 * @fileoverview Soniox provider implementation using WebSocket API
 */

import WebSocket from "ws";
import {
  StreamType,
  getLanguageInfo,
  TranscriptionData,
  SonioxToken,
} from "@mentra/sdk";
import { Logger } from "pino";
import {
  TranscriptionProvider,
  StreamInstance,
  StreamOptions,
  ProviderType,
  ProviderHealthStatus,
  ProviderLanguageCapabilities,
  SonioxProviderConfig,
  StreamState,
  StreamCallbacks,
  StreamMetrics,
  StreamHealth,
  SonioxProviderError,
} from "../types";

// Import Soniox language configuration from JSON
import sonioxLanguageData from "./SonioxLanguages.json";

// Extract supported language codes for the real-time model
const SONIOX_SUPPORTED_LANGUAGES: string[] = [];
const rtModel = sonioxLanguageData.models.find(
  (m) => m.id === "stt-rt-preview",
);
if (rtModel) {
  // Extract just the language codes (e.g., "en", "es", "fr")
  rtModel.languages.forEach((lang) => {
    if (!SONIOX_SUPPORTED_LANGUAGES.includes(lang.code)) {
      SONIOX_SUPPORTED_LANGUAGES.push(lang.code);
    }
  });
}

// Soniox WebSocket endpoint
const SONIOX_WEBSOCKET_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

// Soniox API token response interface (renamed to avoid conflict with SDK type)
interface SonioxApiToken {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  is_final: boolean;
  speaker?: string;
  language?: string; // Language code for this token
}

interface SonioxResponse {
  tokens?: SonioxApiToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
  error_code?: number;
  error_message?: string;
  finished?: boolean; // Indicates end of transcription
}

export class SonioxTranscriptionProvider implements TranscriptionProvider {
  readonly name = ProviderType.SONIOX;
  readonly logger: Logger;

  private healthStatus: ProviderHealthStatus;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private config: SonioxProviderConfig,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ provider: this.name });

    this.healthStatus = {
      isHealthy: true,
      lastCheck: Date.now(),
      failures: 0,
    };

    this.logger.info(
      {
        supportedLanguages: SONIOX_SUPPORTED_LANGUAGES.length,
        languages: SONIOX_SUPPORTED_LANGUAGES,
      },
      `Soniox provider initialized with ${SONIOX_SUPPORTED_LANGUAGES.length} supported languages`,
    );
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing Soniox provider");

    if (!this.config.apiKey) {
      throw new Error("Soniox API key is required");
    }

    // TODO: Initialize actual Soniox client when implementing
    this.logger.info(
      {
        endpoint: this.config.endpoint,
        keyLength: this.config.apiKey.length,
      },
      "Soniox provider initialized (stub)",
    );
  }

  async dispose(): Promise<void> {
    this.logger.info("Disposing Soniox provider");
    // TODO: Cleanup Soniox client when implementing
  }

  async createTranscriptionStream(
    language: string,
    options: StreamOptions,
  ): Promise<StreamInstance> {
    this.logger.debug(
      {
        language,
        streamId: options.streamId,
      },
      "Creating Soniox transcription stream",
    );

    if (!this.supportsLanguage(language)) {
      throw new SonioxProviderError(
        `Language ${language} not supported by Soniox`,
        400,
      );
    }

    // Create real Soniox WebSocket stream
    const stream = new SonioxTranscriptionStream(
      options.streamId,
      options.subscription,
      this,
      language,
      undefined,
      options.callbacks,
      this.logger,
      this.config,
    );

    // Initialize WebSocket connection
    await stream.initialize();

    return stream;
  }

  // Translation is now handled by a separate TranslationManager
  // This method should not be in TranscriptionProvider

  supportsSubscription(subscription: string): boolean {
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      return false;
    }

    // Only support transcription
    if (languageInfo.type === StreamType.TRANSCRIPTION) {
      return this.supportsLanguage(languageInfo.transcribeLanguage);
    }

    return false;
  }

  supportsLanguage(language: string): boolean {
    // Check if the language is in our supported transcription languages list
    // Language parameter is already a language code like "en-US", not a subscription string

    // Extract base language code (e.g., 'en' for 'en-US')
    const baseLanguage = language.split("-")[0].toLowerCase();

    // Check if this base language is supported by Soniox
    return SONIOX_SUPPORTED_LANGUAGES.includes(baseLanguage);
  }

  // Translation validation is now handled by TranslationManager

  getLanguageCapabilities(): ProviderLanguageCapabilities {
    // Build a list of language codes in the format expected (e.g., "en-US")
    // For now, we'll just return the base language codes since Soniox
    // supports multiple variants for most languages
    const transcriptionLanguages: string[] = [];

    if (rtModel) {
      rtModel.languages.forEach((lang) => {
        // Add the base language code (Soniox accepts base codes)
        transcriptionLanguages.push(lang.code);
      });
    }

    return {
      transcriptionLanguages,
      autoLanguageDetection: true, // Soniox supports auto language detection
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    // Update health based on recent failures
    const now = Date.now();
    const recentFailures = this.getRecentFailureCount(300000); // 5 minutes

    this.healthStatus.lastCheck = now;
    this.healthStatus.failures = this.failureCount;
    this.healthStatus.lastFailure = this.lastFailureTime;

    // Mark as unhealthy if too many recent failures
    if (recentFailures >= 5) {
      this.healthStatus.isHealthy = false;
      this.healthStatus.reason = `Too many recent failures: ${recentFailures}`;
    } else if (!this.healthStatus.isHealthy && recentFailures < 2) {
      // Gradually restore health
      this.healthStatus.isHealthy = true;
      this.healthStatus.reason = undefined;
    }

    return { ...this.healthStatus };
  }

  recordFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.logger.warn(
      {
        error: error.message,
        totalFailures: this.failureCount,
      },
      "Recorded provider failure",
    );
  }

  recordSuccess(): void {
    // Don't reset failure count completely, just mark as more recent success
    const now = Date.now();

    // If it's been a while since last failure, gradually reduce count
    if (this.lastFailureTime && now - this.lastFailureTime > 300000) {
      // 5 minutes
      this.failureCount = Math.max(0, this.failureCount - 1);
    }

    this.logger.debug("Recorded provider success");
  }

  private getRecentFailureCount(timeWindowMs: number): number {
    const now = Date.now();
    return this.lastFailureTime && now - this.lastFailureTime < timeWindowMs
      ? this.failureCount
      : 0;
  }
}

/**
 * Soniox-specific stream implementation using WebSocket API
 */
class SonioxTranscriptionStream implements StreamInstance {
  public state = StreamState.INITIALIZING;
  public startTime = Date.now();
  public readyTime?: number;
  public lastActivity = Date.now();
  public lastError?: Error;
  public metrics: StreamMetrics;

  private ws?: WebSocket;
  private connectionTimeout?: NodeJS.Timeout;
  private isConfigSent = false;
  // Rolling compaction: maintain finalized prefix as plain text; retain only current tail tokens
  private stablePrefixText: string = "";
  private lastSentInterim = ""; // Track last sent interim to avoid duplicates

  // Helper to convert internal tokens to SDK format
  private convertToSdkTokens(
    tokens: Array<{
      text: string;
      isFinal: boolean;
      confidence: number;
      start_ms: number;
      end_ms: number;
      speaker?: string;
    }>,
  ): SonioxToken[] {
    return tokens.map((token) => ({
      text: token.text,
      startMs: token.start_ms,
      endMs: token.end_ms,
      confidence: token.confidence,
      isFinal: token.isFinal,
      speaker: token.speaker,
    }));
  }

  // Translation-specific token buffers (one per language)
  private translationTokenBuffers: Map<
    string,
    Map<
      number,
      {
        text: string;
        isFinal: boolean;
        confidence: number;
        start_ms: number;
        end_ms: number;
        speaker?: string;
      }
    >
  > = new Map();
  private translationFallbackPositions: Map<string, number> = new Map();
  private lastSentTranslationInterims: Map<string, string> = new Map();

  // Keepalive management
  private keepaliveInterval?: NodeJS.Timeout;

  constructor(
    public readonly id: string,
    public readonly subscription: string,
    public readonly provider: SonioxTranscriptionProvider,
    public readonly language: string,
    public readonly targetLanguage: string | undefined,
    public readonly callbacks: StreamCallbacks,
    public readonly logger: Logger,
    private readonly config: SonioxProviderConfig,
  ) {
    this.metrics = {
      totalDuration: 0,
      audioChunksReceived: 0,
      audioChunksWritten: 0,
      audioDroppedCount: 0,
      audioWriteFailures: 0,
      consecutiveFailures: 0,
      errorCount: 0,
    };
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(
          { streamId: this.id },
          "Connecting to Soniox WebSocket",
        );

        // Create WebSocket connection
        this.ws = new WebSocket(SONIOX_WEBSOCKET_URL);

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.state === StreamState.INITIALIZING) {
            this.handleError(new Error("Soniox connection timeout"));
            reject(new Error("Connection timeout"));
          }
        }, 10000); // 10 second timeout

        this.ws.on("open", () => {
          this.logger.debug(
            { streamId: this.id },
            "Soniox WebSocket connected",
          );
          this.sendConfiguration();

          // Start automatic keepalive for this stream
          this.startKeepalive();
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error: Error) => {
          this.logger.error(
            { error, streamId: this.id },
            "Soniox WebSocket error",
          );
          this.handleError(error);
          reject(error);
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          this.logger.info(
            { code, reason: reason.toString(), streamId: this.id },
            "Soniox WebSocket closed",
          );
          this.state = StreamState.CLOSED;
          if (this.callbacks.onClosed) {
            this.callbacks.onClosed();
          }
        });

        // Resolve when stream becomes ready
        const checkReady = () => {
          if (this.state === StreamState.READY) {
            resolve();
          } else if (this.state === StreamState.ERROR) {
            reject(this.lastError || new Error("Stream initialization failed"));
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  private sendConfiguration(): void {
    if (!this.ws || this.isConfigSent) {
      return;
    }
    const languageHint = this.language.split("-")[0]; // Normalize to base language code (e.g. 'en' from 'en-US')
    const targetLanguageHint = this.targetLanguage
      ? this.targetLanguage.split("-")[0]
      : undefined;
    const languageHints = targetLanguageHint
      ? [languageHint, targetLanguageHint]
      : [languageHint];

    const disableLanguageIdentification = this.subscription.endsWith(
      "?no-language-identification=true",
    );
    const config: any = {
      api_key: this.config.apiKey,
      model: this.config.model || "stt-rt-preview-v2",
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,
      enable_language_identification: !disableLanguageIdentification, // Toggle based on flag
      max_non_final_tokens_duration_ms: 2000,
      enable_endpoint_detection: true, // Automatically finalize tokens on speech pauses
      enable_speaker_diarization: true,
      language_hints: languageHints, // Default hints, can be overridden
      // context: "Mentra, MentraOS, Mira, Hey Mira",
    };

    // Configure translation if target language is specified
    if (this.targetLanguage) {
      // Use two-way translation configuration like the Soniox example
      config.translation = {
        type: "two_way",
        language_a: this.language.split("-")[0], // Convert en-US to en
        language_b: this.targetLanguage.split("-")[0], // Convert es-ES to es
      };
      config.language_hints = [
        config.translation.language_a,
        config.translation.language_b,
      ];
    } else {
      // Just transcription
      config.language = this.language;
    }

    try {
      this.ws.send(JSON.stringify(config));
      this.isConfigSent = true;

      this.logger.debug(
        {
          streamId: this.id,
          language: this.language,
          model: config.model,
        },
        "Sent Soniox configuration",
      );

      // Mark as ready after config is sent
      setTimeout(() => {
        if (this.state === StreamState.INITIALIZING) {
          this.state = StreamState.READY;
          this.readyTime = Date.now();
          this.metrics.initializationTime = this.readyTime - this.startTime;

          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
          }

          if (this.callbacks.onReady) {
            this.callbacks.onReady();
          }

          this.logger.info(
            {
              streamId: this.id,
              initTime: this.metrics.initializationTime,
            },
            "Soniox stream ready",
          );
        }
      }, 1000); // Give Soniox a moment to process config
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private handleMessage(data: Buffer): void {
    try {
      const response: SonioxResponse = JSON.parse(data.toString());

      if (response.error_code) {
        this.handleError(
          new Error(
            `Soniox error ${response.error_code}: ${response.error_message}`,
          ),
        );
        return;
      }

      if (response.tokens && response.tokens.length > 0) {
        this.processSonioxTokens(response.tokens);
      }
    } catch (error) {
      this.logger.warn(
        { error, streamId: this.id },
        "Error parsing Soniox response",
      );
    }
  }

  private processSonioxTokens(tokens: SonioxApiToken[]): void {
    if (this.targetLanguage) {
      // Should never receive translation tokens in transcription provider
      this.logger.error(
        { streamId: this.id },
        "Transcription provider incorrectly receiving translation tokens",
      );
      return;
    } else {
      // Transcription mode
      this.processTranscriptionTokens(tokens);
    }
  }

  private processTranscriptionTokens(tokens: SonioxApiToken[]): void {
    // New approach: append final tokens to stablePrefixText; keep only tail (non-final) tokens
    let hasEndToken = false;
    let avgConfidence = 0;
    const tailTokens: Array<{
      text: string;
      isFinal: boolean;
      confidence: number;
      start_ms: number;
      end_ms: number;
      speaker?: string;
    }> = [];

    for (const token of tokens) {
      if (token.text === "<end>") {
        hasEndToken = true;
        continue;
      }
      if (token.is_final) {
        this.stablePrefixText += token.text;
      } else {
        tailTokens.push({
          text: token.text,
          isFinal: false,
          confidence: token.confidence,
          start_ms: token.start_ms ?? 0,
          end_ms: token.end_ms ?? 0,
        });
        avgConfidence += token.confidence;
      }
    }

    if (tailTokens.length > 0) {
      avgConfidence /= tailTokens.length;
    }

    const tailText = tailTokens.map((t) => t.text).join("");
    const currentInterim = (this.stablePrefixText + tailText)
      .replace(/\s+/g, " ")
      .trim();

    if (currentInterim && currentInterim !== this.lastSentInterim) {
      const interimData: TranscriptionData = {
        type: StreamType.TRANSCRIPTION,
        text: currentInterim,
        isFinal: false,
        confidence: avgConfidence || undefined,
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        transcribeLanguage: this.language,
        provider: "soniox",
        metadata: {
          provider: "soniox",
          soniox: {
            tokens: this.convertToSdkTokens(
              tailTokens.map((t) => ({
                text: t.text,
                isFinal: t.isFinal,
                confidence: t.confidence,
                start_ms: t.start_ms,
                end_ms: t.end_ms,
              })),
            ),
          },
        },
      };

      this.callbacks.onData?.(interimData);
      this.lastSentInterim = currentInterim;

      this.logger.debug(
        {
          streamId: this.id,
          text: currentInterim.substring(0, 100),
          isFinal: false,
          tailTokenCount: tailTokens.length,
          provider: "soniox",
        },
        `🎙️ SONIOX: interim transcription - "${currentInterim}"`,
      );
    }

    if (hasEndToken) {
      if (this.lastSentInterim) {
        const finalData: TranscriptionData = {
          type: StreamType.TRANSCRIPTION,
          text: this.lastSentInterim,
          isFinal: true,
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          transcribeLanguage: this.language,
          provider: "soniox",
          metadata: { provider: "soniox" },
        };
        this.callbacks.onData?.(finalData);
        this.logger.debug(
          {
            streamId: this.id,
            text: this.lastSentInterim.substring(0, 100),
            isFinal: true,
            provider: "soniox",
          },
          `🎙️ SONIOX: FINAL transcription - "${this.lastSentInterim}"`,
        );
      }
      // Reset for next utterance
      this.stablePrefixText = "";
      this.lastSentInterim = "";
    }
  }

  /**
   * Force finalize the current token buffer (called when VAD stops)
   * This sends whatever tokens we have as a final transcription
   */
  forceFinalizePendingTokens(): void {
    if (!this.lastSentInterim) {
      this.logger.debug(
        { streamId: this.id, provider: "soniox" },
        "🎙️ SONIOX: VAD stop - no interim to finalize",
      );
      return;
    }
    const finalData: TranscriptionData = {
      type: StreamType.TRANSCRIPTION,
      text: this.lastSentInterim,
      isFinal: true,
      startTime: Date.now(),
      endTime: Date.now() + 1000,
      transcribeLanguage: this.language,
      provider: "soniox",
      metadata: { provider: "soniox" },
    };

    this.callbacks.onData?.(finalData);

    this.logger.debug(
      {
        streamId: this.id,
        text: this.lastSentInterim.substring(0, 100),
        isFinal: true,
        provider: "soniox",
        trigger: "VAD_STOP",
      },
      `🎙️ SONIOX: VAD-triggered FINAL transcription - "${this.lastSentInterim}"`,
    );

    // Reset rolling state for next session
    this.stablePrefixText = "";
    this.lastSentInterim = "";
  }

  private handleError(error: Error): void {
    this.state = StreamState.ERROR;
    this.lastError = error;
    this.metrics.errorCount++;
    this.metrics.consecutiveFailures++;

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    // Reset rolling state on error to prevent stale data
    this.stablePrefixText = "";
    this.lastSentInterim = "";

    this.provider.recordFailure(error);

    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }
  }

  async writeAudio(data: ArrayBuffer): Promise<boolean> {
    this.lastActivity = Date.now();
    this.metrics.audioChunksReceived++;

    // Simple state check - drop audio if not ready
    if (this.state !== StreamState.READY && this.state !== StreamState.ACTIVE) {
      this.metrics.audioDroppedCount++;
      return false;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.metrics.audioDroppedCount++;
      return false;
    }

    try {
      // Send audio as binary frame to Soniox
      this.ws.send(data);

      this.state = StreamState.ACTIVE;
      this.metrics.audioChunksWritten++;
      this.metrics.lastSuccessfulWrite = Date.now();
      this.metrics.consecutiveFailures = 0;

      return true;
    } catch (error) {
      this.metrics.audioWriteFailures++;
      this.metrics.consecutiveFailures++;
      this.metrics.errorCount++;

      this.logger.warn(
        { error, streamId: this.id },
        "Error writing audio to Soniox",
      );

      // Too many failures? Mark as error
      if (this.metrics.consecutiveFailures >= 5) {
        this.handleError(error as Error);
      }

      return false;
    }
  }

  async close(): Promise<void> {
    this.state = StreamState.CLOSING;

    try {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;
      }

      // Stop keepalive if active
      this.stopKeepalive();

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send empty binary frame to signal end of audio
        this.ws.send(Buffer.alloc(0));

        // Close WebSocket connection
        this.ws.close(1000, "Stream closed normally");
      }

      // Reset rolling state to prevent stale data
      this.stablePrefixText = "";
      this.lastSentInterim = "";

      // Reset translation buffers
      this.translationTokenBuffers.clear();
      this.translationFallbackPositions.clear();
      this.lastSentTranslationInterims.clear();

      this.state = StreamState.CLOSED;
      this.metrics.totalDuration = Date.now() - this.startTime;

      this.logger.debug(
        {
          streamId: this.id,
          duration: this.metrics.totalDuration,
          audioChunksWritten: this.metrics.audioChunksWritten,
        },
        "Soniox stream closed",
      );
    } catch (error) {
      this.logger.warn(
        { error, streamId: this.id },
        "Error during Soniox stream close",
      );
      this.state = StreamState.CLOSED; // Force closed even on error
    }
  }

  getHealth(): StreamHealth {
    return {
      isAlive:
        this.state === StreamState.READY || this.state === StreamState.ACTIVE,
      lastActivity: this.lastActivity,
      consecutiveFailures: this.metrics.consecutiveFailures,
      lastSuccessfulWrite: this.metrics.lastSuccessfulWrite,
      providerHealth: this.provider.getHealthStatus(),
    };
  }

  /**
   * Start automatic keepalive for this stream
   * Sends keepalive messages every 15 seconds for the lifetime of the stream
   */
  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      return; // Already started
    }

    this.logger.debug(
      { streamId: this.id },
      "Starting automatic Soniox keepalive",
    );

    // Set up interval to send keepalive every 15 seconds
    // (Soniox requires at least once every 20 seconds)
    this.keepaliveInterval = setInterval(() => {
      this.sendKeepalive();
    }, 15000);
  }

  /**
   * Stop automatic keepalive when stream closes
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = undefined;
      this.logger.debug(
        { streamId: this.id },
        "Stopped automatic Soniox keepalive",
      );
    }
  }

  /**
   * Send a keepalive message to Soniox
   */
  private sendKeepalive(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        { streamId: this.id },
        "Cannot send keepalive - WebSocket not open",
      );
      return;
    }

    try {
      const keepaliveMessage = { type: "keepalive" };
      this.ws.send(JSON.stringify(keepaliveMessage));

      this.logger.debug(
        { streamId: this.id },
        "Sent keepalive message to Soniox",
      );
      this.lastActivity = Date.now();
    } catch (error) {
      this.logger.error(
        { error, streamId: this.id },
        "Error sending keepalive message",
      );
    }
  }
}
