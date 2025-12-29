/**
 * 🚀 App Server Module
 *
 * Creates and manages a server for Apps in the MentraOS ecosystem.
 * Handles webhook endpoints, session management, and cleanup.
 *
 * Now built on Hono + Bun for better performance and developer experience.
 */
import fs from "fs";
import path from "path";

import axios from "axios";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { serveStatic } from "hono/bun";
import { Logger } from "pino";

import { newSDKUpdate } from "../../constants/log-messages/updates";
import { logger as rootLogger } from "../../logging/logger";
import {
  WebhookRequest,
  WebhookResponse,
  SessionWebhookRequest,
  StopWebhookRequest,
  ToolCall,
  WebhookRequestType,
  AuthVariables,
} from "../../types";
import { AppSession } from "../session/index";
import { createAuthMiddleware } from "../webview";

export const GIVE_APP_CONTROL_OF_TOOL_RESPONSE: string = "GIVE_APP_CONTROL_OF_TOOL_RESPONSE";

/**
 * 🔧 Configuration options for App Server
 *
 * @example
 * ```typescript
 * const config: AppServerConfig = {
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key',
 *   port: 7010,
 *   publicDir: './public'
 * };
 * ```
 */
export interface AppServerConfig {
  /** 📦 Unique identifier for your App (e.g., 'org.company.appname') must match what you specified at https://console.mentra.glass */
  packageName: string;
  /** 🔑 API key for authentication with MentraOS Cloud */
  apiKey: string;
  /** 🌐 Port number for the server (default: 7010) */
  port?: number;

  /** Cloud API URL (default: 'api.mentra.glass') */
  cloudApiUrl?: string;

  /** 🛣️ [DEPRECATED] do not set: The SDK will automatically expose an endpoint at '/webhook' */
  webhookPath?: string;
  /**
   * 📂 Directory for serving static files (e.g., images, logos)
   * Set to false to disable static file serving
   */
  publicDir?: string | false;

  /** ❤️ Enable health check endpoint at /health (default: true) */
  healthCheck?: boolean;
  /**
   * 🔐 Secret key used to sign session cookies
   * This must be a strong, unique secret
   */
  cookieSecret?: string;
  /** App instructions string shown to the user */
  appInstructions?: string;
}

// Type for Hono app with auth variables
type AppHono = Hono<{ Variables: AuthVariables }>;

/**
 * 🎯 App Server Implementation
 *
 * Base class for creating App servers, now extending Hono for a modern API.
 * Handles:
 * - 🔄 Session lifecycle management
 * - 📡 Webhook endpoints for MentraOS Cloud
 * - 📂 Static file serving
 * - ❤️ Health checks
 * - 🧹 Cleanup on shutdown
 *
 * @example
 * ```typescript
 * class MyAppServer extends AppServer {
 *   constructor(config: AppServerConfig) {
 *     super(config)
 *
 *     // Add custom API routes (Hono syntax)
 *     this.get("/api/custom", (c) => c.json({ message: "Hello!" }))
 *   }
 *
 *   protected async onSession(session: AppSession, sessionId: string, userId: string) {
 *     // Handle new user sessions here
 *     session.events.onTranscription((data) => {
 *       session.layouts.showTextWall(data.text);
 *     });
 *   }
 * }
 *
 * const server = new MyAppServer({
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key',
 * });
 *
 * await server.start();
 * ```
 */
export class AppServer extends Hono<{ Variables: AuthVariables }> {
  /** Server configuration */
  protected config: AppServerConfig;
  /** Map of active user sessions by sessionId */
  private activeSessions = new Map<string, AppSession>();
  /** Map of active user sessions by userId */
  private activeSessionsByUserId = new Map<string, AppSession>();
  /** Array of cleanup handlers to run on shutdown */
  private cleanupHandlers: Array<() => void> = [];
  /** App instructions string shown to the user */
  private appInstructions: string | null = null;

  public readonly logger: Logger;

  constructor(config: AppServerConfig) {
    super(); // Initialize Hono

    // Set defaults and merge with provided config
    this.config = {
      port: 7010,
      webhookPath: "/webhook",
      publicDir: false,
      healthCheck: true,
      ...config,
    };

    this.logger = rootLogger.child({
      app: this.config.packageName,
      packageName: this.config.packageName,
      service: "app-server",
    });

    // Apply authentication middleware
    this.use(
      "*",
      createAuthMiddleware({
        apiKey: this.config.apiKey,
        packageName: this.config.packageName,
        getAppSessionForUser: (userId: string) => {
          return this.activeSessionsByUserId.get(userId) || null;
        },
        cookieSecret:
          this.config.cookieSecret || `AOS_${this.config.packageName}_${this.config.apiKey.substring(0, 8)}`,
      }),
    );

    this.appInstructions = (config as any).appInstructions || null;

    // Setup server features
    this.setupWebhook();
    this.setupSettingsEndpoint();
    this.setupHealthCheck();
    this.setupToolCallEndpoint();
    this.setupPhotoUploadEndpoint();
    this.setupMentraAuthRedirect();
    this.setupPublicDir();
    this.setupShutdown();
  }

  /**
   * @deprecated Use `this.get()`, `this.post()`, etc. directly since AppServer now extends Hono
   * This method is kept for backward compatibility during migration.
   */
  public getExpressApp(): AppHono {
    console.warn(
      "⚠️ DEPRECATION: getExpressApp() is deprecated. AppServer now extends Hono - use this.get(), this.post(), etc. directly.",
    );
    return this as AppHono;
  }

  /**
   * Get the Hono app instance (returns this since AppServer extends Hono)
   */
  public getHonoApp(): AppHono {
    return this as AppHono;
  }

  /**
   * 👥 Session Handler
   * Override this method to handle new App sessions.
   * This is where you implement your app's core functionality.
   *
   * @param session - App session instance for the user
   * @param sessionId - Unique identifier for this session
   * @param userId - User's identifier
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.logger.info(`🚀 Starting new session handling for session ${sessionId} and user ${userId}`);
    // Core session handling logic (onboarding removed)
    this.logger.info(`✅ Session handling completed for session ${sessionId} and user ${userId}`);
  }

  /**
   * 👥 Stop Handler
   * Override this method to handle stop requests.
   * This is where you can clean up resources when a session is stopped.
   *
   * @param sessionId - Unique identifier for this session
   * @param userId - User's identifier
   * @param reason - Reason for stopping
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.logger.debug(`Session ${sessionId} stopped for user ${userId}. Reason: ${reason}`);

    // Default implementation: close the session if it exists
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.disconnect();
      this.activeSessions.delete(sessionId);
      this.activeSessionsByUserId.delete(userId);
    }
  }

  /**
   * 🛠️ Tool Call Handler
   * Override this method to handle tool calls from MentraOS Cloud.
   * This is where you implement your app's tool functionality.
   *
   * @param toolCall - The tool call request containing tool details and parameters
   * @returns Optional string response that will be sent back to MentraOS Cloud
   */
  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    this.logger.debug(`Tool call received: ${toolCall.toolId}`);
    this.logger.debug(`Parameters: ${JSON.stringify(toolCall.toolParameters)}`);
    return undefined;
  }

  /**
   * 🚀 Initialize the App
   * Sets up logging and checks SDK version.
   * After calling this, use Bun.serve() with app.fetch to start the server.
   *
   * @example
   * ```typescript
   * const app = new MyAppServer({ ... })
   * await app.start()
   *
   * Bun.serve({
   *   port: 3333,
   *   routes: { "/*": indexHtml },
   *   fetch: app.fetch,
   * })
   * ```
   *
   * @returns Promise that resolves when initialization is complete
   */
  public async start(): Promise<void> {
    this.logger.info(`🎯 App initialized: ${this.config.packageName}`);
    this.logger.info(`   Use Bun.serve({ fetch: app.fetch }) to start the server`);

    if (this.config.publicDir) {
      this.logger.info(`📂 Static files configured from ${this.config.publicDir}`);
    }

    // 🔑 Grab SDK version
    await this.checkSDKVersion();
  }

  /**
   * Check and log SDK version
   */
  private async checkSDKVersion(): Promise<void> {
    try {
      // Look for the actual installed @mentra/sdk package.json in node_modules
      const sdkPkgPath = path.resolve(process.cwd(), "node_modules/@mentra/sdk/package.json");

      let currentVersion = "unknown";

      if (fs.existsSync(sdkPkgPath)) {
        const sdkPkg = JSON.parse(fs.readFileSync(sdkPkgPath, "utf-8"));
        currentVersion = sdkPkg.version || "not-found";
      } else {
        this.logger.debug({ sdkPkgPath }, "No @mentra/sdk package.json found at path");
      }

      // Fetch latest SDK version from the API endpoint
      let latest: string | null = null;
      try {
        const cloudHost = "api.mentra.glass";
        const response = await axios.get(`https://${cloudHost}/api/sdk/version`, { timeout: 3000 });
        if (response.data && response.data.success && response.data.data) {
          latest = response.data.data.latest;
        }
      } catch {
        this.logger.debug("Failed to fetch latest SDK version - skipping version check (offline or API unavailable)");
      }

      if (currentVersion === "not-found") {
        this.logger.warn(
          `⚠️ @mentra/sdk not found in your project dependencies. Please install it with: npm install @mentra/sdk`,
        );
      } else if (latest && latest !== currentVersion) {
        this.logger.warn(newSDKUpdate(latest));
      }
    } catch (err) {
      this.logger.error(err, "Version check failed");
    }
  }

  /**
   * 🛑 Stop the Server
   * Gracefully shuts down the server and cleans up all sessions.
   */
  public async stop(): Promise<void> {
    this.logger.info("\n🛑 Shutting down...");
    await this.cleanup();
  }

  /**
   * 🔐 Generate a App token for a user
   * This should be called when handling a session webhook request.
   *
   * @param userId - User identifier
   * @param sessionId - Session identifier
   * @param secretKey - Secret key for signing the token
   * @returns JWT token string
   */
  protected generateToken(userId: string, sessionId: string, secretKey: string): string {
    const { createToken } = require("../token/utils");
    return createToken(
      {
        userId,
        packageName: this.config.packageName,
        sessionId,
      },
      { secretKey },
    );
  }

  /**
   * 🧹 Add Cleanup Handler
   * Register a function to be called during server shutdown.
   *
   * @param handler - Function to call during cleanup
   */
  protected addCleanupHandler(handler: () => void): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * 🎯 Setup Webhook Endpoint
   * Creates the webhook endpoint that MentraOS Cloud calls to start new sessions.
   */
  private setupWebhook(): void {
    const webhookPath = this.config.webhookPath || "/webhook";

    this.post(webhookPath, async (c) => {
      try {
        const webhookRequest = (await c.req.json()) as WebhookRequest;

        // Handle session request
        if (webhookRequest.type === WebhookRequestType.SESSION_REQUEST) {
          return this.handleSessionRequest(webhookRequest as SessionWebhookRequest, c);
        }
        // Handle stop request
        else if (webhookRequest.type === WebhookRequestType.STOP_REQUEST) {
          return this.handleStopRequest(webhookRequest as StopWebhookRequest, c);
        }
        // Unknown webhook type
        else {
          this.logger.error("❌ Unknown webhook request type");
          return c.json(
            {
              status: "error",
              message: "Unknown webhook request type",
            } as WebhookResponse,
            400,
          );
        }
      } catch (error) {
        this.logger.error(error, "❌ Error handling webhook: " + (error as Error).message);
        return c.json(
          {
            status: "error",
            message: "Error handling webhook: " + (error as Error).message,
          } as WebhookResponse,
          500,
        );
      }
    });
  }

  /**
   * 🛠️ Setup Tool Call Endpoint
   * Creates a /tool endpoint for handling tool calls from MentraOS Cloud.
   */
  private setupToolCallEndpoint(): void {
    this.post("/tool", async (c) => {
      try {
        const toolCall = (await c.req.json()) as ToolCall;
        if (this.activeSessionsByUserId.has(toolCall.userId)) {
          toolCall.activeSession = this.activeSessionsByUserId.get(toolCall.userId) || null;
        } else {
          toolCall.activeSession = null;
        }
        this.logger.info({ body: toolCall }, `🔧 Received tool call: ${toolCall.toolId}`);

        // Call the onToolCall handler and get the response
        const response = await this.onToolCall(toolCall);

        // Send back the response if one was provided
        if (response !== undefined) {
          return c.json({ status: "success", reply: response });
        } else {
          return c.json({ status: "success", reply: null });
        }
      } catch (error) {
        this.logger.error(error, "❌ Error handling tool call:");
        return c.json(
          {
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error occurred calling tool",
          },
          500,
        );
      }
    });

    this.get("/tool", async (c) => {
      return c.json({ status: "success", reply: "Hello, world!" });
    });
  }

  /**
   * Handle a session request webhook
   */
  private async handleSessionRequest(
    request: SessionWebhookRequest,
    c: Context<{ Variables: AuthVariables }>,
  ): Promise<Response> {
    const { sessionId, userId, mentraOSWebsocketUrl, augmentOSWebsocketUrl } = request;
    this.logger.info({ userId }, `🗣️ Received session request for user ${userId}, session ${sessionId}\n\n`);

    // Create new App session
    const session = new AppSession({
      packageName: this.config.packageName,
      apiKey: this.config.apiKey,
      mentraOSWebsocketUrl: mentraOSWebsocketUrl || augmentOSWebsocketUrl,
      appServer: this,
      userId,
    });

    // Setup session event handlers
    const cleanupDisconnect = session.events.onDisconnected((info) => {
      if (typeof info === "string") {
        this.logger.info(`👋 Session ${sessionId} disconnected: ${info}`);
      } else {
        this.logger.info(
          `👋 Session ${sessionId} disconnected: ${info.message} (code: ${info.code}, reason: ${info.reason})`,
        );

        if (info.sessionEnded === true) {
          this.logger.info(`🛑 User session ended for session ${sessionId}, calling onStop`);
          this.onStop(sessionId, userId, "User session ended").catch((error) => {
            this.logger.error(error, `❌ Error in onStop handler for session end:`);
          });
        } else if (info.permanent === true) {
          this.logger.info(`🛑 Permanent disconnection detected for session ${sessionId}, calling onStop`);
          this.onStop(sessionId, userId, `Connection permanently lost: ${info.reason}`).catch((error) => {
            this.logger.error(error, `❌ Error in onStop handler for permanent disconnection:`);
          });
        }
      }

      this.activeSessions.delete(sessionId);
      this.activeSessionsByUserId.delete(userId);
    });

    const cleanupError = session.events.onError((error) => {
      this.logger.error(error, `❌ [Session ${sessionId}] Error:`);
    });

    // Start the session
    try {
      await session.connect(sessionId);
      this.activeSessions.set(sessionId, session);
      this.activeSessionsByUserId.set(userId, session);
      await this.onSession(session, sessionId, userId);
      return c.json({ status: "success" } as WebhookResponse);
    } catch (error) {
      this.logger.error(error, "❌ Failed to connect:");
      cleanupDisconnect();
      cleanupError();
      return c.json(
        {
          status: "error",
          message: "Failed to connect",
        } as WebhookResponse,
        500,
      );
    }
  }

  /**
   * Handle a stop request webhook
   */
  private async handleStopRequest(
    request: StopWebhookRequest,
    c: Context<{ Variables: AuthVariables }>,
  ): Promise<Response> {
    const { sessionId, userId, reason } = request;
    this.logger.info(`\n\n🛑 Received stop request for user ${userId}, session ${sessionId}, reason: ${reason}\n\n`);

    try {
      await this.onStop(sessionId, userId, reason);
      return c.json({ status: "success" } as WebhookResponse);
    } catch (error) {
      this.logger.error(error, "❌ Error handling stop request:");
      return c.json(
        {
          status: "error",
          message: "Failed to process stop request",
        } as WebhookResponse,
        500,
      );
    }
  }

  /**
   * ❤️ Setup Health Check Endpoint
   * Creates a /health endpoint for monitoring server status.
   */
  private setupHealthCheck(): void {
    if (this.config.healthCheck) {
      this.get("/health", (c) => {
        return c.json({
          status: "healthy",
          app: this.config.packageName,
          activeSessions: this.activeSessions.size,
        });
      });
    }
  }

  /**
   * ⚙️ Setup Settings Endpoint
   * Creates a /settings endpoint that the MentraOS Cloud can use to update settings.
   */
  private setupSettingsEndpoint(): void {
    this.post("/settings", async (c) => {
      try {
        const { userIdForSettings, settings } = await c.req.json();

        if (!userIdForSettings || !Array.isArray(settings)) {
          return c.json(
            {
              status: "error",
              message: "Missing userId or settings array in request body",
            },
            400,
          );
        }

        this.logger.info(`⚙️ Received settings update for user ${userIdForSettings}`);

        // Find all active sessions for this user
        const userSessions: AppSession[] = [];

        this.activeSessions.forEach((session, _sessionId) => {
          if (session.userId === userIdForSettings) {
            userSessions.push(session);
          }
        });

        if (userSessions.length === 0) {
          this.logger.warn(`⚠️ No active sessions found for user ${userIdForSettings}`);
        } else {
          this.logger.info(`🔄 Updating settings for ${userSessions.length} active sessions`);
        }

        // Update settings for all of the user's sessions
        for (const session of userSessions) {
          session.updateSettingsForTesting(settings);
        }

        // Allow subclasses to handle settings updates if they implement the method
        if (typeof (this as any).onSettingsUpdate === "function") {
          await (this as any).onSettingsUpdate(userIdForSettings, settings);
        }

        return c.json({
          status: "success",
          message: "Settings updated successfully",
          sessionsUpdated: userSessions.length,
        });
      } catch (error) {
        this.logger.error(error, "❌ Error handling settings update:");
        return c.json(
          {
            status: "error",
            message: "Internal server error processing settings update",
          },
          500,
        );
      }
    });
  }

  /**
   * 📂 Setup Static File Serving
   * Configures Hono to serve static files from the specified directory.
   */
  private setupPublicDir(): void {
    if (this.config.publicDir) {
      const publicPath = path.resolve(this.config.publicDir);
      this.use("/*", serveStatic({ root: publicPath }));
      this.logger.info(`📂 Serving static files from ${publicPath}`);
    }
  }

  /**
   * 🛑 Setup Shutdown Handlers
   * Registers process signal handlers for graceful shutdown.
   */
  private setupShutdown(): void {
    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());
  }

  /**
   * 🧹 Cleanup
   * Closes all active sessions and runs cleanup handlers.
   * Releases ownership before disconnecting to enable clean handoffs (no resurrection).
   */
  private async cleanup(): Promise<void> {
    // Close all active sessions with ownership release for clean handoff
    for (const [sessionId, session] of this.activeSessions) {
      this.logger.info(`👋 Closing session ${sessionId} with ownership release`);
      try {
        await session.disconnect({
          releaseOwnership: true,
          reason: "clean_shutdown",
        });
      } catch (error) {
        this.logger.error(error, `Error during cleanup of session ${sessionId}`);
        try {
          await session.disconnect();
        } catch {
          // Ignore secondary errors
        }
      }
    }
    this.activeSessions.clear();
    this.activeSessionsByUserId.clear();

    // Run cleanup handlers
    this.cleanupHandlers.forEach((handler) => handler());
  }

  /**
   * 🎯 Setup Photo Upload Endpoint
   * Creates a /photo-upload endpoint for receiving photos directly from ASG glasses
   */
  private setupPhotoUploadEndpoint(): void {
    this.post("/photo-upload", async (c) => {
      try {
        // Parse multipart form data
        const body = await c.req.parseBody();
        const requestId = body.requestId as string;
        const type = body.type as string;
        const successStr = String(body.success);
        const success = successStr === "true";
        const errorCode = body.errorCode as string;
        const errorMessage = body.errorMessage as string;
        const photoFile = body.photo as File | undefined;

        console.log("Received photo response:", { requestId, type, success, errorCode });

        this.logger.info(
          { requestId, type, success, errorCode },
          `📸 Received photo response: ${requestId} (type: ${type})`,
        );

        if (!requestId) {
          this.logger.error("No requestId in photo response");
          return c.json({ success: false, error: "No requestId provided" }, 400);
        }

        // Find the corresponding session that made this photo request
        const session = this.findSessionByPhotoRequestId(requestId);
        if (!session) {
          this.logger.warn({ requestId }, "No active session found for photo request");
          return c.json({ success: false, error: "No active session found for this photo request" }, 404);
        }

        // Handle error response (no photo file, but has error info)
        if (type === "photo_error" || success === false) {
          const errorResponse = {
            requestId,
            success: false as const,
            error: {
              code: errorCode || "UNKNOWN_ERROR",
              message: errorMessage || "Unknown error occurred",
            },
          };

          session.camera.handlePhotoError(errorResponse);

          return c.json({
            success: true,
            requestId,
            message: "Photo error received successfully",
          });
        }

        // Handle successful photo upload
        if (!photoFile) {
          this.logger.error({ requestId }, "No photo file in successful upload");
          return c.json({ success: false, error: "No photo file provided for successful upload" }, 400);
        }

        // Read file buffer
        const buffer = Buffer.from(await photoFile.arrayBuffer());

        // Create photo data object
        const photoData = {
          buffer,
          mimeType: photoFile.type,
          filename: photoFile.name || "photo.jpg",
          requestId,
          size: photoFile.size,
          timestamp: new Date(),
        };

        // Deliver photo to the session
        session.camera.handlePhotoReceived(photoData);

        return c.json({
          success: true,
          requestId,
          message: "Photo received successfully",
        });
      } catch (error) {
        this.logger.error(error, "❌ Error handling photo response");
        return c.json({ success: false, error: "Internal server error processing photo response" }, 500);
      }
    });
  }

  /**
   * 🔐 Setup Mentra Auth Redirect Endpoint
   * Creates a /mentra-auth endpoint that redirects to the MentraOS OAuth flow.
   */
  private setupMentraAuthRedirect(): void {
    this.get("/mentra-auth", (c) => {
      const authUrl = `https://account.mentra.glass/auth?packagename=${encodeURIComponent(this.config.packageName)}`;
      this.logger.info(`🔐 Redirecting to MentraOS OAuth flow: ${authUrl}`);
      return c.redirect(authUrl, 302);
    });
  }

  /**
   * Find session that has a pending photo request for the given requestId
   */
  private findSessionByPhotoRequestId(requestId: string): AppSession | undefined {
    for (const [_sessionId, session] of this.activeSessions) {
      if (session.camera.hasPhotoPendingRequest(requestId)) {
        return session;
      }
    }
    return undefined;
  }
}

/**
 * @deprecated Use `AppServerConfig` instead. `TpaServerConfig` is deprecated and will be removed in a future version.
 * This is an alias for backward compatibility only.
 */
export type TpaServerConfig = AppServerConfig;

/**
 * @deprecated Use `AppServer` instead. `TpaServer` is deprecated and will be removed in a future version.
 * This is an alias for backward compatibility only.
 */
export class TpaServer extends AppServer {
  constructor(config: TpaServerConfig) {
    super(config);
    console.warn(
      "⚠️  DEPRECATION WARNING: TpaServer is deprecated and will be removed in a future version. " +
        "Please use AppServer instead. " +
        'Simply replace "TpaServer" with "AppServer" in your code.',
    );
  }
}
