// cloud/src/api/client/device-state.api.ts
// API endpoint for device connection state updates from mobile clients

import { Router, Request, Response } from "express";
import { GlassesInfo } from "@mentra/types";
import {
  clientAuthWithUserSession,
  RequestWithUserSession,
} from "../middleware/client.middleware";

const router = Router();

// POST /api/client/device/state
router.post("/", clientAuthWithUserSession, updateDeviceState);

/**
 * Update device connection state
 * Accepts partial updates - only specified properties are changed
 */
async function updateDeviceState(req: Request, res: Response) {
  const _req = req as RequestWithUserSession;
  const { userSession } = _req;
  const payload = req.body as Partial<GlassesInfo>;

  // Validate: if connected is being set to true, modelName must be provided
  if (payload.connected === true && !payload.modelName) {
    return res.status(400).json({
      success: false,
      message: "modelName required when connected=true",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Update device state via DeviceManager
    await userSession.deviceManager.updateDeviceState(payload);

    // Return confirmation with current state
    return res.json({
      success: true,
      appliedState: {
        connected: userSession.deviceManager.isConnected(),
        modelName: userSession.deviceManager.getModel(),
        capabilities: userSession.deviceManager.getCapabilities(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    _req.logger.error(error, "Failed to update device state");
    return res.status(500).json({
      success: false,
      message: "Failed to update device state",
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
