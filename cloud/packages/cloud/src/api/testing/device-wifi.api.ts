// cloud/src/api/testing/device-wifi.api.ts
// NO-AUTH testing API endpoint for WiFi status information

import { Router, Request, Response } from "express";
import UserSession from "../../services/session/UserSession";
import { logger as rootLogger } from "../../services/logging/pino-logger";

const router = Router();
const logger = rootLogger.child({ service: "testing-device-wifi-api" });

/**
 * GET /api/testing/device-wifi/:userId
 * Returns WiFi status information for a device
 * NO AUTH - FOR TESTING ONLY
 */
router.get("/:userId", getDeviceWifiStatus);

async function getDeviceWifiStatus(req: Request, res: Response) {
  const { userId } = req.params;

  logger.info({ userId }, "Testing API: Fetching device WiFi status");

  try {
    // Get user session
    const userSession = UserSession.getById(userId);

    if (!userSession) {
      logger.warn({ userId }, "User session not found");

      // Hardcoded test data for specific user
      if (userId === "aryan.mentra.dev.public@gmail.com") {
        logger.info(
          { userId },
          "Returning hardcoded test data for test user",
        );
        return res.json({
          success: true,
          userId,
          wifiConnected: true,
          wifiSsid: "TestNetwork-5G",
          wifiLocalIp: "192.168.1.100",
          timestamp: new Date().toISOString(),
          note: "Hardcoded test data - no active session found",
        });
      }

      return res.status(404).json({
        success: false,
        message: "User session not found",
        userId,
        wifiConnected: false,
        wifiSsid: null,
        wifiLocalIp: null,
      });
    }

    // Get device state from DeviceManager
    const deviceState = userSession.deviceManager.getDeviceState();

    return res.json({
      success: true,
      userId,
      wifiConnected: deviceState.wifiConnected ?? false,
      wifiSsid: deviceState.wifiSsid ?? null,
      wifiLocalIp: deviceState.wifiLocalIp ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to get device WiFi status");
    return res.status(500).json({
      success: false,
      message: "Failed to get device WiFi status",
      userId,
      wifiConnected: false,
      wifiSsid: null,
      wifiLocalIp: null,
    });
  }
}

export default router;
