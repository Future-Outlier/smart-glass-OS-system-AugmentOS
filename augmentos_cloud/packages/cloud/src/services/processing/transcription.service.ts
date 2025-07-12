// import * as azureSpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
// import {
//   SessionEventArgs,
//   SpeechRecognitionCanceledEventArgs,
//   ProfanityOption,
//   OutputFormat,
//   AudioInputStream,
//   AudioConfig,
//   ConversationTranscriber,
//   ConversationTranscriptionEventArgs,
//   CancellationReason
// } from 'microsoft-cognitiveservices-speech-sdk';
// import {
//   StreamType,
//   TranscriptionData,
//   TranslationData,
//   // UserSession,
//   ExtendedStreamType,
//   getLanguageInfo,
//   TranscriptSegment,
//   CloudToAppMessage,
//   DataStream,
//   CloudToAppMessageType
// } from '@mentra/sdk';
// // import webSocketService from '../websocket/websocket.service';
// import subscriptionService from '../session/subscription.service';
// import { logger as rootLogger } from '../logging/pino-logger';
// import UserSession from '../session/UserSession';
// import { sessionService } from '../session/session.service';

// // Define module name constant for consistent logging
// const SERVICE_NAME = 'transcription.service';
// // Create a module-level logger for system-wide events
// const logger = rootLogger.child({ service: SERVICE_NAME });

// export const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "";
// export const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || "";

// /**
//  * Circuit breaker to prevent cascading failures when Azure is overloaded
//  */
// class AzureTranscriptionCircuitBreaker {
//   private rateLimitFailures = 0;
//   private lastRateLimitTime = 0;
//   private circuitOpen = false;
//   private readonly RATE_LIMIT_THRESHOLD = 5; // 5 failures triggers circuit open
//   private readonly CIRCUIT_RESET_TIME = 120000; // 2 minutes (was 10 minutes)
//   private readonly FAILURE_WINDOW = 180000; // 3 minutes (was 5 minutes)

//   /**
//    * Check if new Azure connection attempts should be allowed
//    */
//   canAttemptConnection(): boolean {
//     const now = Date.now();
    
//     // Reset circuit if enough time has passed
//     if (now - this.lastRateLimitTime > this.CIRCUIT_RESET_TIME) {
//       this.rateLimitFailures = 0;
//       this.circuitOpen = false;
//       return true;
//     }
    
//     // Check if we're in failure window with too many failures
//     if (this.rateLimitFailures >= this.RATE_LIMIT_THRESHOLD && 
//         now - this.lastRateLimitTime < this.FAILURE_WINDOW) {
//       this.circuitOpen = true;
//       return false;
//     }
    
//     return true;
//   }

//   /**
//    * Record a rate limiting failure
//    */
//   recordRateLimitFailure(): void {
//     this.rateLimitFailures++;
//     this.lastRateLimitTime = Date.now();
    
//     if (this.rateLimitFailures >= this.RATE_LIMIT_THRESHOLD) {
//       this.circuitOpen = true;
//       logger.error({
//         rateLimitFailures: this.rateLimitFailures,
//         circuitOpen: this.circuitOpen
//       }, '🚨 Azure transcription circuit breaker OPENED - blocking new connections for 2 minutes');
//     }
//   }

//   /**
//    * Record a successful connection (helps with gradual recovery)
//    */
//   recordSuccess(): void {
//     // Gradually reduce failure count on success
//     if (this.rateLimitFailures > 0) {
//       this.rateLimitFailures = Math.max(0, this.rateLimitFailures - 1);
//     }
//   }

//   /**
//    * Get current circuit state for monitoring
//    */
//   getState(): { open: boolean, failures: number, lastFailure: number } {
//     return {
//       open: this.circuitOpen,
//       failures: this.rateLimitFailures,
//       lastFailure: this.lastRateLimitTime
//     };
//   }
// }

// // Global circuit breaker instance
// const azureCircuitBreaker = new AzureTranscriptionCircuitBreaker();

// /**
//  * Extend the UserSession type with our new property.
//  */
// // export type ExtendedUserSession = UserSession & {
// //   transcriptionStreams?: Map<string, ASRStreamInstance>;
// // };

// /**
//  * Interface for an individual ASR stream instance.
//  */
// export interface ASRStreamInstance {
//   recognizer: ConversationTranscriber | azureSpeechSDK.TranslationRecognizer;
//   pushStream: AudioInputStream;

//   // Enhanced state tracking
//   isReady: boolean;           // Azure session fully ready for audio
//   isInitializing: boolean;    // Stream setup in progress
//   startTime: number;          // Creation timestamp
//   readyTime?: number;         // When Azure session became ready
//   retryCount: number;         // Retry attempt counter

//   // Diagnostics
//   audioChunksReceived: number;    // Total audio chunks attempted
//   audioChunksWritten: number;     // Successfully written to Azure
//   lastAudioTime?: number;         // Last successful audio write
//   sessionId?: string;             // Azure session identifier
// }

// export class TranscriptionService {
//   private speechConfig: azureSpeechSDK.SpeechConfig;
//   private sessionStartTime = 0;
  
//   // Global connection tracking to prevent Azure rate limits
//   private static globalActiveStreams = 0;
//   private static readonly MAX_GLOBAL_STREAMS = 500; // Safety margin under 700 Azure limit

//   constructor(config: {
//     speechRecognitionLanguage?: string;
//     enableProfanityFilter?: boolean;
//   } = {}) {
//     logger.info('Initializing TranscriptionService');

//     if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
//       logger.error({
//         hasKey: !!AZURE_SPEECH_KEY,
//         hasRegion: !!AZURE_SPEECH_REGION,
//         keyLength: AZURE_SPEECH_KEY?.length || 0,
//         region: AZURE_SPEECH_REGION || 'undefined'
//       }, 'Missing Azure credentials');
//       throw new Error('Azure Speech key and region are required');
//     }

//     this.speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(
//       AZURE_SPEECH_KEY,
//       AZURE_SPEECH_REGION
//     );

//     this.speechConfig.speechRecognitionLanguage = config.speechRecognitionLanguage || 'en-US';
//     // Remove profanity filtering by setting to Raw (i.e. unfiltered text)
//     this.speechConfig.setProfanity(ProfanityOption.Raw);
//     this.speechConfig.outputFormat = OutputFormat.Simple;

//     logger.info({
//       language: this.speechConfig.speechRecognitionLanguage,
//       region: AZURE_SPEECH_REGION,
//       format: 'Simple'
//     }, 'TranscriptionService initialized');
//   }

//   updateTranscriptionStreams(userSession: UserSession, desiredSubscriptions: ExtendedStreamType[]): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
//     const desiredSet = new Set(desiredSubscriptions);

//     // Create new streams if needed
//     desiredSet.forEach(subscription => {
//       if (!userSession.transcriptionStreams!.has(subscription)) {
//         sessionLogger.info({ subscription }, 'Starting new transcription stream');
//         try {
//           const newStream = this.createASRStreamForSubscription(subscription, userSession);
//           userSession.transcriptionStreams!.set(subscription, newStream);
//         } catch (error) {
//           sessionLogger.error({ subscription, error }, 'Failed to create transcription stream, will retry later');

//           // Schedule retry after 2 seconds
//           setTimeout(() => {
//             if (desiredSet.has(subscription) && !userSession.transcriptionStreams!.has(subscription)) {
//               sessionLogger.info({ subscription }, 'Retrying transcription stream creation');
//               try {
//                 const retryStream = this.createASRStreamForSubscription(subscription, userSession);
//                 userSession.transcriptionStreams!.set(subscription, retryStream);
//               } catch (retryError) {
//                 sessionLogger.error({ subscription, error: retryError }, 'Retry failed for transcription stream');
//               }
//             }
//           }, 2000);
//         }
//       }
//     });

//     // Stop streams no longer desired
//     userSession.transcriptionStreams!.forEach((streamInstance, key) => {
//       if (!desiredSet.has(key)) {
//         sessionLogger.info({ subscription: key }, 'Stopping transcription stream');
//         this.stopIndividualTranscriptionStream(streamInstance, key, userSession);
//         userSession.transcriptionStreams!.delete(key);
//       }
//     });
//   }

//   private createASRStreamForSubscription(subscription: ExtendedStreamType, userSession: UserSession): ASRStreamInstance {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     // Check global connection limit before attempting Azure connection
//     if (TranscriptionService.globalActiveStreams >= TranscriptionService.MAX_GLOBAL_STREAMS) {
//       sessionLogger.error({
//         subscription,
//         globalActiveStreams: TranscriptionService.globalActiveStreams,
//         maxGlobalStreams: TranscriptionService.MAX_GLOBAL_STREAMS,
//         operation: 'globalLimitReached'
//       }, '🚨 Global Azure connection limit reached - blocking new transcription stream creation');
      
//       throw new Error(`Global Azure connection limit reached: ${TranscriptionService.globalActiveStreams}/${TranscriptionService.MAX_GLOBAL_STREAMS}. This prevents rate limiting.`);
//     }

//     // Check circuit breaker before attempting Azure connection
//     if (!azureCircuitBreaker.canAttemptConnection()) {
//       const circuitState = azureCircuitBreaker.getState();
//       sessionLogger.error({
//         subscription,
//         circuitState,
//         operation: 'circuitBreakerOpen'
//       }, '🚨 Azure circuit breaker is OPEN - blocking new transcription stream creation');
      
//       throw new Error(`Azure transcription service temporarily unavailable due to rate limiting. Circuit breaker open with ${circuitState.failures} recent failures.`);
//     }

//     // Use the updated parse logic – which returns transcribeLanguage and translateLanguage.
//     const languageInfo = getLanguageInfo(subscription);
//     if (!languageInfo) {
//       sessionLogger.error({ subscription }, 'Invalid language subscription');
//       throw new Error(`Invalid language subscription: ${subscription}`);
//     }

//     const pushStream = azureSpeechSDK.AudioInputStream.createPushStream();
//     const audioConfig = AudioConfig.fromStreamInput(pushStream);

//     // Create stream instance with proper initial state
//     const streamInstance: ASRStreamInstance = {
//       recognizer: null!, // Will be set below
//       pushStream,
//       isReady: false,
//       isInitializing: true,
//       startTime: Date.now(),
//       retryCount: 0,
//       audioChunksReceived: 0,
//       audioChunksWritten: 0
//     };

//     // Enhanced logging for creation
//     sessionLogger.info({
//       subscription,
//       retryCount: streamInstance.retryCount,
//       operation: 'createStream'
//     }, 'Creating Azure Speech Recognition stream');

//     // Set up recognizer based on stream type
//     if (languageInfo.type === StreamType.TRANSLATION && languageInfo.translateLanguage) {
//       const translationConfig = azureSpeechSDK.SpeechTranslationConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
//       translationConfig.speechRecognitionLanguage = languageInfo.transcribeLanguage;
//       translationConfig.addTargetLanguage(languageInfo.translateLanguage);
//       translationConfig.setProfanity(ProfanityOption.Raw);
//       streamInstance.recognizer = new azureSpeechSDK.TranslationRecognizer(translationConfig, audioConfig);
//     } else {
//       const speechConfig = azureSpeechSDK.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
//       speechConfig.speechRecognitionLanguage = languageInfo.transcribeLanguage;
//       speechConfig.setProfanity(ProfanityOption.Raw);
//       streamInstance.recognizer = new ConversationTranscriber(speechConfig, audioConfig);
//     }

//     // ✅ CRITICAL: Proper Azure session event handling with post-session-start delay
//     streamInstance.recognizer.sessionStarted = (_sender: any, event: SessionEventArgs) => {
//       streamInstance.isInitializing = false;
//       streamInstance.sessionId = event.sessionId;

//       sessionLogger.info({
//         subscription,
//         sessionId: event.sessionId,
//         operation: 'sessionStarted'
//       }, 'Azure Speech session started - adding safety delay before enabling audio flow');

//       // ✅ NEW: Add delay before marking as ready to prevent error code 7
//       // This ensures Azure is truly ready to receive audio after session start
//       setTimeout(() => {
//         streamInstance.isReady = true;
//         streamInstance.readyTime = Date.now();

//         const initializationTime = streamInstance.readyTime - streamInstance.startTime;

//         // Record successful connection in circuit breaker
//         azureCircuitBreaker.recordSuccess();
        
//         // Increment global connection counter
//         TranscriptionService.globalActiveStreams++;

//         sessionLogger.info({
//           subscription,
//           sessionId: event.sessionId,
//           initializationTime,
//           retryCount: streamInstance.retryCount,
//           circuitBreakerState: azureCircuitBreaker.getState(),
//           globalActiveStreams: TranscriptionService.globalActiveStreams,
//           operation: 'sessionReady'
//         }, `✅ Azure Speech session ready after ${initializationTime}ms (including 500ms safety delay) - audio flow enabled (${TranscriptionService.globalActiveStreams} global connections)`);
//       }, 500); // 500ms delay after sessionStarted to prevent InvalidOperation error 7
//     };

//     streamInstance.recognizer.sessionStopped = (_sender: any, event: SessionEventArgs) => {
//       streamInstance.isReady = false;
      
//       // Decrement global connection counter
//       if (TranscriptionService.globalActiveStreams > 0) {
//         TranscriptionService.globalActiveStreams--;
//       }

//       sessionLogger.info({
//         subscription,
//         sessionId: event.sessionId,
//         audioChunksWritten: streamInstance.audioChunksWritten,
//         globalActiveStreams: TranscriptionService.globalActiveStreams,
//         operation: 'sessionStopped'
//       }, `Azure Speech session stopped - audio flow disabled (${TranscriptionService.globalActiveStreams} global connections remaining)`);
//     };

//     // NOTE: The .canceled handler is set up later in setupRecognitionHandlersForInstance
//     // This ensures it doesn't get overwritten and our smart retry logic is applied correctly

//     // Set up recognition event handlers
//     this.setupRecognitionHandlersForInstance(streamInstance, userSession, subscription, languageInfo);

//     // Start recognition and handle setup errors
//     const startRecognition = () => {
//       sessionLogger.debug({
//         subscription,
//         retryCount: streamInstance.retryCount,
//         operation: 'startRecognition'
//       }, 'Starting Azure Speech Recognition after setup delay');

//       if (languageInfo.type === StreamType.TRANSLATION) {
//         (streamInstance.recognizer as azureSpeechSDK.TranslationRecognizer).startContinuousRecognitionAsync(
//           () => {
//             sessionLogger.debug({
//               subscription,
//               operation: 'recognitionStarted'
//             }, 'Azure Translation Recognition started - waiting for session ready event');
//           },
//           (error) => {
//             streamInstance.isInitializing = false;
//             sessionLogger.error({
//               subscription,
//               error,
//               retryCount: streamInstance.retryCount,
//               operation: 'startRecognitionFailed'
//             }, 'Failed to start Azure Translation Recognition');

//             // Trigger retry logic through error handling
//             this.handleStreamError(streamInstance, subscription, userSession, {
//               errorCode: 999, // Custom error code for start failures
//               errorDetails: error,
//               reason: 'StartRecognitionFailed'
//             } as any);
//           }
//         );
//       } else {
//         (streamInstance.recognizer as ConversationTranscriber).startTranscribingAsync(
//           () => {
//             sessionLogger.debug({
//               subscription,
//               operation: 'transcriptionStarted'
//             }, 'Azure Transcription started - waiting for session ready event');
//           },
//           (error) => {
//             streamInstance.isInitializing = false;
//             sessionLogger.error({
//               subscription,
//               error,
//               retryCount: streamInstance.retryCount,
//               operation: 'startTranscriptionFailed'
//             }, 'Failed to start Azure Transcription');

//             // Trigger retry logic through error handling
//             this.handleStreamError(streamInstance, subscription, userSession, {
//               errorCode: 999,
//               errorDetails: error,
//               reason: 'StartTranscriptionFailed'
//             } as any);
//           }
//         );
//       }
//     };

//     // ✅ NEW: Add delay before starting recognition to prevent error code 7
//     // This allows Azure SDK to complete internal setup before we start recognition
//     sessionLogger.info({
//       subscription,
//       operation: 'delayBeforeStart'
//     }, 'Waiting 200ms before starting Azure recognition to prevent InvalidOperation error 7');

//     setTimeout(() => {
//       startRecognition();
//     }, 200); // 200ms delay before starting recognition

//     return streamInstance;
//   }

//   private stopIndividualTranscriptionStream(
//     streamInstance: ASRStreamInstance,
//     subscription: string,
//     userSession?: UserSession
//   ): void {
//     // Use session logger if available, otherwise fall back to module logger
//     const loggerToUse = userSession
//       ? userSession.logger.child({ service: SERVICE_NAME })
//       : logger;

//     if (streamInstance.recognizer) {
//       try {
//         if (subscription.includes(StreamType.TRANSLATION)) {
//           (streamInstance.recognizer as azureSpeechSDK.TranslationRecognizer).stopContinuousRecognitionAsync(
//             () => {
//               loggerToUse.info({ subscription }, 'Stopped translation stream');
//             },
//             (error: any) => {
//               loggerToUse.error({ error, subscription }, 'Error stopping translation stream');
//             }
//           );
//         } else {
//           (streamInstance.recognizer as ConversationTranscriber).stopTranscribingAsync(
//             () => {
//               loggerToUse.info({ subscription }, 'Stopped transcription stream');
//             },
//             (error: any) => {
//               loggerToUse.error({ error, subscription }, 'Error stopping transcription stream');
//             }
//           );
//         }

//         try {
//           streamInstance.recognizer.close();
//         } catch (error) {
//           loggerToUse.warn({ error, subscription }, 'Error closing recognizer');
//         }
//       } catch (error) {
//         loggerToUse.error({ error, subscription }, 'Error in stopIndividualTranscriptionStream');
//       }
//     }

//     if (streamInstance.pushStream) {
//       try {
//         streamInstance.pushStream.close();
//       } catch (error) {
//         loggerToUse.warn({ error }, 'Error closing push stream');
//       }
//     }
//   }

//   private setupRecognitionHandlersForInstance(
//     instance: ASRStreamInstance,
//     userSession: UserSession,
//     subscription: ExtendedStreamType,
//     languageInfo: { type: StreamType; transcribeLanguage: string; translateLanguage?: string }
//   ): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     if (languageInfo.type === StreamType.TRANSLATION) {
//       // Translation branch: use recognizing and recognized.
//       (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognizing = (_sender: any, event: any) => {
//         if (!event.result.translations) return;

//         // console.log('3223 event.result.translations', event.result.translations);

//         // console.log('event.result.text', event.result.translations);
//         // TODO: Find a better way to handle this
//         // console.log('4242 translateLanguage', languageInfo.translateLanguage);
//         const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(languageInfo.translateLanguage);
//         // console.log('5555 translatedText', translatedText);
//         const didTranslate = translatedText.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim() !== event.result.text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim();
//         // console.log('6666 didTranslate', didTranslate);
//         const detectedSourceLang = didTranslate ? languageInfo.transcribeLanguage : languageInfo.translateLanguage;

//         // console.log('detectedSourceLang', detectedSourceLang);
//         // console.log('languageInfo.translateLanguage', languageInfo.translateLanguage);
//         // console.log('languageInfo.transcribeLanguage', languageInfo.transcribeLanguage);
//         // console.log('didTranslate', didTranslate);
//         // console.log('translatedText', translatedText);
//         // console.log('event.result.text', event.result.text);

//         sessionLogger.debug({
//           subscription,
//           from: detectedSourceLang,
//           to: languageInfo.translateLanguage,
//           text: translatedText,
//           isFinal: false,
//           speakerId: event.result.speakerId
//         }, 'Translation interim result');

//         const translationData: TranslationData = {
//           type: StreamType.TRANSLATION,
//           text: translatedText,
//           originalText: event.result.text,
//           startTime: this.calculateRelativeTime(event.result.offset),
//           endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
//           isFinal: false,
//           speakerId: event.result.speakerId,
//           transcribeLanguage: languageInfo.transcribeLanguage,
//           translateLanguage: languageInfo.translateLanguage,
//           didTranslate: didTranslate
//         };

//         // console.log('translationData', translationData);

//         this.broadcastTranscriptionResult(userSession, translationData);

//         // Save transcript in the appropriate language
//         this.updateTranscriptHistory(userSession, event, false, languageInfo.translateLanguage);
//       };

//       (instance.recognizer as azureSpeechSDK.TranslationRecognizer).recognized = (_sender: any, event: any) => {
//         if (!event.result.translations) return;

//         // Note(isaiah): without splitting, it was breaking translation. Need to investigate why.
//         const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(languageInfo.translateLanguage);
//         // const translatedText = languageInfo.transcribeLanguage === languageInfo.translateLanguage ? event.result.text : event.result.translations.get(translateLanguage);
//         // Compare normalized text to determine if translation occurred
//         const didTranslate = translatedText.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim() !== event.result.text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').trim();
//         const detectedSourceLang = didTranslate ? languageInfo.transcribeLanguage : languageInfo.translateLanguage;

//         sessionLogger.debug({
//           subscription,
//           from: detectedSourceLang,
//           to: languageInfo.translateLanguage,
//           text: translatedText,
//           isFinal: true,
//           speakerId: event.result.speakerId,
//           duration: event.result.duration
//         }, 'Translation final result');

//         const translationData: TranslationData = {
//           type: StreamType.TRANSLATION,
//           isFinal: true,
//           text: translatedText,
//           originalText: event.result.text,
//           startTime: this.calculateRelativeTime(event.result.offset),
//           endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
//           speakerId: event.result.speakerId,
//           duration: event.result.duration,
//           transcribeLanguage: languageInfo.transcribeLanguage,
//           translateLanguage: languageInfo.translateLanguage,
//           didTranslate: didTranslate
//         };
//         this.broadcastTranscriptionResult(userSession, translationData);

//         // Save transcript in the appropriate language
//         this.updateTranscriptHistory(userSession, event, true, languageInfo.translateLanguage);
//       };
//     } else {
//       // Transcription branch.
//       (instance.recognizer as ConversationTranscriber).transcribing = (_sender: any, event: ConversationTranscriptionEventArgs) => {
//         if (!event.result.text) return;

//         sessionLogger.debug({
//           subscription,
//           language: languageInfo.transcribeLanguage,
//           text: event.result.text,
//           isFinal: false,
//           speakerId: event.result.speakerId
//         }, 'Transcription interim result');

//         const transcriptionData: TranscriptionData = {
//           type: StreamType.TRANSCRIPTION,
//           text: event.result.text,
//           startTime: this.calculateRelativeTime(event.result.offset),
//           endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
//           isFinal: false,
//           speakerId: event.result.speakerId,
//           transcribeLanguage: languageInfo.transcribeLanguage
//         };

//         // Save transcript for all languages, not just English
//         this.updateTranscriptHistory(userSession, event, false, languageInfo.transcribeLanguage);
//         this.broadcastTranscriptionResult(userSession, transcriptionData);
//       };

//       (instance.recognizer as ConversationTranscriber).transcribed = (_sender: any, event: ConversationTranscriptionEventArgs) => {
//         if (!event.result.text) return;

//         sessionLogger.debug({
//           subscription,
//           language: languageInfo.transcribeLanguage,
//           text: event.result.text,
//           isFinal: true,
//           speakerId: event.result.speakerId,
//           duration: event.result.duration
//         }, 'Transcription final result');

//         const transcriptionData: TranscriptionData = {
//           type: StreamType.TRANSCRIPTION,
//           isFinal: true,
//           text: event.result.text,
//           startTime: this.calculateRelativeTime(event.result.offset),
//           endTime: this.calculateRelativeTime(event.result.offset + event.result.duration),
//           speakerId: event.result.speakerId,
//           duration: event.result.duration,
//           transcribeLanguage: languageInfo.transcribeLanguage
//         };

//         // Save transcript for all languages, not just English
//         this.updateTranscriptHistory(userSession, event, true, languageInfo.transcribeLanguage);
//         this.broadcastTranscriptionResult(userSession, transcriptionData);
//       };
//     }

//     // ✅ SMART AZURE ERROR HANDLING with Circuit Breaker and Intelligent Retry Logic
//     instance.recognizer.canceled = (_sender: any, event: SpeechRecognitionCanceledEventArgs) => {
//       const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
      
//       // Update instance state
//       instance.isReady = false;
//       instance.isInitializing = false;

//       const sessionAge = Date.now() - instance.startTime;
//       const timeSinceReady = instance.readyTime ? Date.now() - instance.readyTime : null;

//       // Enhanced error diagnostics
//       const errorDiagnostics = {
//         subscription,
//         sessionId: instance.sessionId,
//         errorCode: event.errorCode,
//         errorDetails: event.errorDetails,
//         reason: event.reason,

//         // Timing diagnostics
//         sessionAge,
//         timeSinceReady,
//         wasEverReady: !!instance.readyTime,
//         initializationTime: instance.readyTime ? instance.readyTime - instance.startTime : null,

//         // Audio flow diagnostics
//         audioChunksReceived: instance.audioChunksReceived,
//         audioChunksWritten: instance.audioChunksWritten,
//         audioWriteSuccessRate: instance.audioChunksReceived > 0 ?
//           (instance.audioChunksWritten / instance.audioChunksReceived * 100).toFixed(1) + '%' : 'N/A',

//         // Retry context
//         retryCount: instance.retryCount,

//         // Azure context
//         azureRegion: AZURE_SPEECH_REGION,
//         recognizerType: languageInfo.type === StreamType.TRANSLATION ? 'TranslationRecognizer' : 'ConversationTranscriber',

//         // Circuit breaker context
//         circuitBreakerState: azureCircuitBreaker.getState(),

//         // Root cause indicators
//         likelyRaceCondition: event.errorCode === 7 && !instance.readyTime && instance.audioChunksReceived > 0,
//         likelyNetworkIssue: event.errorCode === 4 || event.reason === CancellationReason.Error,
//         likelyAuthIssue: event.errorCode === 1 || event.errorCode === 2,
//         likelyRateLimiting: event.errorCode === 4 && event.errorDetails && event.errorDetails.includes('4429')
//       };

//       // Track rate limiting failures in circuit breaker
//       if (errorDiagnostics.likelyRateLimiting) {
//         azureCircuitBreaker.recordRateLimitFailure();
//         sessionLogger.error(errorDiagnostics,
//           '🚨 Azure rate limiting detected (4429) - recorded in circuit breaker');
//       }

//       // Contextual error logging
//       if (event.errorCode === 7) {
//         if (!instance.readyTime && instance.audioChunksReceived > 0) {
//           sessionLogger.error(errorDiagnostics,
//             '🔥 RACE CONDITION: Audio fed to Azure stream before session ready (Error Code 7)');
//         } else {
//           sessionLogger.error(errorDiagnostics,
//             '⚠️ Azure Invalid Operation (Error Code 7) - stream was ready but operation failed');
//         }
//       } else {
//         sessionLogger.error(errorDiagnostics,
//           `🚨 Azure Speech Recognition canceled (Error Code ${event.errorCode}) - applying smart retry logic`);
//       }

//       // Clean up current stream and decrement global counter
//       this.stopIndividualTranscriptionStream(instance, subscription, userSession);
//       userSession.transcriptionStreams?.delete(subscription);
      
//       // Ensure global counter is decremented for failed/canceled streams
//       if (instance.isReady && TranscriptionService.globalActiveStreams > 0) {
//         TranscriptionService.globalActiveStreams--;
//         sessionLogger.debug({
//           subscription,
//           globalActiveStreams: TranscriptionService.globalActiveStreams,
//           operation: 'decrementGlobalCounter'
//         }, `Decremented global connection counter after stream cancellation (${TranscriptionService.globalActiveStreams} remaining)`);
//       }

//       // Handle retry logic with proper categorization
//       this.handleStreamError(instance, subscription, userSession, event);
//     };

//     instance.recognizer.sessionStarted = (_sender: any, _event: SessionEventArgs) => {
//       sessionLogger.info({ subscription }, 'Recognition session started');
//       instance.isReady = true;
//     };

//     instance.recognizer.sessionStopped = (_sender: any, _event: SessionEventArgs) => {
//       sessionLogger.info({ subscription }, 'Recognition session stopped');
//     };
//   }

//   private calculateRelativeTime(absoluteTime: number): number {
//     return absoluteTime - this.sessionStartTime;
//   }

//   // TODO(isaiah): copied from the old websocket service, Need to rethink how to cleanly implement this.
//   //   /**
//   //    * 🗣️📣 Broadcasts data to all Apps subscribed to a specific stream type.
//   //    * @param userSessionId - ID of the user's glasses session
//   //    * @param streamType - Type of data stream
//   //    * @param data - Data to broadcast
//   //    */
//   private broadcastToApp(userSession: UserSession, streamType: StreamType, data: CloudToAppMessage): void {
//     // const userSession = sessionService.getSession(userSessionId);
//     // if (!userSession) {
//     //   logger.error(`[transcription.service]: User session not found for ${userSessionId}`);
//     //   return;
//     // }

//     // If the stream is transcription or translation and data has language info,
//     // construct an effective subscription string.
//     let effectiveSubscription: ExtendedStreamType = streamType;
//     // For translation, you might also include target language if available.
//     if (streamType === StreamType.TRANSLATION) {
//       effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}-to-${(data as any).translateLanguage}`;
//     } else if (streamType === StreamType.TRANSCRIPTION && !(data as any).transcribeLanguage) {
//       effectiveSubscription = `${streamType}:en-US`;
//     } else if (streamType === StreamType.TRANSCRIPTION) {
//       effectiveSubscription = `${streamType}:${(data as any).transcribeLanguage}`;
//     }

//     const subscribedApps = subscriptionService.getSubscribedApps(userSession, effectiveSubscription);

//     // Send to all subscribed apps using centralized messaging with automatic resurrection
//     subscribedApps.forEach(async (packageName) => {
//       const appSessionId = `${userSession.sessionId}-${packageName}`;

//       // CloudDataStreamMessage
//       const dataStream: DataStream = {
//         type: CloudToAppMessageType.DATA_STREAM,
//         sessionId: appSessionId,
//         streamType, // Base type remains the same in the message.
//         data,      // The data now may contain language info.
//         timestamp: new Date()
//       };

//       try {
//         // Use centralized messaging with automatic resurrection
//         const result = await userSession.appManager.sendMessageToApp(packageName, dataStream);

//         if (!result.sent) {
//           userSession.logger.warn({
//             service: SERVICE_NAME,
//             packageName,
//             resurrectionTriggered: result.resurrectionTriggered,
//             error: result.error
//           }, `Failed to send transcription data to App ${packageName}`);
//         } else if (result.resurrectionTriggered) {
//           userSession.logger.warn({
//             service: SERVICE_NAME,
//             packageName
//           }, `Transcription data sent to App ${packageName} after resurrection`);
//         }
//       } catch (error) {
//         userSession.logger.error({
//           service: SERVICE_NAME,
//           packageName,
//           error: error instanceof Error ? error.message : String(error)
//         }, `Error sending transcription data to App ${packageName}`);
//       }
//     });
//   }

//   private broadcastTranscriptionResult(userSession: UserSession, data: TranscriptionData | TranslationData): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     sessionLogger.debug({
//       data,
//       operation: 'broadcast'
//     }, 'Broadcasting transcription/translation result');

//     try {
//       const streamType = data.type === StreamType.TRANSLATION ? StreamType.TRANSLATION : StreamType.TRANSCRIPTION;
//       this.broadcastToApp(userSession, streamType, data);
//     } catch (error) {
//       sessionLogger.error({
//         error,
//         data,
//         operation: 'broadcast'
//       }, 'Error broadcasting result');
//     }
//   }

//   feedAudioToTranscriptionStreams(userSession: UserSession, audioData: Uint8Array) {

//     if (!userSession.transcriptionStreams) {
//       const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
//       sessionLogger.error({
//         operation: 'feedAudio'
//       }, 'No transcription streams found for session');
//       return;
//     }

//     // Too verbose to log every audio feed, so we can comment this out.
//     // sessionLogger.debug({
//     //   numStreams: userSession.transcriptionStreams.size,
//     //   dataSize: audioData.length,
//     //   operation: 'feedAudio'
//     // }, 'Feeding audio data to transcription streams');

//     userSession.transcriptionStreams.forEach((instance, key) => {
//       try {
//         // Increment chunks received counter for diagnostics
//         instance.audioChunksReceived++;

//         // ✅ CRITICAL: Audio gating - only write if Azure session is ready
//         if (!instance.isReady) {
//           const streamAge = Date.now() - (instance.startTime || 0);
//           const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//           // Enhanced logging for race condition detection
//           if (instance.isInitializing) {
//             // Stream is still initializing - this is normal for first few seconds
//             if (streamAge > 5000) {
//               sessionLogger.warn({
//                 streamKey: key,
//                 streamAge,
//                 startTime: instance.startTime,
//                 isInitializing: instance.isInitializing,
//                 audioChunksReceived: instance.audioChunksReceived,
//                 audioChunksWritten: instance.audioChunksWritten,
//                 operation: 'audioGated_initializing'
//               }, '⏳ Stream still initializing after 5s - gating audio to prevent race condition');
//             }
//           } else {
//             // Stream failed to initialize or became unready
//             sessionLogger.warn({
//               streamKey: key,
//               streamAge,
//               wasEverReady: !!instance.readyTime,
//               sessionId: instance.sessionId,
//               retryCount: instance.retryCount,
//               audioChunksReceived: instance.audioChunksReceived,
//               operation: 'audioGated_notReady'
//             }, '🚫 Audio gated: Stream not ready (may be in error/retry state)');
//           }
//           return;
//         }

//         // Check if stream is closed before writing
//         if ((instance.pushStream as any)?._readableState?.destroyed ||
//           (instance.pushStream as any)?._readableState?.ended) {
//           const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
//           sessionLogger.warn({
//             streamKey: key,
//             operation: 'audioGated_destroyed'
//           }, 'Skipping write to destroyed/ended stream');
//           return;
//         }

//         // ✅ Audio is flowing to Azure - convert to ArrayBuffer and update counters
//         // CRITICAL: Azure SDK expects ArrayBuffer, but we receive Uint8Array
//         const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
//         (instance.pushStream as any).write(arrayBuffer);
//         instance.audioChunksWritten++;
//         instance.lastAudioTime = Date.now();

//         // Periodic success logging (every 1000 chunks to avoid spam)
//         if (instance.audioChunksWritten % 1000 === 0) {
//           const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });
//           const sessionAge = Date.now() - instance.startTime;
//           const timeSinceReady = instance.readyTime ? Date.now() - instance.readyTime : null;
//           const successRate = (instance.audioChunksWritten / instance.audioChunksReceived * 100).toFixed(1);

//           sessionLogger.debug({
//             streamKey: key,
//             sessionId: instance.sessionId,
//             audioChunksWritten: instance.audioChunksWritten,
//             audioChunksReceived: instance.audioChunksReceived,
//             successRate: `${successRate}%`,
//             sessionAge,
//             timeSinceReady,
//             operation: 'audioFlowHealthy'
//           }, `✅ Healthy audio flow: ${instance.audioChunksWritten} chunks written (${successRate}% success rate)`);
//         }
//       } catch (error: unknown) {
//         const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//         // Enhanced error logging with detailed Azure diagnostics
//         const errorDetails = {
//           // Stream context
//           streamKey: key,
//           userId: userSession.userId,
//           operation: 'feedAudio',

//           // Audio context
//           audioDataSize: audioData.length,
//           audioDataType: audioData.constructor.name,

//           // Azure-specific error details
//           errorCode: (error as any)?.code || (error as any)?.errorCode,
//           errorDetails: (error as any)?.errorDetails || (error as any)?.details,
//           azureReason: (error as any)?.reason,
//           azureResultId: (error as any)?.resultId,
//           errorName: (error as any)?.name,
//           errorMessage: (error as any)?.message,

//           // Stream state diagnostics
//           pushStreamState: {
//             exists: !!instance.pushStream,
//             closed: (instance.pushStream as any)?._readableState?.ended,
//             destroyed: (instance.pushStream as any)?._readableState?.destroyed,
//             readable: (instance.pushStream as any)?._readableState?.readable,
//             internalState: (instance.pushStream as any)?._state
//           },

//           recognizerState: {
//             exists: !!instance.recognizer,
//             state: (instance.recognizer as any)?._impl?.privReco?.privSessionId || 'unknown'
//           },

//           // Runtime info
//           azureSDKInfo: 'microsoft-cognitiveservices-speech-sdk',
//           timestamp: new Date().toISOString()
//         };

//         // Enrich the error object if it's an Error instance
//         if (error instanceof Error) {
//           sessionLogger.error(error, 'Error writing to push stream');
//           sessionLogger.debug({ errorDetails }, 'push stream Error Detailed error information');
//         }

//         // Remove dead streams to prevent repeated errors
//         if ((error as any)?.message === "Stream closed" ||
//           (error as any)?.name === "InvalidOperation") {
//           sessionLogger.warn({ streamKey: key }, 'Removing closed/invalid stream to prevent spam');
//           userSession.transcriptionStreams?.delete(key);
//         }
//       }
//     });
//   }

//   /***********************
//    * Legacy Methods
//    ***********************/
//   startTranscription(userSession: UserSession): void {
//     const extSession = userSession as UserSession;
//     const sessionLogger = extSession.logger.child({ service: SERVICE_NAME });

//     sessionLogger.info({
//       sessionId: extSession.sessionId,
//       operation: 'startTranscription'
//     }, 'Starting transcription (legacy method)');

//     const minimalSubs = subscriptionService.getMinimalLanguageSubscriptions(extSession.sessionId);

//     sessionLogger.debug({
//       subscriptions: minimalSubs,
//       operation: 'startTranscription'
//     }, 'Retrieved minimal language subscriptions');

//     this.updateTranscriptionStreams(extSession, minimalSubs);
//   }

//   stopTranscription(userSession: UserSession): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     sessionLogger.info({
//       sessionId: userSession.sessionId,
//       operation: 'stopTranscription'
//     }, 'Stopping all transcription streams (legacy method)');

//     this.updateTranscriptionStreams(userSession, []);
//   }

//   handlePushStreamError(userSession: UserSession, error: any): void {
//     const extSession = userSession as UserSession;
//     const sessionLogger = extSession.logger.child({ service: SERVICE_NAME });

//     sessionLogger.error({
//       error,
//       sessionId: extSession.sessionId,
//       operation: 'handlePushStreamError'
//     }, 'Handling push stream error, stopping transcription');

//     this.stopTranscription(userSession);
//   }

//   private updateTranscriptHistory(
//     userSession: UserSession,
//     event: ConversationTranscriptionEventArgs,
//     isFinal: boolean,
//     language: string = 'en-US'
//   ): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     // Initialize languageSegments if it doesn't exist
//     if (!userSession.transcript.languageSegments) {
//       sessionLogger.debug({ language }, 'Initializing language segments map');
//       userSession.transcript.languageSegments = new Map<string, TranscriptSegment[]>();
//     }

//     // Ensure the language entry exists in the map
//     if (!userSession.transcript.languageSegments.has(language)) {
//       sessionLogger.debug({ language }, 'Creating new language segment array');
//       userSession.transcript.languageSegments.set(language, []);
//     }

//     // Handle both the language-specific segments and (for backward compatibility) the legacy segments
//     const segments = language === 'en-US' ? userSession.transcript.segments : [];
//     const languageSegments = userSession.transcript.languageSegments.get(language)!;

//     // Check if we need to update an interim segment
//     const hasInterimLastLegacy = segments.length > 0 && !segments[segments.length - 1].isFinal;
//     const hasInterimLastLanguage = languageSegments.length > 0 && !languageSegments[languageSegments.length - 1].isFinal;

//     const currentTime = new Date();
//     const newSegment = {
//       resultId: event.result.resultId,
//       speakerId: event.result.speakerId,
//       text: event.result.text,
//       timestamp: currentTime,
//       isFinal: isFinal
//     };

//     // Handle final segment
//     if (isFinal) {
//       // For language-specific segments
//       if (hasInterimLastLanguage) {
//         languageSegments.pop(); // Remove the interim segment
//       }
//       languageSegments.push({ ...newSegment });

//       // For backward compatibility with legacy segments (English only)
//       if (language === 'en-US') {
//         if (hasInterimLastLegacy) {
//           segments.pop(); // Remove the interim segment
//         }
//         segments.push({ ...newSegment });
//       }
//     }
//     // Handle interim segment
//     else {
//       // For language-specific segments
//       if (hasInterimLastLanguage) {
//         languageSegments[languageSegments.length - 1] = { ...newSegment };
//       } else {
//         languageSegments.push({ ...newSegment });
//       }

//       // For backward compatibility with legacy segments (English only)
//       if (language === 'en-US') {
//         if (hasInterimLastLegacy) {
//           segments[segments.length - 1] = { ...newSegment };
//         } else {
//           segments.push({ ...newSegment });
//         }
//       }
//     }

//     // Prune old segments (older than 30 minutes)
//     const thirtyMinutesAgo = new Date(currentTime.getTime() - 30 * 60 * 1000);

//     // Update language-specific segments
//     const filteredLanguageSegments = languageSegments.filter(
//       seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
//     );
//     userSession.transcript.languageSegments.set(language, filteredLanguageSegments);

//     // Update legacy segments (English only) for backward compatibility
//     if (language === 'en-US') {
//       const filteredSegments = segments.filter(
//         seg => seg.timestamp && new Date(seg.timestamp) >= thirtyMinutesAgo
//       );
//       userSession.transcript.segments = filteredSegments;
//     }

//     sessionLogger.debug({
//       language,
//       segmentCount: languageSegments.length,
//       isFinal: isFinal,
//       operation: 'updateTranscript',
//       textLength: event.result.text.length,
//       resultId: event.result.resultId,
//       speakerId: event.result.speakerId
//     }, 'Updated transcript history');
//   }

//   /**
//    * Handle stream errors with intelligent retry logic and proper error classification
//    */
//   private handleStreamError(
//     streamInstance: ASRStreamInstance,
//     subscription: ExtendedStreamType,
//     userSession: UserSession,
//     event: any
//   ): void {
//     const sessionLogger = userSession.logger.child({ service: SERVICE_NAME });

//     const errorCode = event.errorCode;
//     const errorDetails = event.errorDetails || '';
//     const isRetryable = this.isRetryableError(errorCode, errorDetails);
//     const maxRetries = this.getMaxRetries(errorCode, errorDetails);
//     const baseRetryDelay = this.getBaseRetryDelay(errorCode, errorDetails);

//     if (isRetryable && streamInstance.retryCount < maxRetries) {
//       streamInstance.retryCount++;

//       // Intelligent exponential backoff with adaptive jitter
//       const jitterPercent = this.getJitterPercent(errorCode, errorDetails);
//       const jitter = Math.random() * jitterPercent;
//       const backoffMultiplier = Math.pow(2, streamInstance.retryCount - 1);
//       const retryDelay = baseRetryDelay * backoffMultiplier * (1 + jitter);

//       sessionLogger.info({
//         subscription,
//         errorCode,
//         retryCount: streamInstance.retryCount,
//         maxRetries,
//         retryDelay: Math.round(retryDelay),
//         operation: 'scheduleRetry'
//       }, `🔄 Scheduling retry ${streamInstance.retryCount}/${maxRetries} in ${Math.round(retryDelay)}ms for error code ${errorCode}`);

//       // Schedule retry
//       setTimeout(() => {
//         try {
//           // Clean up existing recognizer before retry
//           if (streamInstance.recognizer) {
//             try {
//               streamInstance.recognizer.close();
//             } catch (closeError) {
//               sessionLogger.warn({ closeError }, 'Error closing recognizer during retry cleanup');
//             }
//           }

//           // Reset stream state for retry
//           streamInstance.isReady = false;
//           streamInstance.isInitializing = true;
//           streamInstance.audioChunksReceived = 0;
//           streamInstance.audioChunksWritten = 0;
//           streamInstance.sessionId = undefined;
//           streamInstance.readyTime = undefined;
//           streamInstance.startTime = Date.now();

//           // Create new stream instance
//           sessionLogger.info({
//             subscription,
//             retryCount: streamInstance.retryCount,
//             operation: 'retryCreateStream'
//           }, '🔄 Attempting to recreate Azure Speech stream');

//           const newStreamInstance = this.createASRStreamForSubscription(subscription, userSession);

//           // Update the existing instance in the map
//           userSession.transcriptionStreams!.set(subscription, newStreamInstance);

//         } catch (retryError) {
//           sessionLogger.error({
//             subscription,
//             retryError,
//             retryCount: streamInstance.retryCount,
//             operation: 'retryFailed'
//           }, '❌ Failed to recreate stream during retry');

//           // If we still have retries left, try again
//           if (streamInstance.retryCount < maxRetries) {
//             this.handleStreamError(streamInstance, subscription, userSession, event);
//           } else {
//             sessionLogger.error({
//               subscription,
//               errorCode,
//               retryCount: streamInstance.retryCount,
//               operation: 'retryExhausted'
//             }, `❌ All retries exhausted for subscription ${subscription} with error code ${errorCode}`);
//           }
//         }
//       }, retryDelay);

//     } else {
//       // Error is not retryable or retries exhausted
//       const reason = !isRetryable ? 'non-retryable error' : 'retries exhausted';

//       sessionLogger.error({
//         subscription,
//         errorCode,
//         retryCount: streamInstance.retryCount,
//         maxRetries,
//         isRetryable,
//         operation: 'giveUpRetry'
//       }, `❌ Giving up on subscription ${subscription}: ${reason} (error code ${errorCode})`);

//       // Clean up the failed stream
//       this.stopIndividualTranscriptionStream(streamInstance, subscription, userSession);
//       userSession.transcriptionStreams!.delete(subscription);
//     }
//   }

//   /**
//    * Determine if an error code should trigger a retry
//    */
//   private isRetryableError(errorCode: number, errorDetails?: string): boolean {
//     switch (errorCode) {
//       case 7:   // SPXERR_INVALID_OPERATION - CRITICAL: Stop infinite retry loops!
//         // This is almost always a race condition that won't resolve with retries
//         // Retrying Error Code 7 creates infinite loops and stream multiplication
//         return false; // 🚨 FIXED: No more infinite retry loops
      
//       case 4:   // Network/connection issues - special handling for rate limiting
//         // Rate limiting (4429) is retryable but with much longer delays
//         return true;
      
//       case 6:   // Timeout issues - limited retries
//         return true;
//       case 999: // Custom error code for start failures - limited retries
//         return true;

//       case 1:   // Authentication/authorization errors - don't retry
//       case 2:   // Invalid argument - don't retry
//       case 3:   // Handle not found - don't retry
//       case 5:   // Unexpected/invalid state - don't retry
//       default:
//         return false;
//     }
//   }

//   /**
//    * Get maximum retry attempts based on error type
//    */
//   private getMaxRetries(errorCode: number, errorDetails?: string): number {
//     return 10; // Default generous retry count.
//     // switch (errorCode) {
//     //   case 7:   // Race condition errors - NOT RETRYABLE (infinite loop prevention)
//     //     return 0; // This should never be called since Error Code 7 is not retryable
      
//     //   case 4:   // Network issues
//     //     if (errorDetails && errorDetails.includes('4429')) {
//     //       // Rate limiting - fewer retries with much longer delays
//     //       return 5;
//     //     }
//     //     // Other network issues - generous retries for transient issues
//     //     return 10;
      
//     //   case 6:   // Timeout issues - generous retries
//     //     return 10;
//     //   case 999: // Start failures - moderate retries
//     //     return 5;
//     //   default:
//     //     return 3; // More generous default
//     // }
//   }

//   /**
//    * Get base retry delay in milliseconds based on error type
//    */
//   private getBaseRetryDelay(errorCode: number, errorDetails?: string): number {
//     switch (errorCode) {
//       case 7:   // Race condition - less aggressive retry (increased from 1s to 2s)
//         return 2000; // 2 seconds base
      
//       case 4:   // Network issues
//         if (errorDetails && errorDetails.includes('4429')) {
//           // Rate limiting - much longer delays to let Azure recover
//           return 10000; // 10 seconds base (was 3s)
//         }
//         // Other network issues - longer delay
//         return 3000; // 3 seconds base
      
//       case 6:   // Timeout issues - longer delay
//         return 3000; // 3 seconds base
//       case 999: // Start failures - medium delay
//         return 2000; // 2 seconds base
//       default:
//         return 2000; // 2 seconds default
//     }
//   }

//   /**
//    * Get jitter percentage based on error type to spread retry timing
//    */
//   private getJitterPercent(errorCode: number, errorDetails?: string): number {
//     switch (errorCode) {
//       case 4:   // Network issues
//         if (errorDetails && errorDetails.includes('4429')) {
//           // Rate limiting - high jitter to spread requests across time
//           return 0.5; // 50% jitter
//         }
//         // Other network issues - moderate jitter
//         return 0.3; // 30% jitter
      
//       case 7:   // Race condition - moderate jitter
//         return 0.3; // 30% jitter
      
//       default:
//         return 0.3; // 30% default jitter
//     }
//   }

//   /**
//    * Get global connection statistics for monitoring
//    */
//   static getGlobalConnectionStats(): {
//     activeStreams: number;
//     maxStreams: number;
//     utilizationPercent: number;
//     nearLimit: boolean;
//   } {
//     const utilizationPercent = (TranscriptionService.globalActiveStreams / TranscriptionService.MAX_GLOBAL_STREAMS) * 100;
    
//     return {
//       activeStreams: TranscriptionService.globalActiveStreams,
//       maxStreams: TranscriptionService.MAX_GLOBAL_STREAMS,
//       utilizationPercent: Math.round(utilizationPercent * 10) / 10, // Round to 1 decimal
//       nearLimit: utilizationPercent > 80 // Warning if above 80%
//     };
//   }
// }

// export const transcriptionService = new TranscriptionService();
// export default transcriptionService;
