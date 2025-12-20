/**
 * @fileoverview AugmentOS Cloud Server entry point (Hono + Bun native).
 * Initializes core services and sets up HTTP/WebSocket servers using Bun.serve().
 *
 * This is the new entry point using Hono for native Bun HTTP handling.
 * Includes optional Express fallback for truly legacy routes not yet migrated.
 */

import dotenv from "dotenv";
dotenv.config();

import * as mongoConnection from "./connections/mongodb.connection";
import * as AppUptimeService from "./services/core/app-uptime.service";
import { memoryTelemetryService } from "./services/debug/MemoryTelemetryService";
import { logger as rootLogger } from "./services/logging/pino-logger";
import { handleUpgrade, websocketHandlers } from "./services/websocket/bun-websocket";

// Hono app with all routes
import honoApp from "./hono-app";

// Optional: Legacy Express handler for routes not yet migrated
// Uncomment the import below if you need Express fallback
// import { createLegacyExpressHandler } from "./legacy-express";

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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;

// Optional: Create legacy Express handler for routes not yet migrated
// Uncomment if you need Express fallback for specific routes
// const legacyExpressHandler = createLegacyExpressHandler();

// Routes that should fall back to Express (if enabled)
// These are routes that haven't been migrated to Hono yet
const LEGACY_EXPRESS_PATHS = [
  "/appsettings",
  "/tpasettings",
  "/api/dev",
  "/api/admin",
  "/api/orgs",
  "/api/photos",
  "/api/gallery",
  "/api/tools",
  "/api/permissions",
  "/api/hardware",
  "/api/user-data",
  "/api/account",
  "/api/onboarding",
  "/api/app-uptime",
  "/api/streams",
];

/**
 * Check if a path should fall back to Express
 */
function shouldUseLegacyExpress(pathname: string): boolean {
  return LEGACY_EXPRESS_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// Start Bun.serve() with native WebSocket support
const server = Bun.serve({
  port: PORT,

  // Native Bun WebSocket handlers
  websocket: websocketHandlers,

  // HTTP request handler
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade requests
    if (url.pathname === "/glasses-ws" || url.pathname === "/app-ws") {
      const upgradeResult = handleUpgrade(req, server);
      if (upgradeResult === undefined) {
        // Upgrade successful
        return undefined as any;
      }
      // Return error response
      return upgradeResult;
    }

    // Optional: Fall back to legacy Express handler for unmigrated routes
    // Uncomment the block below if you need Express fallback
    /*
    if (shouldUseLegacyExpress(url.pathname)) {
      return legacyExpressHandler(req, server);
    }
    */

    // All HTTP requests handled by Hono
    return honoApp.fetch(req, { ip: server.requestIP(req) });
  },
});

// Start memory telemetry
memoryTelemetryService.start();

if (process.env.UPTIME_SERVICE_RUNNING === "true") {
  AppUptimeService.startUptimeScheduler();
}

logger.info(`\n
    ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
    ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
    ☁️☁️☁️      😎 MentraOS Cloud Server 🚀
    ☁️☁️☁️      🌐 Listening on port ${PORT} 🌐
    ☁️☁️☁️      ⚡ Pure Hono + Bun Native ⚡
    ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
    ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️\n`);

export default server;
