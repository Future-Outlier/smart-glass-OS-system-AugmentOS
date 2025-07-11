/**
 * 📷 Camera Module Managed Streaming Extension
 *
 * Extends the camera module with managed streaming capabilities.
 * Apps can request managed streams and receive HLS/DASH URLs without managing RTMP endpoints.
 */

import {
  ManagedStreamRequest,
  ManagedStreamStopRequest,
  ManagedStreamStatus,
  AppToCloudMessageType,
  CloudToAppMessageType,
  StreamType,
  isManagedStreamStatus
} from '../../../types';
import { VideoConfig, AudioConfig, StreamConfig } from '../../../types/rtmp-stream';
import { Logger } from 'pino';

/**
 * Configuration options for a managed stream
 */
export interface ManagedStreamOptions {
  /** Stream quality preset */
  quality?: '720p' | '1080p';
  /** Enable WebRTC for ultra-low latency viewing */
  enableWebRTC?: boolean;
  /** Optional video configuration settings */
  video?: VideoConfig;
  /** Optional audio configuration settings */
  audio?: AudioConfig;
  /** Optional stream configuration settings */
  stream?: StreamConfig;
}

/**
 * Result returned when starting a managed stream
 */
export interface ManagedStreamResult {
  /** HLS URL for viewing the stream */
  hlsUrl: string;
  /** DASH URL for viewing the stream */
  dashUrl: string;
  /** WebRTC URL if enabled */
  webrtcUrl?: string;
  /** Internal stream ID */
  streamId: string;
}

/**
 * 📹 Managed Streaming Extension for Camera Module
 *
 * Provides managed streaming capabilities where the cloud handles
 * RTMP endpoints and returns HLS/DASH URLs for viewing.
 *
 * @example
 * ```typescript
 * // Start a managed stream
 * const urls = await session.camera.startManagedStream({
 *   quality: '720p',
 *   enableWebRTC: true
 * });
 * console.log('HLS URL:', urls.hlsUrl);
 * console.log('DASH URL:', urls.dashUrl);
 *
 * // Monitor managed stream status
 * session.camera.onManagedStreamStatus((status) => {
 *   console.log('Managed stream status:', status.status);
 * });
 *
 * // Stop managed stream
 * await session.camera.stopManagedStream();
 * ```
 */
export class CameraManagedExtension {
  private send: (message: any) => void;
  private packageName: string;
  private sessionId: string;
  private logger: Logger;
  private session?: any;

  // Managed streaming state
  private isManagedStreaming: boolean = false;
  private currentManagedStreamId?: string;
  private currentManagedStreamUrls?: ManagedStreamResult;
  private managedStreamStatus?: ManagedStreamStatus;
  
  // Promise tracking for managed stream initialization
  private pendingManagedStreamRequest?: {
    resolve: (value: ManagedStreamResult) => void;
    reject: (reason?: any) => void;
  };

  constructor(
    packageName: string,
    sessionId: string,
    send: (message: any) => void,
    logger: Logger,
    session?: any
  ) {
    this.packageName = packageName;
    this.sessionId = sessionId;
    this.send = send;
    this.logger = logger.child({ module: 'CameraManagedExtension' });
    this.session = session;
  }

  /**
   * 📹 Start a managed stream
   *
   * The cloud will handle the RTMP endpoint and return HLS/DASH URLs for viewing.
   * Multiple apps can consume the same managed stream simultaneously.
   *
   * @param options - Configuration options for the managed stream
   * @returns Promise that resolves with viewing URLs when the stream is ready
   *
   * @example
   * ```typescript
   * const urls = await session.camera.startManagedStream({
   *   quality: '1080p',
   *   enableWebRTC: true,
   *   video: { fps: 30 },
   *   audio: { sampleRate: 48000 }
   * });
   * ```
   */
  async startManagedStream(options: ManagedStreamOptions = {}): Promise<ManagedStreamResult> {
    this.logger.info({ options }, '📹 Managed stream request starting');

    if (this.isManagedStreaming) {
      this.logger.error({
        currentStreamId: this.currentManagedStreamId
      }, '📹 Already managed streaming error');
      throw new Error('Already streaming. Stop the current managed stream before starting a new one.');
    }

    // Create the request message
    const request: ManagedStreamRequest = {
      type: AppToCloudMessageType.MANAGED_STREAM_REQUEST,
      packageName: this.packageName,
      quality: options.quality,
      enableWebRTC: options.enableWebRTC,
      video: options.video,
      audio: options.audio,
      stream: options.stream
    };

    // Send the request
    this.send(request);
    this.isManagedStreaming = true;

    // Create promise to wait for URLs
    return new Promise((resolve, reject) => {
      this.pendingManagedStreamRequest = { resolve, reject };
      
      // Set a timeout
      setTimeout(() => {
        if (this.pendingManagedStreamRequest) {
          this.pendingManagedStreamRequest = undefined;
          this.isManagedStreaming = false;
          reject(new Error('Managed stream request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * 🛑 Stop the current managed stream
   *
   * This will stop streaming for this app only. If other apps are consuming
   * the same managed stream, it will continue for them.
   *
   * @returns Promise that resolves when the stop request is sent
   */
  async stopManagedStream(): Promise<void> {
    if (!this.isManagedStreaming) {
      this.logger.warn('📹 No managed stream to stop');
      return;
    }

    this.logger.info({ streamId: this.currentManagedStreamId }, '📹 Stopping managed stream');

    const request: ManagedStreamStopRequest = {
      type: AppToCloudMessageType.MANAGED_STREAM_STOP,
      packageName: this.packageName
    };

    this.send(request);
    
    // Clean up state
    this.isManagedStreaming = false;
    this.currentManagedStreamId = undefined;
    this.currentManagedStreamUrls = undefined;
    this.managedStreamStatus = undefined;
    this.pendingManagedStreamRequest = undefined;
  }

  /**
   * 📊 Check if currently managed streaming
   *
   * @returns true if a managed stream is active
   */
  isManagedStreamActive(): boolean {
    return this.isManagedStreaming;
  }

  /**
   * 🔗 Get current managed stream URLs
   *
   * @returns Current stream URLs or undefined if not streaming
   */
  getManagedStreamUrls(): ManagedStreamResult | undefined {
    return this.currentManagedStreamUrls;
  }

  /**
   * 📊 Get current managed stream status
   *
   * @returns Current stream status or undefined
   */
  getManagedStreamStatus(): ManagedStreamStatus | undefined {
    return this.managedStreamStatus;
  }

  /**
   * 🔔 Register a handler for managed stream status updates
   *
   * @param handler - Function to call when stream status changes
   * @returns Cleanup function to unregister the handler
   *
   * @example
   * ```typescript
   * const cleanup = session.camera.onManagedStreamStatus((status) => {
   *   console.log('Status:', status.status);
   *   if (status.status === 'active') {
   *     console.log('Stream is live!');
   *   }
   * });
   *
   * // Later, unregister the handler
   * cleanup();
   * ```
   */
  onManagedStreamStatus(handler: (status: ManagedStreamStatus) => void): () => void {
    if (!this.session) {
      this.logger.error('Cannot listen for managed status updates: session reference not available');
      return () => {};
    }

   this.session.subscribe(StreamType.MANAGED_STREAM_STATUS);
    
    // Register the handler using the session's event system
    return this.session.on(StreamType.MANAGED_STREAM_STATUS, handler);
  }

  /**
   * Handle incoming managed stream status messages
   * Called by the parent AppSession when messages are received
   */
  handleManagedStreamStatus(status: ManagedStreamStatus): void {
    this.logger.info({ 
      status: status.status,
      streamId: status.streamId 
    }, '📹 Received managed stream status');

    this.managedStreamStatus = status;

    // Handle initial stream ready status
    if (status.status === 'active' && this.pendingManagedStreamRequest && status.hlsUrl && status.dashUrl) {
      const result: ManagedStreamResult = {
        hlsUrl: status.hlsUrl,
        dashUrl: status.dashUrl,
        webrtcUrl: status.webrtcUrl,
        streamId: status.streamId || ''
      };

      this.currentManagedStreamId = status.streamId;
      this.currentManagedStreamUrls = result;

      // Resolve the pending promise
      this.pendingManagedStreamRequest.resolve(result);
      this.pendingManagedStreamRequest = undefined;
    }

    // Handle error status
    if ((status.status === 'error' || status.status === 'stopped') && this.pendingManagedStreamRequest) {
      this.pendingManagedStreamRequest.reject(new Error(status.message || 'Managed stream failed'));
      this.pendingManagedStreamRequest = undefined;
      this.isManagedStreaming = false;
    }

    // Clean up on stopped status
    if (status.status === 'stopped') {
      this.isManagedStreaming = false;
      this.currentManagedStreamId = undefined;
      this.currentManagedStreamUrls = undefined;
    }

    // Notify handlers (would use event emitter in real implementation)
    // this.emit('managedStreamStatus', status);
  }

  /**
   * 🧹 Clean up all managed streaming state
   */
  cleanup(): void {
    if (this.pendingManagedStreamRequest) {
      this.pendingManagedStreamRequest.reject(new Error('Camera module cleanup'));
      this.pendingManagedStreamRequest = undefined;
    }

    this.isManagedStreaming = false;
    this.currentManagedStreamId = undefined;
    this.currentManagedStreamUrls = undefined;
    this.managedStreamStatus = undefined;

    this.logger.info('📹 Managed streaming extension cleaned up');
  }
}