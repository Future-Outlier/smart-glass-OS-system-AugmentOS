/**
 * Device Manager SDK Module for MentraOS Apps
 * Provides access to device information and status
 *
 * Available Information:
 * - WiFi: Connection status, SSID, local IP
 * - Battery: Device and case battery levels, charging status
 * - Hotspot: Hotspot enabled status and SSID
 */

import { AppSession } from ".";

/**
 * Response types for Device Manager API
 */
interface DeviceManagerResponse {
  success: boolean;
  userId: string;
  timestamp: string;
  message?: string;
  error?: string;
}

interface WiFiStatusResponse extends DeviceManagerResponse {
  wifiConnected: boolean | null;
  wifiSsid: string | null;
  wifiLocalIp: string | null;
}

interface BatteryStatusResponse extends DeviceManagerResponse {
  batteryLevel: number | null;
  charging: boolean | null;
  caseBatteryLevel: number | null;
  caseCharging: boolean | null;
  caseOpen: boolean | null;
  caseRemoved: boolean | null;
}

interface HotspotStatusResponse extends DeviceManagerResponse {
  hotspotEnabled: boolean | null;
  hotspotSsid: string | null;
}

/**
 * WiFi status information
 */
export interface WiFiStatus {
  wifiConnected: boolean | null;
  wifiSsid: string | null;
  wifiLocalIp: string | null;
}

/**
 * Battery status information
 */
export interface BatteryStatus {
  batteryLevel: number | null;
  charging: boolean | null;
  caseBatteryLevel: number | null;
  caseCharging: boolean | null;
  caseOpen: boolean | null;
  caseRemoved: boolean | null;
}

/**
 * Hotspot status information
 */
export interface HotspotStatus {
  hotspotEnabled: boolean | null;
  hotspotSsid: string | null;
}

/**
 * Device Manager class for accessing device information
 */
export class DeviceManager {
  private appSession: AppSession;
  private userId: string;
  private packageName: string;
  private baseUrl: string;

  constructor(appSession: AppSession) {
    this.appSession = appSession;
    this.userId = appSession.userId;
    this.packageName = appSession.getPackageName();
    this.baseUrl = this.getBaseUrl();
  }

  // Convert WebSocket URL to HTTP for API calls
  private getBaseUrl(): string {
    const serverUrl = this.appSession.getServerUrl();
    if (!serverUrl) return "http://localhost:8002";
    return serverUrl.replace(/\/app-ws$/, "").replace(/^ws/, "http");
  }

  // Generate auth headers for API requests
  private getAuthHeaders() {
    const apiKey = (this.appSession as any).config?.apiKey || "unknown-api-key";
    return {
      Authorization: `Bearer ${this.packageName}:${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Get WiFi status for the current user's device
   *
   * @returns Promise resolving to WiFi status information
   * @throws Error if request fails
   *
   * @example
   * ```typescript
   * const wifiStatus = await session.deviceManager.getWiFiStatus();
   * console.log(`WiFi Connected: ${wifiStatus.wifiConnected}`);
   * console.log(`SSID: ${wifiStatus.wifiSsid}`);
   * console.log(`Local IP: ${wifiStatus.wifiLocalIp}`);
   * ```
   */
  public async getWiFiStatus(): Promise<WiFiStatus> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sdk/device-manager/${encodeURIComponent(this.userId)}/wifi`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch WiFi status: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as WiFiStatusResponse;

      if (!data.success) {
        throw new Error(`WiFi status request failed: ${data.message || data.error}`);
      }

      return {
        wifiConnected: data.wifiConnected,
        wifiSsid: data.wifiSsid,
        wifiLocalIp: data.wifiLocalIp,
      };
    } catch (error) {
      console.error("Error fetching WiFi status:", error);
      throw error;
    }
  }

  /**
   * Get battery status for the current user's device
   *
   * @returns Promise resolving to battery status information
   * @throws Error if request fails
   *
   * @example
   * ```typescript
   * const batteryStatus = await session.deviceManager.getBatteryStatus();
   * console.log(`Battery Level: ${batteryStatus.batteryLevel}%`);
   * console.log(`Charging: ${batteryStatus.charging}`);
   * console.log(`Case Battery: ${batteryStatus.caseBatteryLevel}%`);
   * ```
   */
  public async getBatteryStatus(): Promise<BatteryStatus> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sdk/device-manager/${encodeURIComponent(this.userId)}/battery`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch battery status: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as BatteryStatusResponse;

      if (!data.success) {
        throw new Error(
          `Battery status request failed: ${data.message || data.error}`,
        );
      }

      return {
        batteryLevel: data.batteryLevel,
        charging: data.charging,
        caseBatteryLevel: data.caseBatteryLevel,
        caseCharging: data.caseCharging,
        caseOpen: data.caseOpen,
        caseRemoved: data.caseRemoved,
      };
    } catch (error) {
      console.error("Error fetching battery status:", error);
      throw error;
    }
  }

  /**
   * Get hotspot status for the current user's device
   *
   * @returns Promise resolving to hotspot status information
   * @throws Error if request fails
   *
   * @example
   * ```typescript
   * const hotspotStatus = await session.deviceManager.getHotspotStatus();
   * console.log(`Hotspot Enabled: ${hotspotStatus.hotspotEnabled}`);
   * console.log(`Hotspot SSID: ${hotspotStatus.hotspotSsid}`);
   * ```
   */
  public async getHotspotStatus(): Promise<HotspotStatus> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sdk/device-manager/${encodeURIComponent(this.userId)}/hotspot`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch hotspot status: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as HotspotStatusResponse;

      if (!data.success) {
        throw new Error(
          `Hotspot status request failed: ${data.message || data.error}`,
        );
      }

      return {
        hotspotEnabled: data.hotspotEnabled,
        hotspotSsid: data.hotspotSsid,
      };
    } catch (error) {
      console.error("Error fetching hotspot status:", error);
      throw error;
    }
  }
}
