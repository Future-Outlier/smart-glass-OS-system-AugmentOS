// MentraOS/cloud/packages/cloud/src/services/session/UserSettingsManager.ts

/**
 * UserSettingsManager
 *
 * Session-scoped manager that integrates REST-based user settings with the active session.
 * Responsibilities:
 * - Maintain a session snapshot of user settings (loaded from UserSettings if requested).
 * - React to REST updates by updating the snapshot and broadcasting to connected apps.
 * - Handle special settings that require additional actions:
 *   - timezone (string) → update userSession.userTimezone
 *   - default_wearable (string) → delegate to DeviceManager to update model/capabilities
 *
 * Notes:
 * - This manager does not persist settings; persistence happens in the REST layer (user-settings.api.ts).
 * - Legacy WS settings are not written to UserSettings; they continue to flow on their old path.
 */

import type { Logger } from "pino";

import { UserSettings } from "../../models/user-settings.model";
import { WebSocketReadyState } from "../websocket/types";

import type UserSession from "./UserSession";

export class UserSettingsManager {
  private readonly userSession: UserSession;
  private readonly logger: Logger;

  // In-session snapshot of user settings (client-defined keys)
  private snapshot: Record<string, any> = {};

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "UserSettingsManager" });
    this.logger.info({ userId: userSession.userId }, "UserSettingsManager initialized");
    this.load();
  }

  /**
   * Optionally load current settings from the canonical UserSettings model.
   * This is not required for broadcasting to function, but useful for diagnostics.
   */
  async load(): Promise<void> {
    try {
      const email = this.userSession.userId.toLowerCase();
      const doc = await UserSettings.findOne({ email });
      const settings = doc?.getSettings() || {};
      this.snapshot = { ...settings };

      // Load timezone if present
      if (this.snapshot.timezone) {
        this.userSession.userTimezone = this.snapshot.timezone;
        this.logger.info({ userId: email, timezone: this.snapshot.timezone }, "User timezone loaded");
      }

      // Load default wearable if present
      if (this.snapshot.default_wearable) {
        this.logger.info({ userId: email, wearableId: this.snapshot.default_wearable }, "Default wearable loaded");
        await this.userSession.deviceManager.setCurrentModel(this.snapshot.default_wearable);
      }

      this.logger.info({ userId: email, keys: Object.keys(this.snapshot) }, "User settings snapshot loaded");
    } catch (error) {
      this.logger.error(error as Error, "Error loading user settings snapshot from database");
    }
  }

  /**
   * Get a shallow copy of the current in-session settings snapshot
   */
  getSnapshot(): Record<string, any> {
    return { ...this.snapshot };
  }

  /**
   * Build the full mentraosSettings object for SDK apps.
   * Maps from REST keys (snake_case) to SDK keys (camelCase).
   * This must stay in sync with AppManager.handleAppInit() CONNECTION_ACK.
   */
  buildMentraosSettings(): Record<string, any> {
    return {
      // Primary settings apps care about
      metricSystemEnabled: this.snapshot.metric_system ?? false,
      contextualDashboard: this.snapshot.contextual_dashboard ?? true,
      headUpAngle: this.snapshot.head_up_angle ?? 45,
      brightness: this.snapshot.brightness ?? 50,
      autoBrightness: this.snapshot.auto_brightness ?? true,
      sensingEnabled: this.snapshot.sensing_enabled ?? true,
      alwaysOnStatusBar: this.snapshot.always_on_status_bar ?? false,
      // Mobile uses "_for_debugging" suffix for these keys
      bypassVad: this.snapshot.bypass_vad_for_debugging ?? false,
      bypassAudioEncoding: this.snapshot.bypass_audio_encoding_for_debugging ?? false,
      // Mobile uses preferred_mic instead of useOnboardMic
      preferredMic: this.snapshot.preferred_mic ?? "auto",
      // Legacy key for backward compat (derived from preferred_mic)
      useOnboardMic: this.snapshot.preferred_mic === "glasses",
      // User's timezone (IANA name like "America/New_York")
      userTimezone: this.userSession.userTimezone || this.snapshot.timezone || null,
    };
  }

  /**
   * Called after REST persistence to update the in-session snapshot
   * and broadcast to connected apps.
   *
   * @param updated Partial map of keys updated via REST
   */
  async onSettingsUpdatedViaRest(updated: Record<string, any>): Promise<void> {
    try {
      if (!updated || typeof updated !== "object") return;

      // Update the in-session snapshot
      const prev = { ...this.snapshot };
      for (const [key, value] of Object.entries(updated)) {
        if (value === null || value === undefined) {
          delete this.snapshot[key];
        } else {
          this.snapshot[key] = value;
        }
      }

      this.logger.info(
        {
          userId: this.userSession.userId,
          changedKeys: Object.keys(updated),
        },
        "Applied REST user settings update to session snapshot",
      );

      // Handle special settings that require additional actions
      if (Object.prototype.hasOwnProperty.call(updated, "timezone")) {
        const timezone = updated["timezone"];
        if (typeof timezone === "string" && timezone) {
          this.userSession.userTimezone = timezone;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updated, "default_wearable")) {
        await this.applyDefaultWearable(updated["default_wearable"]);
      }

      // Broadcast full settings snapshot to all connected apps
      await this.broadcastSettingsUpdate();

      // Optionally log diff (debug)
      if (this.shouldDebug()) {
        this.logger.debug(
          {
            before: prev,
            after: this.snapshot,
            applied: updated,
          },
          "User settings snapshot updated (debug)",
        );
      }
    } catch (error) {
      this.logger.error(error as Error, "Error handling onSettingsUpdatedViaRest in UserSettingsManager");
    }
  }

  /**
   * Broadcast the full mentraosSettings snapshot to all connected apps.
   * Sends to any app that has subscribed to any augmentos setting.
   */
  private async broadcastSettingsUpdate(): Promise<void> {
    try {
      // Get all apps that have any augmentos setting subscription
      const subscribedApps = this.userSession.subscriptionManager.getAllAppsWithAugmentosSubscriptions();

      if (!subscribedApps || subscribedApps.length === 0) {
        this.logger.debug(
          { userId: this.userSession.userId },
          "No apps subscribed to augmentos settings; skipping broadcast",
        );
        return;
      }

      const mentraosSettings = this.buildMentraosSettings();
      const timestamp = new Date();

      for (const packageName of subscribedApps) {
        const ws = this.userSession.appWebsockets.get(packageName);
        if (!ws || ws.readyState !== WebSocketReadyState.OPEN) continue;

        const message = {
          type: "augmentos_settings_update",
          sessionId: `${this.userSession.sessionId}-${packageName}`,
          settings: mentraosSettings,
          timestamp,
        };

        try {
          ws.send(JSON.stringify(message));
        } catch (sendError) {
          this.logger.error(sendError as Error, `Error sending settings update to App ${packageName}`);
        }
      }

      this.logger.info(
        {
          userId: this.userSession.userId,
          appCount: subscribedApps.length,
          settingsKeys: Object.keys(mentraosSettings),
        },
        "Broadcast settings update to apps",
      );
    } catch (error) {
      this.logger.error(error as Error, "Error broadcasting settings update");
    }
  }

  /**
   * Apply default_wearable by delegating to DeviceManager
   * - Updates current model and capabilities immediately
   * - Sends CAPABILITIES_UPDATE and stops incompatible Apps (via DeviceManager)
   * - Updates User.glassesModels, PostHog, and analytics per DeviceManager's behavior
   */
  private async applyDefaultWearable(raw: any): Promise<void> {
    const modelName = typeof raw === "string" ? raw.trim() : raw ? String(raw) : "";

    if (!modelName) {
      this.logger.warn({ userId: this.userSession.userId }, "default_wearable provided but empty; ignoring");
      return;
    }

    try {
      await this.userSession.deviceManager.setCurrentModel(modelName);
    } catch (error) {
      this.logger.error(error as Error, "Error applying default_wearable via DeviceManager");
    }
  }

  /**
   * Cleanup manager state (called from UserSession.dispose)
   */
  dispose(): void {
    this.snapshot = {};
  }

  private shouldDebug(): boolean {
    // Toggle extra debug logging here if desired
    return false;
  }
}

export default UserSettingsManager;
