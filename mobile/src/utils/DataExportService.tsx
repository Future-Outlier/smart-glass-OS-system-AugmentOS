import AsyncStorage from "@react-native-async-storage/async-storage"
import {SETTINGS_KEYS} from "@/consts"
import {storage} from "@/utils/storage"

export interface UserDataExport {
  metadata: {
    exportDate: string
    exportVersion: string
    appVersion: string
  }
  authentication: {
    user: {
      id: string
      email: string
      created_at: string
      last_sign_in_at: string
      email_confirmed_at: string
      provider: string
      user_metadata: {
        full_name?: string
        avatar_url?: string
        email_verified?: boolean
        // Remove sensitive provider tokens and IDs
      }
    }
    sessionInfo: {
      expires_at: number
      token_type: string
      // Tokens removed for security
    }
  }
  augmentosStatus: any // Full status from AugmentOSStatusProvider
  installedApps: any[] // Full app list from AppStatusProvider
  userSettings: {
    [key: string]: any
  }
  localStorage: {
    [key: string]: any
  }
}

export class DataExportService {
  private static readonly EXPORT_VERSION = "1.0.0"

  /**
   * Collect all user data from various sources
   */
  public static async collectUserData(user: any, session: any, status: any, appStatus: any[]): Promise<UserDataExport> {
    console.log("DataExportService: Starting user data collection...")

    const exportData: UserDataExport = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportVersion: this.EXPORT_VERSION,
        appVersion: "2.0.0", // Could be dynamic
      },
      authentication: await this.collectAuthData(user, session),
      augmentosStatus: this.sanitizeStatusData(status),
      installedApps: this.sanitizeAppData(appStatus),
      userSettings: await this.collectSettingsData(),
      localStorage: await this.collectLocalStorageData(),
    }

    console.log("DataExportService: Data collection completed")
    return exportData
  }

  /**
   * Collect and sanitize authentication data
   */
  private static async collectAuthData(user: any, session: any): Promise<any> {
    console.log("DataExportService: Collecting auth data...")

    if (!user) {
      return {
        user: null,
        sessionInfo: null,
      }
    }

    // Sanitize user data - remove sensitive information
    const sanitizedUser = {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      email_confirmed_at: user.email_confirmed_at,
      provider: user.app_metadata?.provider,
      user_metadata: {
        full_name: user.user_metadata?.full_name || user.user_metadata?.name,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        email_verified: user.user_metadata?.email_verified,
        phone_verified: user.user_metadata?.phone_verified,
        // Remove provider_id, sub, iss, and other sensitive data
      },
    }

    // Sanitize session data - remove tokens
    const sanitizedSession = session
      ? {
          expires_at: session.expires_at,
          token_type: session.token_type,
          // Remove access_token, refresh_token, provider_token
        }
      : null

    return {
      user: sanitizedUser,
      sessionInfo: sanitizedSession,
    }
  }

  /**
   * Sanitize status data - remove sensitive tokens
   */
  private static sanitizeStatusData(status: any): any {
    if (!status) return null

    const sanitized = JSON.parse(JSON.stringify(status)) // Deep clone

    // Remove or mask sensitive data
    if (sanitized.core_info?.core_token) {
      sanitized.core_info.core_token = "[REDACTED]"
    }

    return sanitized
  }

  /**
   * Sanitize app data - remove sensitive keys and tokens
   */
  private static sanitizeAppData(appStatus: any[]): any[] {
    if (!appStatus || !Array.isArray(appStatus)) return []

    return appStatus.map(app => {
      const sanitized = {...app}

      // Remove sensitive app data
      if (sanitized.hashedApiKey) {
        sanitized.hashedApiKey = "[REDACTED]"
      }
      if (sanitized.hashedEndpointSecret) {
        sanitized.hashedEndpointSecret = "[REDACTED]"
      }

      return sanitized
    })
  }

  /**
   * Collect settings from AsyncStorage
   */
  private static async collectSettingsData(): Promise<{[key: string]: any}> {
    console.log("DataExportService: Collecting settings data...")

    const settings: {[key: string]: any} = {}

    try {
      // Collect all known settings
      for (const [keyName, keyValue] of Object.entries(SETTINGS_KEYS)) {
        try {
          const value = await AsyncStorage.getItem(keyValue)
          if (value !== null) {
            try {
              settings[keyName] = JSON.parse(value)
            } catch {
              settings[keyName] = value // Store as string if not JSON
            }
          }
        } catch (error) {
          console.warn(`Failed to read setting ${keyName}:`, error)
        }
      }

      console.log(`DataExportService: Collected ${Object.keys(settings).length} settings`)
    } catch (error) {
      console.error("DataExportService: Error collecting settings:", error)
    }

    return settings
  }

  /**
   * Collect data from MMKV/local storage
   */
  private static async collectLocalStorageData(): Promise<{[key: string]: any}> {
    console.log("DataExportService: Collecting local storage data...")

    const localStorage: {[key: string]: any} = {}

    try {
      // Get common storage keys (you might want to expand this list)
      const commonKeys = [
        "onboarding_completed",
        "theme_preference",
        "user_preferences",
        "app_cache",
        // Add more keys as needed
      ]

      for (const key of commonKeys) {
        try {
          const value = storage.load(key)
          if (value !== undefined) {
            localStorage[key] = value
          }
        } catch (error) {
          // Key doesn't exist, skip
        }
      }

      console.log(`DataExportService: Collected ${Object.keys(localStorage).length} local storage items`)
    } catch (error) {
      console.error("DataExportService: Error collecting local storage:", error)
    }

    return localStorage
  }

  /**
   * Format the export data as pretty JSON string
   */
  public static formatAsJson(data: UserDataExport): string {
    return JSON.stringify(data, null, 2)
  }

  /**
   * Generate a filename for the export
   */
  public static generateFilename(): string {
    const date = new Date().toISOString().split("T")[0] // YYYY-MM-DD
    return `augmentos-data-export-${date}.json`
  }
}
