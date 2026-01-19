/**
 * @fileoverview Hono miniapps routes.
 * App management endpoints for starting/stopping apps.
 * Mounted at: /api/miniapps
 *
 * Authentication: API key via query params (for whitelisted packages)
 * - apiKey: The app's API key
 * - packageName: The calling app's package name
 * - userId: The user's email/ID
 *
 * Only whitelisted packages (MentraAI, Mira) can use these endpoints.
 */

import { Hono } from "hono";
import { logger as rootLogger } from "../../../services/logging/pino-logger";
import type { AppEnv, AppContext } from "../../../types/hono";
import { User } from "../../../models/user.model";
import UserSession from "../../../services/session/UserSession";
import { validateApiKey } from "../../../services/sdk/sdk.auth.service";

const logger = rootLogger.child({ service: "miniapps.routes" });

const app = new Hono<AppEnv>();

// Packages allowed to use API key authentication for app management
const ALLOWED_API_KEY_PACKAGES = [
  "test.augmentos.mira",
  "cloud.augmentos.mira",
  "com.augmentos.mira",
  "com.mentra.mentraai.beta",
  "com.mentra.mentraai.dev",
  "com.mentra.ai.noporter",
  "com.mentra.ai.dev",
  "com.mentra.ai.noporter",
  "com.mentra.ai",
];

// ============================================================================
// Routes
// ============================================================================

app.post("/:packageName/start", apiKeyAuth, startApp);
app.post("/:packageName/stop", apiKeyAuth, stopApp);

// ============================================================================
// Middleware
// ============================================================================

/**
 * API key authentication middleware.
 * Requires apiKey, packageName, and userId query parameters.
 * Only allows whitelisted packages.
 */
async function apiKeyAuth(c: AppContext, next: () => Promise<void>) {
  const apiKey = c.req.query("apiKey");
  const packageName = c.req.query("packageName");
  const userId = c.req.query("userId");

  if (!apiKey || !packageName || !userId) {
    return c.json(
      {
        success: false,
        error: "Missing required query parameters: apiKey, packageName, userId",
      },
      400,
    );
  }

  // Check if package is in the whitelist
  if (!ALLOWED_API_KEY_PACKAGES.includes(packageName)) {
    logger.warn({ packageName }, "Package not authorized for API key authentication");
    return c.json(
      {
        success: false,
        error: "Package not authorized for API key authentication",
      },
      403,
    );
  }

  // Validate API key
  const isValid = await validateApiKey(packageName, apiKey);
  if (!isValid) {
    return c.json({ success: false, error: "Invalid API key" }, 401);
  }

  // Get user session
  const userSession = UserSession.getById(userId);
  if (!userSession) {
    return c.json(
      {
        success: false,
        error: "No active session found for user",
      },
      401,
    );
  }

  // Set context
  c.set("email", userId);
  c.set("userSession", userSession);

  await next();
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * POST /api/miniapps/:packageName/start
 * Start an app for the authenticated user.
 * Requires active user session.
 */
async function startApp(c: AppContext) {
  try {
    const targetPackage = c.req.param("packageName");
    const callerPackage = c.req.query("packageName");
    const userId = c.req.query("userId");
    const userSession = c.get("userSession");

    if (!targetPackage) {
      return c.json({ success: false, error: "Missing target packageName" }, 400);
    }

    if (!userSession) {
      return c.json(
        {
          success: false,
          error: "No active session found. Please connect your device first.",
        },
        401,
      );
    }

    logger.info({ callerPackage, userId, targetPackage }, "Starting app via miniapps API");

    // Check if app is installed
    const user = await User.findOrCreateUser(userId!);
    if (!user.isAppInstalled(targetPackage)) {
      return c.json({ success: false, error: "App is not installed" }, 404);
    }

    // Start the app
    const result = await userSession.appManager.startApp(targetPackage);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Failed to start app",
          details: result.error,
        },
        500,
      );
    }

    logger.info({ callerPackage, userId, targetPackage }, "App started successfully");

    return c.json({ success: true, message: "App started successfully" });
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(error, "Failed to start app");
    return c.json(
      {
        success: false,
        error: error?.message || "Failed to start app",
      },
      500,
    );
  }
}

/**
 * POST /api/miniapps/:packageName/stop
 * Stop a running app for the authenticated user.
 * Requires active user session.
 */
async function stopApp(c: AppContext) {
  try {
    const targetPackage = c.req.param("packageName");
    const callerPackage = c.req.query("packageName");
    const userId = c.req.query("userId");
    const userSession = c.get("userSession");

    if (!targetPackage) {
      return c.json({ success: false, error: "Missing target packageName" }, 400);
    }

    if (!userSession) {
      return c.json(
        {
          success: false,
          error: "No active session found",
        },
        401,
      );
    }

    logger.info({ callerPackage, userId, targetPackage }, "Stopping app via miniapps API");

    // Check if app is running
    const isRunning = userSession.appManager.isAppRunning(targetPackage);
    if (!isRunning) {
      return c.json({ success: true, message: "App is not running" });
    }

    // Stop the app
    await userSession.appManager.stopApp(targetPackage);

    logger.info({ callerPackage, userId, targetPackage }, "App stopped successfully");

    return c.json({ success: true, message: "App stopped successfully" });
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(error, "Failed to stop app");
    return c.json(
      {
        success: false,
        error: error?.message || "Failed to stop app",
      },
      500,
    );
  }
}

export default app;
