/**
 * Device Manager API for MentraOS SDK
 *
 * Provides device information and status for user devices through authenticated REST API endpoints.
 * All routes are protected by SDK authentication middleware requiring valid package credentials.
 *
 * Auth: Bearer <packageName>:<apiKey>
 *
 * Base: /api/sdk/device-manager
 * Endpoints:
 * - GET /:email/wifi -> Get WiFi status for a specific user's device
 * - GET /:email/battery -> Get battery status for a specific user's device
 * - GET /:email/hotspot -> Get hotspot status for a specific user's device
 *
 * @author MentraOS Team
 */

import { Router, Request, Response } from "express";
import { authenticateSDK } from "../middleware/sdk.middleware";
import UserSession from "../../services/session/UserSession";
import { logger as rootLogger } from "../../services/logging/pino-logger";

const router = Router();
const logger = rootLogger.child({ service: "sdk-device-manager-api" });

/**
 * GET /api/sdk/device-manager/:email/wifi
 * Returns WiFi status for the specified user's device
 * Auth: Bearer <packageName>:<apiKey>
 */
router.get("/:email/wifi", authenticateSDK, getDeviceWifiStatus);

/**
 * GET /api/sdk/device-manager/:email/battery
 * Returns battery status for the specified user's device
 * Auth: Bearer <packageName>:<apiKey>
 */
router.get("/:email/battery", authenticateSDK, getDeviceBatteryStatus);

/**
 * GET /api/sdk/device-manager/:email/hotspot
 * Returns hotspot status for the specified user's device
 * Auth: Bearer <packageName>:<apiKey>
 */
router.get("/:email/hotspot", authenticateSDK, getDeviceHotspotStatus);

async function getDeviceWifiStatus(req: Request, res: Response) {
  try {
    if (!req.sdk) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk.packageName;

    if (!email) {
      return res.status(400).json({
        error: "Missing email parameter",
        message: "Email parameter is required",
      });
    }

    logger.info(
      { userId: email, packageName },
      "SDK API: Fetching device WiFi status",
    );

    // Get user session
    const userSession = UserSession.getById(email);

    if (!userSession) {
      logger.warn({ userId: email, packageName }, "User session not found");
      return res.status(404).json({
        success: false,
        message: "User session not found",
        userId: email,
        wifiConnected: false,
        wifiSsid: null,
        wifiLocalIp: null,
      });
    }

    // Get device state from DeviceManager
    const deviceState = userSession.deviceManager.getDeviceState();

    logger.info(
      {
        userId: email,
        packageName,
        wifiConnected: deviceState.wifiConnected,
        hasWifiSsid: !!deviceState.wifiSsid,
        hasWifiIp: !!deviceState.wifiLocalIp,
      },
      "Device WiFi status retrieved successfully",
    );

    return res.status(200).json({
      success: true,
      userId: email,
      wifiConnected: deviceState.wifiConnected ?? false,
      wifiSsid: deviceState.wifiSsid ?? null,
      wifiLocalIp: deviceState.wifiLocalIp ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      { error, email: req.params.email, packageName: req.sdk?.packageName },
      "Failed to get device WiFi status",
    );
    return res.status(500).json({
      error: "Failed to get device WiFi status",
      message: "Internal server error",
    });
  }
}

async function getDeviceBatteryStatus(req: Request, res: Response) {
  try {
    if (!req.sdk) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk.packageName;

    if (!email) {
      return res.status(400).json({
        error: "Missing email parameter",
        message: "Email parameter is required",
      });
    }

    logger.info(
      { userId: email, packageName },
      "SDK API: Fetching device battery status",
    );

    // Get user session
    const userSession = UserSession.getById(email);

    if (!userSession) {
      logger.warn({ userId: email, packageName }, "User session not found");
      return res.status(404).json({
        success: false,
        message: "User session not found",
        userId: email,
        batteryLevel: null,
        charging: null,
        caseBatteryLevel: null,
        caseCharging: null,
        caseOpen: null,
        caseRemoved: null,
      });
    }

    // Get device state from DeviceManager
    const deviceState = userSession.deviceManager.getDeviceState();

    logger.info(
      {
        userId: email,
        packageName,
        hasBatteryLevel: deviceState.batteryLevel !== undefined,
        charging: deviceState.charging,
      },
      "Device battery status retrieved successfully",
    );

    return res.status(200).json({
      success: true,
      userId: email,
      batteryLevel: deviceState.batteryLevel ?? null,
      charging: deviceState.charging ?? null,
      caseBatteryLevel: deviceState.caseBatteryLevel ?? null,
      caseCharging: deviceState.caseCharging ?? null,
      caseOpen: deviceState.caseOpen ?? null,
      caseRemoved: deviceState.caseRemoved ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      { error, email: req.params.email, packageName: req.sdk?.packageName },
      "Failed to get device battery status",
    );
    return res.status(500).json({
      error: "Failed to get device battery status",
      message: "Internal server error",
    });
  }
}

async function getDeviceHotspotStatus(req: Request, res: Response) {
  try {
    if (!req.sdk) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk.packageName;

    if (!email) {
      return res.status(400).json({
        error: "Missing email parameter",
        message: "Email parameter is required",
      });
    }

    logger.info(
      { userId: email, packageName },
      "SDK API: Fetching device hotspot status",
    );

    // Get user session
    const userSession = UserSession.getById(email);

    if (!userSession) {
      logger.warn({ userId: email, packageName }, "User session not found");
      return res.status(404).json({
        success: false,
        message: "User session not found",
        userId: email,
        hotspotEnabled: null,
        hotspotSsid: null,
      });
    }

    // Get device state from DeviceManager
    const deviceState = userSession.deviceManager.getDeviceState();

    logger.info(
      {
        userId: email,
        packageName,
        hotspotEnabled: deviceState.hotspotEnabled,
        hasHotspotSsid: !!deviceState.hotspotSsid,
      },
      "Device hotspot status retrieved successfully",
    );

    return res.status(200).json({
      success: true,
      userId: email,
      hotspotEnabled: deviceState.hotspotEnabled ?? null,
      hotspotSsid: deviceState.hotspotSsid ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      { error, email: req.params.email, packageName: req.sdk?.packageName },
      "Failed to get device hotspot status",
    );
    return res.status(500).json({
      error: "Failed to get device hotspot status",
      message: "Internal server error",
    });
  }
}

export default router;
