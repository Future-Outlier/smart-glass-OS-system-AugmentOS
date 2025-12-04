/**
 * Gallery Sync Notifications
 * Manages system notifications for gallery sync progress
 */

import * as Notifications from "expo-notifications"
import {Platform} from "react-native"

// Notification IDs
const SYNC_NOTIFICATION_ID = "gallery-sync-progress"
const CHANNEL_ID = "gallery-sync"

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

class GallerySyncNotifications {
  private static instance: GallerySyncNotifications
  private channelCreated = false
  private notificationActive = false

  private constructor() {}

  static getInstance(): GallerySyncNotifications {
    if (!GallerySyncNotifications.instance) {
      GallerySyncNotifications.instance = new GallerySyncNotifications()
    }
    return GallerySyncNotifications.instance
  }

  /**
   * Initialize notification channel (Android only)
   */
  private async ensureChannel(): Promise<void> {
    if (this.channelCreated) return

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Gallery Sync",
        description: "Shows progress when syncing photos from your glasses",
        importance: Notifications.AndroidImportance.LOW, // Low = no sound, shows in shade
        vibrationPattern: [0], // No vibration
        lightColor: "#4A90D9",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      })
    }

    this.channelCreated = true
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    const {status: existingStatus} = await Notifications.getPermissionsAsync()

    if (existingStatus === "granted") {
      return true
    }

    const {status} = await Notifications.requestPermissionsAsync()
    return status === "granted"
  }

  /**
   * Show initial sync notification
   */
  async showSyncStarted(totalFiles: number): Promise<void> {
    await this.ensureChannel()

    const hasPermission = await this.requestPermissions()
    if (!hasPermission) {
      console.log("[SyncNotifications] No notification permission, skipping")
      return
    }

    await Notifications.scheduleNotificationAsync({
      identifier: SYNC_NOTIFICATION_ID,
      content: {
        title: "Syncing photos from glasses",
        body: `Preparing to download ${totalFiles} ${totalFiles === 1 ? "file" : "files"}...`,
        data: {type: "gallery-sync"},
        sticky: Platform.OS === "android", // Ongoing notification on Android
      },
      trigger: null, // Show immediately
    })

    this.notificationActive = true
    console.log(`[SyncNotifications] Started sync notification for ${totalFiles} files`)
  }

  /**
   * Update sync progress notification
   */
  async updateProgress(currentFile: number, totalFiles: number, fileName: string, fileProgress: number): Promise<void> {
    if (!this.notificationActive) return

    await this.ensureChannel()

    // Format filename for display (truncate if too long)
    const displayName = fileName.length > 20 ? fileName.substring(0, 17) + "..." : fileName

    // Build progress message
    const progressPercent = Math.round(fileProgress)
    const body = `${currentFile}/${totalFiles}: ${displayName} (${progressPercent}%)`

    await Notifications.scheduleNotificationAsync({
      identifier: SYNC_NOTIFICATION_ID,
      content: {
        title: "Syncing photos from glasses",
        body,
        data: {type: "gallery-sync", progress: fileProgress},
        sticky: Platform.OS === "android", // Keep notification visible on Android
      },
      trigger: null,
    })
  }

  /**
   * Show sync complete notification
   */
  async showSyncComplete(downloadedCount: number, failedCount: number = 0): Promise<void> {
    await this.ensureChannel()

    let title: string
    let body: string

    if (failedCount === 0) {
      title = "Sync complete"
      body = `Downloaded ${downloadedCount} ${downloadedCount === 1 ? "file" : "files"} from your glasses`
    } else if (downloadedCount === 0) {
      title = "Sync failed"
      body = `Failed to download ${failedCount} ${failedCount === 1 ? "file" : "files"}`
    } else {
      title = "Sync complete with errors"
      body = `Downloaded ${downloadedCount}, failed ${failedCount}`
    }

    await Notifications.scheduleNotificationAsync({
      identifier: SYNC_NOTIFICATION_ID,
      content: {
        title,
        body,
        data: {type: "gallery-sync-complete"},
      },
      trigger: null,
    })

    this.notificationActive = false
    console.log(`[SyncNotifications] Sync complete: ${downloadedCount} downloaded, ${failedCount} failed`)

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      this.dismiss()
    }, 5000)
  }

  /**
   * Show sync error notification
   */
  async showSyncError(errorMessage: string): Promise<void> {
    await this.ensureChannel()

    await Notifications.scheduleNotificationAsync({
      identifier: SYNC_NOTIFICATION_ID,
      content: {
        title: "Sync failed",
        body: errorMessage,
        data: {type: "gallery-sync-error"},
      },
      trigger: null,
    })

    this.notificationActive = false
    console.log(`[SyncNotifications] Sync error: ${errorMessage}`)

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      this.dismiss()
    }, 5000)
  }

  /**
   * Show sync cancelled notification
   */
  async showSyncCancelled(): Promise<void> {
    await this.dismiss()
    this.notificationActive = false
    console.log("[SyncNotifications] Sync cancelled, notification dismissed")
  }

  /**
   * Dismiss sync notification
   */
  async dismiss(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(SYNC_NOTIFICATION_ID)
      this.notificationActive = false
    } catch (error) {
      // Notification may already be dismissed
      console.log("[SyncNotifications] Error dismissing notification:", error)
    }
  }

  /**
   * Check if sync notification is currently active
   */
  isActive(): boolean {
    return this.notificationActive
  }
}

export const gallerySyncNotifications = GallerySyncNotifications.getInstance()
