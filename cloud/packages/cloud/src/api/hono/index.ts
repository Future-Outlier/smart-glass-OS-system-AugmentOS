/**
 * @fileoverview Hono API routes index.
 * Exports all Hono route modules for registration in the main app.
 */

// Client APIs
export { default as livekitApi } from "./livekit.api";
export { default as minVersionApi } from "./min-version.api";
export { default as clientAppsApi } from "./client.apps.api";
export { default as userSettingsApi } from "./user-settings.api";
export { default as feedbackApi } from "./feedback.api";
export { default as calendarApi } from "./calendar.api";
export { default as locationApi } from "./location.api";
export { default as notificationsApi } from "./notifications.api";
export { default as deviceStateApi } from "./device-state.api";

// SDK APIs
export { default as sdkVersionApi } from "./sdk-version.api";
export { default as simpleStorageApi } from "./simple-storage.api";

// Public APIs
export { default as publicPermissionsApi } from "./public-permissions.api";
