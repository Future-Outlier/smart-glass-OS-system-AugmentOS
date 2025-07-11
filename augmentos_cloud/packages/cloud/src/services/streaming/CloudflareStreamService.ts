import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from 'pino';

/**
 * Cloudflare Live Input response structure
 */
interface CloudflareLiveInput {
  uid: string;
  rtmps: {
    url: string;
    streamKey: string;
  };
  rtmpsPlayback?: {
    url: string;
    streamKey: string;
  };
  srt?: {
    url: string;
    streamId: string;
    passphrase: string;
  };
  srtPlayback?: {
    url: string;
    streamId: string;
    passphrase: string;
  };
  webRTC?: {
    url: string;
  };
  webRTCPlayback?: {
    url: string;
  };
  created: string;
  modified: string;
  meta: Record<string, any>;
  status: {
    current: {
      state: 'connected' | 'disconnected' | null;
      connectedAt?: string;
      disconnectedAt?: string;
    };
  };
  recording: {
    mode: 'automatic' | 'off';
    requireSignedURLs: boolean;
    allowedOrigins?: string[];
  };
  playback: {
    hls: string;
    dash: string;
  };
}

/**
 * Configuration options for creating a live input
 */
export interface CreateLiveInputConfig {
  quality?: '720p' | '1080p';
  enableWebRTC?: boolean;
  enableRecording?: boolean;
  requireSignedURLs?: boolean;
}

/**
 * Result of creating a live input
 */
export interface LiveInputResult {
  liveInputId: string;
  rtmpUrl: string;
  hlsUrl: string;
  dashUrl: string;
  webrtcUrl?: string;
}

/**
 * Live input status information
 */
export interface LiveInputStatus {
  isConnected: boolean;
  connectedAt?: Date;
  disconnectedAt?: Date;
  viewerCount?: number;
}

/**
 * Live input info for listing/monitoring
 */
export interface LiveInputInfo {
  id: string;
  userId: string;
  createdAt: Date;
  isConnected: boolean;
  quality?: string;
}

/**
 * Service for interacting with Cloudflare Stream Live API
 * Handles creation, deletion, and monitoring of live RTMP inputs
 */
export class CloudflareStreamService {
  private api!: AxiosInstance;
  private logger: Logger;
  private accountId!: string;
  private enabled: boolean = true;

  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'CloudflareStreamService' });
    
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!accountId || !apiToken) {
      this.logger.error('Cloudflare credentials not configured - managed streaming disabled');
      this.enabled = false;
      return;
    }
    
    this.accountId = accountId;
    
    this.api = axios.create({
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    // Add request interceptor for logging
    this.api.interceptors.request.use(
      config => {
        this.logger.debug({
          method: config.method,
          url: config.url,
          headers: config.headers,
          data: config.data ? JSON.stringify(config.data, null, 2) : 'empty',
          params: config.params
        }, '📤 Sending Cloudflare API request');
        return config;
      },
      error => {
        this.logger.error({ error }, '❌ Failed to prepare request');
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for logging
    this.api.interceptors.response.use(
      response => {
        this.logger.debug({
          method: response.config.method,
          url: response.config.url,
          status: response.status,
          responseData: JSON.stringify(response.data, null, 2),
          responseHeaders: response.headers
        }, '✅ Cloudflare API request successful');
        return response;
      },
      error => {
        this.logger.error({
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          error: error.response?.data,
          errorMessage: error.message,
          requestData: error.config?.data,
          responseHeaders: error.response?.headers,
          fullError: JSON.stringify(error, null, 2)
        }, '❌ Cloudflare API request failed');
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new live input for streaming
   * Cloudflare is input-agnostic, so it will accept any bitrate/resolution from Mentra Live glasses
   */
  async createLiveInput(userId: string, config: CreateLiveInputConfig = {}): Promise<LiveInputResult> {
    if (!this.enabled) {
      throw new Error('Managed streaming is not configured');
    }
    
    try {
      this.logger.debug({ userId, config }, '🚀 Starting Cloudflare live input creation');
      
      const response = await this.withRetry(async () => {
        // Cloudflare Stream API v2 uses empty body for basic stream creation
        // Metadata can be updated after creation if needed
        const requestBody = {};
        this.logger.debug({ requestBody }, '📤 Sending request to Cloudflare');
        return await this.api.post('/live_inputs', requestBody);
      });
      
      // Log the full response to understand structure
      this.logger.info({ 
        userId,
        responseStatus: response.status,
        responseHeaders: response.headers,
        responseData: JSON.stringify(response.data, null, 2),
        hasResult: !!response.data?.result,
        resultType: typeof response.data?.result,
        resultKeys: response.data?.result ? Object.keys(response.data.result) : []
      }, '📥 Cloudflare API response received');
      
      if (!response.data?.result) {
        this.logger.error({ 
          userId,
          responseData: response.data,
          dataKeys: Object.keys(response.data || {})
        }, '❌ No result in Cloudflare response');
        throw new Error('Invalid response from Cloudflare: missing result');
      }
      
      const liveInput: CloudflareLiveInput = response.data.result;
      
      // Log the liveInput structure
      this.logger.debug({
        userId,
        liveInput: JSON.stringify(liveInput, null, 2),
        hasRtmps: !!liveInput.rtmps,
        hasPlayback: !!liveInput.playback,
        hasWebRTC: !!liveInput.webRTC,
        liveInputKeys: Object.keys(liveInput)
      }, '🔍 Parsing live input data');
      
      // Check for required fields
      if (!liveInput.rtmps?.url || !liveInput.rtmps?.streamKey) {
        this.logger.error({
          userId,
          rtmps: liveInput.rtmps,
          rtmpsType: typeof liveInput.rtmps
        }, '❌ Missing RTMPS data');
        throw new Error('Invalid liveInput: missing RTMPS URL or stream key');
      }
      
      // Construct playback URLs based on Cloudflare's pattern
      // These URLs will become active once the stream goes live
      const hlsUrl = this.constructHlsUrl(liveInput.uid);
      const dashUrl = this.constructDashUrl(liveInput.uid);
      
      this.logger.info({
        userId,
        uid: liveInput.uid,
        constructedHls: hlsUrl,
        constructedDash: dashUrl,
        note: 'Playback URLs constructed - will be active once stream is live'
      }, '🎥 Constructed playback URLs for live stream');
      
      const result: LiveInputResult = {
        liveInputId: liveInput.uid,
        rtmpUrl: `${liveInput.rtmps.url}${liveInput.rtmps.streamKey}`,
        hlsUrl: hlsUrl,
        dashUrl: dashUrl,
        webrtcUrl: liveInput.webRTC?.url
      };
      
      this.logger.info({ 
        userId, 
        liveInputId: result.liveInputId,
        quality: config.quality,
        result: JSON.stringify(result, null, 2)
      }, '✅ Created Cloudflare live input successfully');
      
      return result;
    } catch (error) {
      this.logger.error({ 
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
          response: (error as any)?.response?.data,
          fullError: JSON.stringify(error, null, 2)
        },
        userId 
      }, '💥 Failed to create Cloudflare live input');
      throw this.wrapError(error, 'Failed to create live stream');
    }
  }

  /**
   * Delete a live input
   * Best effort - logs errors but doesn't throw
   */
  async deleteLiveInput(liveInputId: string): Promise<void> {
    try {
      await this.api.delete(`/live_inputs/${liveInputId}`);
      this.logger.info({ liveInputId }, 'Deleted Cloudflare live input');
    } catch (error) {
      // Log but don't throw - cleanup should be best effort
      this.logger.error({ error, liveInputId }, 'Failed to delete live input');
    }
  }

  /**
   * Get the current status of a live input
   */
  async getLiveInputStatus(liveInputId: string): Promise<LiveInputStatus> {
    if (!this.enabled) {
      return { isConnected: false };
    }
    
    try {
      const response = await this.api.get(`/live_inputs/${liveInputId}`);
      const liveInput: CloudflareLiveInput = response.data.result;
      
      return {
        isConnected: liveInput.status.current.state === 'connected',
        connectedAt: liveInput.status.current.connectedAt 
          ? new Date(liveInput.status.current.connectedAt)
          : undefined,
        disconnectedAt: liveInput.status.current.disconnectedAt
          ? new Date(liveInput.status.current.disconnectedAt)
          : undefined
      };
    } catch (error) {
      this.logger.error({ error, liveInputId }, 'Failed to get live input status');
      return { isConnected: false };
    }
  }

  /**
   * Update live input settings
   */
  async updateLiveInput(liveInputId: string, config: Partial<CreateLiveInputConfig>): Promise<void> {
    try {
      await this.api.put(`/live_inputs/${liveInputId}`, {
        recording: {
          mode: config.enableRecording ? 'automatic' : 'off',
          requireSignedURLs: config.requireSignedURLs || false
        }
      });
      
      this.logger.info({ liveInputId, config }, 'Updated live input configuration');
    } catch (error) {
      this.logger.error({ error, liveInputId }, 'Failed to update live input');
      throw this.wrapError(error, 'Failed to update stream configuration');
    }
  }

  /**
   * List all live inputs for monitoring/cleanup
   */
  async listLiveInputs(): Promise<LiveInputInfo[]> {
    try {
      const response = await this.api.get('/live_inputs', {
        params: {
          per_page: 100 // Max allowed by CF
        }
      });
      
      const liveInputs: CloudflareLiveInput[] = response.data.result;
      
      return liveInputs
        .filter(input => input.meta?.mentraOS === true)
        .map(input => ({
          id: input.uid,
          userId: input.meta.userId || 'unknown',
          createdAt: new Date(input.created),
          isConnected: input.status.current.state === 'connected',
          quality: input.meta.quality
        }));
    } catch (error) {
      this.logger.error({ error }, 'Failed to list live inputs');
      return [];
    }
  }

  /**
   * Clean up orphaned streams that are no longer active
   */
  async cleanupOrphanedStreams(activeStreamIds: Set<string>): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const allStreams = await this.listLiveInputs();
      
      for (const stream of allStreams) {
        if (!activeStreamIds.has(stream.id) && !stream.isConnected) {
          // Stream is not in our active set and not connected
          const ageHours = (Date.now() - stream.createdAt.getTime()) / (1000 * 60 * 60);
          
          if (ageHours > 1) { // Older than 1 hour
            await this.deleteLiveInput(stream.id);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        this.logger.info({ cleanedCount }, 'Cleaned up orphaned Cloudflare streams');
      }
    } catch (error) {
      this.logger.error({ error }, 'Error during stream cleanup');
    }
    
    return cleanedCount;
  }

  /**
   * Retry logic for transient failures
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        
        // Check if retryable
        if (error.response?.status === 429) { // Rate limited
          const retryAfter = parseInt(error.response.headers['retry-after'] || '1');
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else if (
          error.code === 'ECONNABORTED' || 
          error.code === 'ETIMEDOUT' ||
          error.response?.status >= 500
        ) {
          // Network or server errors - exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        } else {
          throw error; // Not retryable
        }
        
        this.logger.warn({ 
          attempt: i + 1, 
          retries, 
          error: error.message 
        }, 'Retrying Cloudflare API request');
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Wrap errors in a more user-friendly format
   */
  private wrapError(error: any, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.data) {
        const cfError = axiosError.response.data as any;
        return new Error(`${message}: ${cfError.errors?.[0]?.message || cfError.message || 'Unknown error'}`);
      }
    }
    return new Error(`${message}: ${error.message || 'Unknown error'}`);
  }

  /**
   * Test connection to Cloudflare API
   */
  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    
    try {
      await this.api.get('/live_inputs', { params: { per_page: 1 } });
      this.logger.info('Cloudflare Stream API connection successful');
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Cloudflare Stream API connection failed');
      return false;
    }
  }

  /**
   * Construct HLS URL based on Cloudflare's pattern
   */
  private constructHlsUrl(streamId: string): string {
    // Format: https://customer-{accountId}.cloudflarestream.com/{streamId}/manifest/video.m3u8
    return `https://customer-${this.accountId}.cloudflarestream.com/${streamId}/manifest/video.m3u8`;
  }

  /**
   * Construct DASH URL based on Cloudflare's pattern
   */
  private constructDashUrl(streamId: string): string {
    // Format: https://customer-{accountId}.cloudflarestream.com/{streamId}/manifest/video.mpd
    return `https://customer-${this.accountId}.cloudflarestream.com/${streamId}/manifest/video.mpd`;
  }

  /**
   * Wait for stream to go live by polling status
   * Returns true when stream is connected/live, false if timeout
   */
  async waitForStreamLive(
    liveInputId: string, 
    maxAttempts = 30, 
    delayMs = 2000
  ): Promise<boolean> {
    if (!this.enabled) {
      throw new Error('Managed streaming is not configured');
    }

    this.logger.debug({ liveInputId, maxAttempts, delayMs }, '⏳ Waiting for stream to go live');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.getLiveInputStatus(liveInputId);
        
        this.logger.debug({
          liveInputId,
          attempt: attempt + 1,
          isConnected: status.isConnected,
          connectedAt: status.connectedAt
        }, '🔍 Checking stream status');

        // Stream is live when isConnected is true
        if (status.isConnected) {
          this.logger.info({ 
            liveInputId, 
            attempts: attempt + 1,
            connectedAt: status.connectedAt
          }, '✅ Stream is now live!');
          return true;
        }

        // Wait before next check
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        this.logger.warn({ 
          liveInputId, 
          attempt: attempt + 1, 
          error 
        }, 'Error checking stream status, will retry');
        
        // Continue trying unless it's the last attempt
        if (attempt === maxAttempts - 1) {
          throw error;
        }
      }
    }

    this.logger.warn({ liveInputId, maxAttempts }, '⏱️ Timeout waiting for stream to go live');
    return false;
  }
}