/**
 * @fileoverview Hono photo response API routes.
 * API endpoint for photo capture responses (success and error) from mobile clients.
 * Replaces the WebSocket-based photo_response path for reliability —
 * when things go wrong, the WebSocket might be the broken thing.
 *
 * Mounted at: /api/client/photo
 *
 * See: cloud/issues/038-photo-error-rest-endpoint/spec.md
 */

import { Hono } from "hono";
import { clientAuth, requireUserSession } from "../middleware/client.middleware";
import { logger as rootLogger } from "../../../services/logging/pino-logger";
import type { AppEnv, AppContext } from "../../../types/hono";

const logger = rootLogger.child({ service: "photo.api" });

const app = new Hono<AppEnv>();

// ============================================================================
// Routes
// ============================================================================

app.post("/response", clientAuth, requireUserSession, handlePhotoResponse);

// ============================================================================
// Handlers
// ============================================================================

/**
 * POST /api/client/photo/response
 * Handle photo capture response (success or error) from the mobile client.
 *
 * Error body:  { requestId, success: false, errorCode, errorMessage }
 * Success body: { requestId, success: true, photoUrl, savedToGallery }
 *
 * Delegates to PhotoManager.handlePhotoResponse() which already handles
 * both the flat {errorCode, errorMessage} shape and the nested
 * {error: {code, message}} shape via normalization.
 */
async function handlePhotoResponse(c: AppContext) {
  const userSession = c.get("userSession")!;
  const reqLogger = c.get("logger") || logger;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { requestId } = body as { requestId?: string };

    if (!requestId) {
      return c.json(
        {
          success: false,
          message: "requestId is required",
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }

    reqLogger.info(
      {
        requestId,
        success: body.success,
        errorCode: body.errorCode,
        userId: userSession.userId,
      },
      `Photo response received via REST: ${body.success ? "success" : `error (${body.errorCode})`}`,
    );

    await userSession.photoManager.handlePhotoResponse(body);

    return c.json({
      success: true,
      message: "Photo response processed",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    reqLogger.error({ error, userId: userSession.userId }, "Failed to process photo response");

    return c.json(
      {
        success: false,
        message: "Failed to process photo response",
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
}

export default app;
