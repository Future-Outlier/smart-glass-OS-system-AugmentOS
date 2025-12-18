/**
 * @fileoverview AugmentOS Cloud Server entry point.
 * Initializes core services and sets up HTTP/WebSocket servers.
 */

import { Server } from "http";
import path from "path";

import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
dotenv.config();

import { registerApi } from "./api";
import { CORS_ORIGINS } from "./config/cors";
import * as mongoConnection from "./connections/mongodb.connection";
import * as AppUptimeService from "./services/core/app-uptime.service";
import { DebugService } from "./services/debug/debug-service";
import { memoryTelemetryService } from "./services/debug/MemoryTelemetryService";
import { logger as rootLogger } from "./services/logging/pino-logger";
import UserSession from "./services/session/UserSession";
import { websocketService } from "./services/websocket/websocket.service";

const logger = rootLogger.child({ service: "index" });

// Initialize MongoDB connection
mongoConnection
  .init()
  .then(() => {
    logger.info("MongoDB connection initialized successfully");

    // Log admin emails from environment for debugging
    const adminEmails = process.env.ADMIN_EMAILS || "";
    logger.info("ENVIRONMENT VARIABLES CHECK:");
    logger.info(`- NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
    logger.info(`- ADMIN_EMAILS: "${adminEmails}"`);

    // Log additional environment details
    logger.info(`- Current working directory: ${process.cwd()}`);

    if (adminEmails) {
      const emails = adminEmails.split(",").map((e) => e.trim());
      logger.info(`Admin access configured for ${emails.length} email(s): [${emails.join(", ")}]`);
    } else {
      logger.warn("No ADMIN_EMAILS environment variable found. Admin panel will be inaccessible.");

      // For development, log a helpful message
      if (process.env.NODE_ENV === "development") {
        logger.info("Development mode: set ADMIN_EMAILS environment variable to enable admin access");
      }
    }
  })
  .catch((error) => {
    logger.error("MongoDB connection failed:", error);
  });

// Initialize Express and HTTP server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const app = express();
const server = new Server(app);

// Initialize services in the correct order
const debugService = new DebugService(server);

// Export services for use in other modules
export { debugService, websocketService };

// Middleware setup
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: CORS_ORIGINS,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Add pino-http middleware for request logging
app.use(
  pinoHttp({
    logger: rootLogger,
    genReqId: (req) => {
      // Generate correlation ID for each request
      return `${req.method}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) return "warn";
      if (res.statusCode >= 500 || err) return "error";
      return "info";
    },
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
    customErrorMessage: (req, res, err) => {
      return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
    },
    // Reduce verbosity in development by excluding request/response details
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        // Only include basic info, skip headers/body/params for cleaner logs
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        // Skip verbose response headers
      }),
    },
    // Don't log noisy or frequent requests
    autoLogging: {
      ignore: (req) => {
        // Skip health checks, livekit token requests, and other noisy endpoints
        return req.url === "/health" || req.url === "/api/livekit/token" || req.url?.startsWith("/api/livekit/token");
      },
    },
  }),
);

// Routes
registerApi(app);

// app.use('/api/app-communication', appCommunicationRoutes);
// app.use('/api/tpa-communication', appCommunicationRoutes); // TODO: Remove this once the old apps are fully updated in the wild (the old mobile clients will hit the old urls)

// Health check endpoint
app.get("/health", (req, res) => {
  try {
    const activeSessions = UserSession.getAllSessions();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      sessions: {
        activeCount: activeSessions.length,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "error",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "./public")));

// Serve uploaded photos
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Initialize WebSocket service
// Initialize WebSocket servers
websocketService.setupWebSocketServers(server);

// Start memory telemetry
memoryTelemetryService.start();

if (process.env.UPTIME_SERVICE_RUNNING === "true") {
  AppUptimeService.startUptimeScheduler(); // start app uptime service scheduler
}

// Start the server
try {
  server.listen(PORT, () => {
    logger.info(`\n
        ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
        ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
        ☁️☁️☁️      😎 MentraOS Cloud Server 🚀
        ☁️☁️☁️      🌐 Listening on port ${PORT} 🌐
        ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
        ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️\n`);
  });
} catch (error) {
  logger.error(error, "Failed to start server:");
}

export default server;
