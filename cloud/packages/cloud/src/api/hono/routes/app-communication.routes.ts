/**
 * @fileoverview Hono app-communication routes.
 * Multi-user app discovery and communication endpoints.
 * Mounted at: /api/app-communication
 */

import { Hono } from "hono";
import axios from "axios";
import { logger as rootLogger } from "../../../services/logging/pino-logger";
import appService from "../../../services/core/app.service";
import UserSession from "../../../services/session/UserSession";
import type { AppEnv, AppContext } from "../../../types/hono";

const logger = rootLogger.child({ service: "app-communication.routes" });

const app = new Hono<AppEnv>();

// ============================================================================
// Routes
// ============================================================================

app.post("/discover-users", discoverUsers);
app.post("/invoke-tool", invokeTool);

// ============================================================================
// Handlers
// ============================================================================

/**
 * POST /api/app-communication/discover-users
 * Discover other users currently using the same App.
 *
 * Headers:
 *   - Authorization: Bearer <app-api-key>
 *
 * Body:
 *   - packageName: string (required)
 *   - userId: string (required)
 *   - includeUserProfiles?: boolean (optional, default: false)
 */
async function discoverUsers(c: AppContext) {
  try {
    // Parse API key from Authorization header (Bearer token)
    const authHeader = c.req.header("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const appApiKey = authHeader.replace("Bearer ", "").trim();

    // Parse request body
    const body = await c.req.json().catch(() => ({}));
    const {
      packageName,
      userId,
      includeUserProfiles = false,
    } = body as {
      packageName?: string;
      userId?: string;
      includeUserProfiles?: boolean;
    };

    // Validate required fields
    if (!packageName) {
      return c.json({ error: "packageName is required" }, 400);
    }

    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }

    // Retrieve the app by packageName
    const appDoc = await appService.getApp(packageName);

    if (!appDoc) {
      return c.json({ error: "Invalid packageName" }, 401);
    }

    // Validate the API key
    const isValid = await appService.validateApiKey(packageName, appApiKey);

    if (!isValid) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Find the user's active session
    const userSession = UserSession.getById(userId);

    if (!userSession) {
      return c.json({ error: "No active session found for user" }, 404);
    }

    // TODO: Implement multi-user app service for tracking users across apps
    // For now, return an empty array until the multi-user service is fixed
    const users: Array<{
      userId: string;
      sessionId: string;
      joinedAt: Date;
      userProfile?: any;
    }> = [];

    // When multi-user service is implemented, it would look something like:
    // const users = multiUserAppService.getActiveAppUsers(packageName)
    //   .filter((otherUserId: string) => otherUserId !== userId)
    //   .map((otherUserId: string) => {
    //     const otherSession = UserSession.getById(otherUserId);
    //     return {
    //       userId: otherUserId,
    //       sessionId: otherSession?.sessionId || 'unknown',
    //       joinedAt: new Date(),
    //       userProfile: includeUserProfiles ? multiUserAppService.getUserProfile(otherUserId) : undefined
    //     };
    //   });

    return c.json({
      users,
      totalUsers: users.length,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(error, "Error discovering users");
    return c.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

/**
 * POST /api/app-communication/invoke-tool
 * Invoke a tool on a target TPA app.
 * This allows one app (like MentraAI) to call tools on another app (like Mentra Notes).
 *
 * Body:
 *   - targetPackageName: string (required) - The app that has the tool
 *   - toolId: string (required) - The ID of the tool to invoke
 *   - parameters: object (optional) - Parameters to pass to the tool
 *   - apiKey: string (required) - API key of the calling app
 *   - sourcePackageName: string (required) - Package name of the calling app
 *   - userId: string (required) - User ID for the session
 */
async function invokeTool(c: AppContext) {
  try {
    // Parse request body
    const body = await c.req.json().catch(() => ({}));
    const {
      targetPackageName,
      toolId,
      parameters = {},
      apiKey,
      sourcePackageName,
      userId,
    } = body as {
      targetPackageName?: string;
      toolId?: string;
      parameters?: Record<string, unknown>;
      apiKey?: string;
      sourcePackageName?: string;
      userId?: string;
    };

    // Validate required fields
    if (!targetPackageName) {
      return c.json({ success: false, error: "targetPackageName is required" }, 400);
    }
    if (!toolId) {
      return c.json({ success: false, error: "toolId is required" }, 400);
    }
    if (!apiKey) {
      return c.json({ success: false, error: "apiKey is required" }, 400);
    }
    if (!sourcePackageName) {
      return c.json({ success: false, error: "sourcePackageName is required" }, 400);
    }
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    logger.info({ targetPackageName, toolId, sourcePackageName, userId }, "Invoke tool request received");

    // Validate the calling app's API key
    const isValid = await appService.validateApiKey(sourcePackageName, apiKey);
    if (!isValid) {
      return c.json({ success: false, error: "Invalid API key" }, 401);
    }

    // Find the user's active session
    const userSession = UserSession.getById(userId);
    if (!userSession) {
      return c.json({ success: false, error: "No active session found for user" }, 404);
    }

    // Check if the target app is running for this user
    const runningAppNames = userSession.appManager.getRunningAppNames();
    if (!runningAppNames.has(targetPackageName)) {
      return c.json(
        {
          success: false,
          error: `App ${targetPackageName} is not running. Start it first using /api/sdk/system-app/${targetPackageName}/start`,
        },
        400,
      );
    }

    // Get the target app's public URL to call its /tool endpoint
    const targetAppDoc = await appService.getApp(targetPackageName);
    if (!targetAppDoc || !targetAppDoc.publicUrl) {
      return c.json(
        {
          success: false,
          error: `App ${targetPackageName} does not have a public URL configured`,
        },
        400,
      );
    }

    // Invoke the tool via HTTP POST to the TPA's /tool endpoint
    logger.info(
      { targetPackageName, toolId, parameters, publicUrl: targetAppDoc.publicUrl },
      "Invoking tool on TPA via HTTP",
    );

    try {
      // Build the tool call payload matching the SDK's ToolCall interface
      const toolCallPayload = {
        toolId: toolId,
        toolParameters: parameters,
        userId: userId,
        timestamp: new Date().toISOString(),
      };

      const toolEndpoint = `${targetAppDoc.publicUrl}/tool`;
      logger.info({ toolEndpoint, toolCallPayload }, "Calling TPA tool endpoint");

      const response = await axios.post(toolEndpoint, toolCallPayload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 second timeout
      });

      logger.info({ targetPackageName, toolId, response: response.data }, "Tool invocation successful");

      // The TPA returns { status: "success", reply: <result> }
      if (response.data.status === "success") {
        return c.json({
          success: true,
          result: response.data.reply,
          message: `Tool ${toolId} executed successfully on ${targetPackageName}`,
        });
      } else {
        return c.json(
          {
            success: false,
            error: response.data.message || "Tool execution failed",
          },
          500,
        );
      }
    } catch (toolError) {
      logger.error({ targetPackageName, toolId, error: toolError }, "Tool invocation failed");
      if (axios.isAxiosError(toolError)) {
        const errorMessage = toolError.response?.data?.message || toolError.message;
        return c.json(
          {
            success: false,
            error: `Tool execution failed: ${errorMessage}`,
          },
          500,
        );
      }
      return c.json(
        {
          success: false,
          error: `Tool execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
        },
        500,
      );
    }
  } catch (error) {
    logger.error(error, "Error invoking tool");
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

export default app;
