// src/types/app.types.ts

// Define App type enum
export enum AppType {
  STANDARD = 'standard',
  SYSTEM = 'system',
  BACKGROUND = 'background'
}

// App settings interface
export interface AppSettings {
  [key: string]: unknown;
}

/**
 * App interface for frontend
 * Matches server-side AppI but adapted for the frontend needs
 */
export interface AppI {
  packageName: string;
  name: string;
  description?: string;
  publicUrl?: string;
  webviewURL?: string; // URL for phone UI
  logoURL: string;
  appType?: AppType; // Type of App
  tpaType?: AppType; // TODO: remove this once we have migrated over

  // App details
  version?: string;
  settings?: AppSettings;
  permissions?: {
    type: string;
    description?: string;
  }[];

  // Frontend-specific properties
  developerId?: string; // Developer's email address
  isInstalled?: boolean;
  installedDate?: string;
  uninstallable?: boolean; // Whether the app can be uninstalled

  // Organization information
  organizationId?: string; // Reference to organization
  orgName?: string; // Name of the organization

  // Developer/Organization profile information
  developerProfile?: {
    company?: string;
    website?: string;
    contactEmail?: string;
    description?: string;
    logo?: string;
  };

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

// Install info interface
export interface InstallInfo {
  packageName: string;
  installedDate: string;
}

// User interface
export interface User {
  id: string;
  email: string;
  installedApps?: InstallInfo[];
  createdAt?: string;
  updatedAt?: string;
}