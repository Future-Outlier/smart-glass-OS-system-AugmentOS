/**
 * @fileoverview Store service for MentraOS Store website.
 * Handles business logic for the store frontend including app browsing,
 * installation status, and user-specific app data.
 */

import { User } from "../../models/user.model";
import appService from "./app.service";
import { logger as rootLogger } from "../logging/pino-logger";

const logger = rootLogger.child({ service: "store.service" });

export interface AppWithInstallStatus {
  packageName: string;
  name?: string;
  description?: string;
  organizationId?: unknown;
  isInstalled: boolean;
   
  [key: string]: any; // Allow other app properties
}

export interface InstalledAppWithDate {
  packageName: string;
  name?: string;
  description?: string;
  installedDate: Date;
   
  [key: string]: any; // Allow other app properties
}

/**
 * Get all published apps available in the store.
 * No authentication required.
 */
export async function getPublishedApps() {
  return await appService.getAvailableApps();
}

/**
 * Get all published apps with installation status for a specific user.
 * Requires user email for checking installation status.
 *
 * @param userEmail - Email of the authenticated user
 * @param organizationId - Optional organization filter
 * @returns Apps with isInstalled flag added
 */
export async function getPublishedAppsForUser(
  userEmail: string,
  organizationId?: string,
): Promise<AppWithInstallStatus[]> {
  // Get all available apps
  let apps = await appService.getAvailableApps();

  // Filter by organization if specified
  if (organizationId) {
    apps = apps.filter((app) => app.organizationId?.toString() === organizationId);
  }

  // Get user to check which apps are installed
  const user = await User.findOrCreateUser(userEmail);
  const installedPackageNames = user.installedApps?.map((ia) => ia.packageName) || [];

  // Add installation status
  const appsWithStatus: AppWithInstallStatus[] = apps.map((app) => ({
    ...app,
    isInstalled: installedPackageNames.includes(app.packageName),
  }));

  return appsWithStatus;
}

/**
 * Get only the apps that a user has installed.
 * Includes installation date for each app.
 *
 * @param userEmail - Email of the authenticated user
 * @returns User's installed apps with installation dates
 */
export async function getInstalledAppsForUser(userEmail: string): Promise<InstalledAppWithDate[]> {
  const user = await User.findOrCreateUser(userEmail);

  // Get full app details for each installed app
  const installedApps = await Promise.all(
    (user.installedApps || []).map(async (installedApp) => {
      const appDetails = await appService.getApp(installedApp.packageName);
      return {
        ...appDetails,
        installedDate: installedApp.installedDate,
      };
    }),
  );

  // Filter out any apps that no longer exist
  const validApps = installedApps.filter((app) => app && app.packageName) as InstalledAppWithDate[];

  return validApps;
}

/**
 * Get app details by package name.
 *
 * @param packageName - Package name of the app
 * @returns App details or null if not found
 */
export async function getAppByPackageName(packageName: string) {
  return await appService.getApp(packageName);
}

/**
 * Search for apps by query string.
 * Searches in app name, description, and package name.
 *
 * @param query - Search query string
 * @param organizationId - Optional organization filter
 * @returns Filtered apps matching the search query
 */
export async function searchApps(query: string, organizationId?: string) {
  let apps = await appService.getAvailableApps();

  // Filter by organization if specified
  if (organizationId) {
    apps = apps.filter((app) => app.organizationId?.toString() === organizationId);
  }

  // Search by name, description, or packageName (case-insensitive)
  const searchQuery = query.toLowerCase();
  const filteredApps = apps.filter(
    (app) =>
      app.name?.toLowerCase().includes(searchQuery) ||
      app.description?.toLowerCase().includes(searchQuery) ||
      app.packageName?.toLowerCase().includes(searchQuery),
  );

  return filteredApps;
}

/**
 * Install an app for a user.
 *
 * @param userEmail - Email of the authenticated user
 * @param packageName - Package name of the app to install
 * @returns Success status and message
 */
export async function installAppForUser(userEmail: string, packageName: string) {
  // Verify app exists
  const app = await appService.getApp(packageName);
  if (!app) {
    throw new Error("App not found");
  }

  // Install app for user
  const user = await User.findOrCreateUser(userEmail);

  // Check if already installed
  if (user.isAppInstalled(packageName)) {
    return { alreadyInstalled: true };
  }

  await user.installApp(packageName);
  logger.info({ userEmail, packageName }, "App installed successfully");

  return { alreadyInstalled: false };
}

/**
 * Uninstall an app for a user.
 * Automatically stops the app if it's running.
 *
 * @param userEmail - Email of the authenticated user
 * @param packageName - Package name of the app to uninstall
 */
export async function uninstallAppForUser(userEmail: string, packageName: string) {
  const user = await User.findOrCreateUser(userEmail);

  // Check if app is installed
  if (!user.isAppInstalled(packageName)) {
    throw new Error("App is not installed");
  }

  // Note: App stopping logic is handled in the API layer if UserSession exists
  // This service focuses on the data layer only

  // Uninstall app
  await user.uninstallApp(packageName);
  logger.info({ userEmail, packageName }, "App uninstalled successfully");
}

export default {
  getPublishedApps,
  getPublishedAppsForUser,
  getInstalledAppsForUser,
  getAppByPackageName,
  searchApps,
  installAppForUser,
  uninstallAppForUser,
};
