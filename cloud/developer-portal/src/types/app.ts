import { AppType, ToolSchema, AppSetting } from '@mentra/sdk';

// Define permission types
export enum PermissionType {
  MICROPHONE = 'MICROPHONE',
  LOCATION = 'LOCATION',
  CALENDAR = 'CALENDAR',

  // Legacy permission (backward compatibility)
  NOTIFICATIONS = 'NOTIFICATIONS',

  // New granular notification permissions
  READ_NOTIFICATIONS = 'READ_NOTIFICATIONS',
  POST_NOTIFICATIONS = 'POST_NOTIFICATIONS',

  ALL = 'ALL'
}

export interface Permission {
  type: PermissionType;
  description?: string;
}

// Re-export SDK types for convenience
export type Tool = ToolSchema;
export type Setting = AppSetting;


export interface App {
  id: string;
  packageName: string;
  name: string;
  description: string;
  publicUrl: string;
  logoURL: string;
  webviewURL?: string;
  isPublic: boolean;
  appStoreStatus?: 'DEVELOPMENT' | 'SUBMITTED' | 'REJECTED' | 'PUBLISHED';
  appType: AppType;
  createdAt?: string; // For compatibility with AppResponse
  updatedAt?: string; // For compatibility with AppResponse
  reviewNotes?: string; // Review notes from app review
  reviewedBy?: string; // Admin who reviewed the app
  reviewedAt?: string; // When the app was reviewed
  permissions?: Permission[]; // Permissions required by the app
  settings?: Setting[]; // App configuration settings
  tools?: Tool[]; // AI tools provided by the app
  onboardingInstructions?: string;
}