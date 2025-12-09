/**
 * Gallery Sync Service
 * Orchestrates gallery sync independently of UI lifecycle
 */

import CoreModule from "core"
import WifiManager from "react-native-wifi-reborn"

import {useGallerySyncStore, HotspotInfo} from "@/stores/gallerySync"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS, useSettingsStore} from "@/stores/settings"
import {PhotoInfo} from "@/types/asg"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {MediaLibraryPermissions} from "@/utils/MediaLibraryPermissions"

import {asgCameraApi} from "./asgCameraApi"
import {gallerySettingsService} from "./gallerySettingsService"
import {gallerySyncNotifications} from "./gallerySyncNotifications"
import {localStorageService} from "./localStorageService"

// Timing constants
const TIMING = {
  HOTSPOT_CONNECT_DELAY_MS: 1000,
  HOTSPOT_REQUEST_TIMEOUT_MS: 30000, // Timeout waiting for hotspot to enable
  WIFI_CONNECTION_TIMEOUT_MS: 30000,
  RETRY_DELAY_MS: 2000,
  MAX_QUEUE_AGE_MS: 2 * 60 * 1000, // 2 min - glasses hotspot auto-disables after 40s inactivity
} as const

class GallerySyncService {
  private static instance: GallerySyncService
  private hotspotListenerRegistered = false
  private hotspotConnectionTimeout: ReturnType<typeof setTimeout> | null = null
  private hotspotRequestTimeout: ReturnType<typeof setTimeout> | null = null
  private abortController: AbortController | null = null
  private isInitialized = false
  private glassesStoreUnsubscribe: (() => void) | null = null

  private constructor() {}

  static getInstance(): GallerySyncService {
    if (!GallerySyncService.instance) {
      GallerySyncService.instance = new GallerySyncService()
    }
    return GallerySyncService.instance
  }

  /**
   * Initialize the service - register event listeners
   */
  initialize(): void {
    if (this.isInitialized) return

    // Listen for hotspot status changes
    GlobalEventEmitter.addListener("HOTSPOT_STATUS_CHANGE", this.handleHotspotStatusChange)
    GlobalEventEmitter.addListener("HOTSPOT_ERROR", this.handleHotspotError)
    GlobalEventEmitter.addListener("GALLERY_STATUS", this.handleGalleryStatus)

    // Subscribe to glasses store to detect disconnection during sync
    this.glassesStoreUnsubscribe = useGlassesStore.subscribe(
      state => state.connected,
      (connected, prevConnected) => {
        // Only trigger on disconnect (was connected, now not connected)
        if (prevConnected && !connected) {
          this.handleGlassesDisconnected()
        }
      },
    )

    this.hotspotListenerRegistered = true
    this.isInitialized = true

    console.log("[GallerySyncService] Initialized")

    // Check for resumable sync on startup
    this.checkForResumableSync()
  }

  /**
   * Cleanup - remove event listeners
   */
  cleanup(): void {
    if (this.hotspotListenerRegistered) {
      GlobalEventEmitter.removeListener("HOTSPOT_STATUS_CHANGE", this.handleHotspotStatusChange)
      GlobalEventEmitter.removeListener("HOTSPOT_ERROR", this.handleHotspotError)
      GlobalEventEmitter.removeListener("GALLERY_STATUS", this.handleGalleryStatus)
      this.hotspotListenerRegistered = false
    }

    if (this.glassesStoreUnsubscribe) {
      this.glassesStoreUnsubscribe()
      this.glassesStoreUnsubscribe = null
    }

    if (this.hotspotConnectionTimeout) {
      clearTimeout(this.hotspotConnectionTimeout)
      this.hotspotConnectionTimeout = null
    }

    if (this.hotspotRequestTimeout) {
      clearTimeout(this.hotspotRequestTimeout)
      this.hotspotRequestTimeout = null
    }

    this.isInitialized = false
    console.log("[GallerySyncService] Cleaned up")
  }

  /**
   * Handle glasses disconnection during sync
   */
  private handleGlassesDisconnected = (): void => {
    const store = useGallerySyncStore.getState()

    // Only handle if we're actively syncing
    if (!this.isSyncing()) {
      return
    }

    console.log("[GallerySyncService] Glasses disconnected during sync - cancelling")
    store.setSyncError("Glasses disconnected")

    // Abort ongoing downloads
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    // Clear timeouts
    if (this.hotspotConnectionTimeout) {
      clearTimeout(this.hotspotConnectionTimeout)
      this.hotspotConnectionTimeout = null
    }
    if (this.hotspotRequestTimeout) {
      clearTimeout(this.hotspotRequestTimeout)
      this.hotspotRequestTimeout = null
    }

    gallerySyncNotifications.showSyncError("Glasses disconnected")
  }

  /**
   * Handle gallery status from glasses
   */
  private handleGalleryStatus = (data: any): void => {
    console.log("[GallerySyncService] Received GALLERY_STATUS:", data)

    const store = useGallerySyncStore.getState()
    store.setGlassesGalleryStatus(data.photos || 0, data.videos || 0, data.total || 0, data.has_content || false)
  }

  /**
   * Handle hotspot status change event
   */
  private handleHotspotStatusChange = async (eventData: any): Promise<void> => {
    console.log("[GallerySyncService] Hotspot status changed:", eventData)

    const store = useGallerySyncStore.getState()

    // Only process if we're in a connecting state
    if (store.syncState !== "requesting_hotspot" && store.syncState !== "connecting_wifi") {
      console.log("[GallerySyncService] Ignoring hotspot event - not in connecting state")
      return
    }

    if (!eventData.enabled || !eventData.ssid || !eventData.password) {
      console.log("[GallerySyncService] Hotspot not ready yet")
      return
    }

    // Clear the hotspot request timeout since we got a response
    if (this.hotspotRequestTimeout) {
      clearTimeout(this.hotspotRequestTimeout)
      this.hotspotRequestTimeout = null
    }

    const hotspotInfo: HotspotInfo = {
      ssid: eventData.ssid,
      password: eventData.password,
      ip: eventData.local_ip,
    }

    store.setHotspotInfo(hotspotInfo)

    // Wait for hotspot to become discoverable
    console.log("[GallerySyncService] Hotspot enabled, waiting before connecting...")

    if (this.hotspotConnectionTimeout) {
      clearTimeout(this.hotspotConnectionTimeout)
    }

    this.hotspotConnectionTimeout = setTimeout(() => {
      this.connectToHotspotWifi(hotspotInfo)
      this.hotspotConnectionTimeout = null
    }, TIMING.HOTSPOT_CONNECT_DELAY_MS)
  }

  /**
   * Handle hotspot error event
   */
  private handleHotspotError = (eventData: any): void => {
    console.error("[GallerySyncService] Hotspot error:", eventData)

    const store = useGallerySyncStore.getState()

    if (this.hotspotConnectionTimeout) {
      clearTimeout(this.hotspotConnectionTimeout)
      this.hotspotConnectionTimeout = null
    }

    store.setSyncError(eventData.error_message || "Failed to start hotspot")
    gallerySyncNotifications.showSyncError("Failed to start hotspot")
  }

  /**
   * Start the sync process
   */
  async startSync(): Promise<void> {
    const store = useGallerySyncStore.getState()
    const glassesStore = useGlassesStore.getState()

    // Check if already syncing
    if (store.syncState === "syncing" || store.syncState === "connecting_wifi") {
      console.log("[GallerySyncService] Already syncing, ignoring start request")
      return
    }

    // Check if glasses are connected
    if (!glassesStore.connected) {
      store.setSyncError("Glasses not connected")
      return
    }

    console.log("[GallerySyncService] Starting sync...")

    // Request notification permission early so user isn't interrupted during WiFi setup
    await gallerySyncNotifications.requestPermissions()

    // Reset abort controller
    this.abortController = new AbortController()

    // Check if already connected to hotspot
    const isAlreadyConnected = glassesStore.hotspotEnabled && glassesStore.hotspotGatewayIp

    if (isAlreadyConnected) {
      console.log("[GallerySyncService] Already connected to hotspot, starting download directly")
      const hotspotInfo: HotspotInfo = {
        ssid: glassesStore.hotspotSsid,
        password: glassesStore.hotspotPassword,
        ip: glassesStore.hotspotGatewayIp,
      }
      store.setHotspotInfo(hotspotInfo)
      store.setSyncState("connecting_wifi")
      await this.startFileDownload(hotspotInfo)
      return
    }

    // Request hotspot
    store.setRequestingHotspot()
    store.setSyncServiceOpenedHotspot(true)

    // Set timeout for hotspot request - if we don't get a response, fail gracefully
    this.hotspotRequestTimeout = setTimeout(() => {
      const currentStore = useGallerySyncStore.getState()
      if (currentStore.syncState === "requesting_hotspot") {
        console.error("[GallerySyncService] Hotspot request timed out")
        currentStore.setSyncError("Hotspot request timed out")
        currentStore.setSyncServiceOpenedHotspot(false)
        gallerySyncNotifications.showSyncError("Could not start hotspot - please try again")
      }
      this.hotspotRequestTimeout = null
    }, TIMING.HOTSPOT_REQUEST_TIMEOUT_MS)

    try {
      await CoreModule.setHotspotState(true)
      console.log("[GallerySyncService] Hotspot requested")
    } catch (error) {
      // Clear the timeout since we got an immediate error
      if (this.hotspotRequestTimeout) {
        clearTimeout(this.hotspotRequestTimeout)
        this.hotspotRequestTimeout = null
      }
      console.error("[GallerySyncService] Failed to request hotspot:", error)
      store.setSyncError("Failed to start hotspot")
      store.setSyncServiceOpenedHotspot(false)
    }
  }

  /**
   * Connect to hotspot WiFi
   */
  private async connectToHotspotWifi(hotspotInfo: HotspotInfo): Promise<void> {
    const store = useGallerySyncStore.getState()

    console.log(`[GallerySyncService] Connecting to WiFi: ${hotspotInfo.ssid}`)
    store.setSyncState("connecting_wifi")

    try {
      await WifiManager.connectToProtectedSSID(hotspotInfo.ssid, hotspotInfo.password, false, false)
      console.log("[GallerySyncService] Connected to hotspot WiFi")

      // Start the actual download
      await this.startFileDownload(hotspotInfo)
    } catch (error: any) {
      console.error("[GallerySyncService] WiFi connection failed:", error)

      if (error?.code === "userDenied" || error?.message?.includes("cancel")) {
        store.setSyncError("WiFi connection cancelled")
      } else {
        store.setSyncError(error?.message || "Failed to connect to glasses WiFi")
      }

      // Close hotspot if we opened it
      if (store.syncServiceOpenedHotspot) {
        await this.closeHotspot()
      }
    }
  }

  /**
   * Start downloading files
   */
  private async startFileDownload(hotspotInfo: HotspotInfo): Promise<void> {
    const store = useGallerySyncStore.getState()

    console.log(`[GallerySyncService] Starting file download from ${hotspotInfo.ip}`)

    try {
      // Set up the API client
      asgCameraApi.setServer(hotspotInfo.ip, 8089)

      // Get sync state and files to download
      const syncState = await localStorageService.getSyncState()
      const syncResponse = await asgCameraApi.syncWithServer(syncState.client_id, syncState.last_sync_time, true)

      const syncData = syncResponse.data || syncResponse

      if (!syncData.changed_files || syncData.changed_files.length === 0) {
        console.log("[GallerySyncService] No files to sync")
        store.setSyncComplete()
        await this.onSyncComplete(0, 0)
        return
      }

      const filesToSync = syncData.changed_files
      console.log(`[GallerySyncService] Found ${filesToSync.length} files to sync`)

      // Update store with files
      store.setSyncing(filesToSync)

      // Save queue for resume capability
      await localStorageService.saveSyncQueue({
        files: filesToSync,
        currentIndex: 0,
        startedAt: Date.now(),
        hotspotInfo,
      })

      // Show notification
      await gallerySyncNotifications.showSyncStarted(filesToSync.length)

      // Execute the download
      await this.executeDownload(filesToSync, syncData.server_time)
    } catch (error: any) {
      console.error("[GallerySyncService] Failed to start download:", error)
      store.setSyncError(error?.message || "Failed to start download")
      await gallerySyncNotifications.showSyncError("Failed to start download")

      if (store.syncServiceOpenedHotspot) {
        await this.closeHotspot()
      }
    }
  }

  /**
   * Execute the actual file download
   */
  private async executeDownload(files: PhotoInfo[], serverTime: number): Promise<void> {
    const store = useGallerySyncStore.getState()
    const settingsStore = useSettingsStore.getState()
    const defaultWearable = settingsStore.getSetting(SETTINGS.default_wearable.key)

    let downloadedCount = 0
    let failedCount = 0

    try {
      const downloadResult = await asgCameraApi.batchSyncFiles(
        files,
        true,
        (current, total, fileName, fileProgress) => {
          // Check if cancelled
          if (this.abortController?.signal.aborted) {
            throw new Error("Sync cancelled")
          }

          // Update store
          const currentStore = useGallerySyncStore.getState()

          if (fileProgress === 0 || fileProgress === undefined) {
            // Starting a new file
            currentStore.setCurrentFile(fileName, 0)
          } else {
            currentStore.onFileProgress(fileName, fileProgress || 0)
          }

          // Mark previous file as complete when moving to next
          if (fileProgress === 0 && current > 1) {
            const previousFileName = files[current - 2]?.name
            if (previousFileName) {
              currentStore.onFileComplete(previousFileName)
              // Persist queue index so we can resume from here if app is killed
              localStorageService.updateSyncQueueIndex(current - 1).catch(err => {
                console.error("[GallerySyncService] Failed to persist queue index:", err)
              })
            }
          }

          // Update notification
          gallerySyncNotifications.updateProgress(current, total, fileName, fileProgress || 0)
        },
      )

      downloadedCount = downloadResult.downloaded.length
      failedCount = downloadResult.failed.length

      // Mark the last file as complete (if any files were downloaded)
      if (downloadResult.downloaded.length > 0) {
        const lastFileName = downloadResult.downloaded[downloadResult.downloaded.length - 1]?.name
        if (lastFileName) {
          const currentStore = useGallerySyncStore.getState()
          currentStore.onFileComplete(lastFileName)
        }
      }

      // Save downloaded files metadata
      for (const photoInfo of downloadResult.downloaded) {
        const downloadedFile = localStorageService.convertToDownloadedFile(
          photoInfo,
          photoInfo.filePath || "",
          photoInfo.thumbnailPath,
          defaultWearable,
        )
        await localStorageService.saveDownloadedFile(downloadedFile)
      }

      // Update queue index to final position
      await localStorageService.updateSyncQueueIndex(files.length)

      // Mark failed files in store
      for (const failedFileName of downloadResult.failed) {
        const currentStore = useGallerySyncStore.getState()
        currentStore.onFileFailed(failedFileName)
      }

      // Auto-save to camera roll if enabled
      await this.autoSaveToCameraRoll(downloadResult.downloaded)

      // Update sync state
      const currentSyncState = await localStorageService.getSyncState()
      await localStorageService.updateSyncState({
        last_sync_time: serverTime,
        total_downloaded: currentSyncState.total_downloaded + downloadedCount,
        total_size: currentSyncState.total_size + downloadResult.total_size,
      })

      // Complete
      store.setSyncComplete()
      await this.onSyncComplete(downloadedCount, failedCount)
    } catch (error: any) {
      if (error?.message === "Sync cancelled") {
        console.log("[GallerySyncService] Sync was cancelled")
        store.setSyncCancelled()
        await gallerySyncNotifications.showSyncCancelled()
      } else {
        console.error("[GallerySyncService] Download failed:", error)
        store.setSyncError(error?.message || "Download failed")
        await gallerySyncNotifications.showSyncError(error?.message || "Download failed")
      }

      if (store.syncServiceOpenedHotspot) {
        await this.closeHotspot()
      }
    }
  }

  /**
   * Auto-save downloaded files to camera roll
   * Files are sorted chronologically (oldest first) before saving so gallery apps
   * display them in correct capture order (gallery apps sort by "date added" to MediaStore)
   */
  private async autoSaveToCameraRoll(downloadedFiles: PhotoInfo[]): Promise<void> {
    const shouldAutoSave = await gallerySettingsService.getAutoSaveToCameraRoll()
    if (!shouldAutoSave || downloadedFiles.length === 0) return

    console.log(
      `[GallerySyncService] Auto-saving ${downloadedFiles.length} files to camera roll in chronological order...`,
    )

    const hasPermission = await MediaLibraryPermissions.checkPermission()
    if (!hasPermission) {
      const granted = await MediaLibraryPermissions.requestPermission()
      if (!granted) {
        console.warn("[GallerySyncService] Camera roll permission denied")
        return
      }
    }

    // CRITICAL: Sort all downloaded files by capture time BEFORE saving to gallery
    // This ensures gallery displays them in chronological order, not download order
    // (photos download first by size, videos second, but we want chronological capture order)
    const sortedFiles = [...downloadedFiles].sort((a, b) => {
      // Parse capture timestamps - handle both string and number formats
      const timeA = typeof a.modified === "string" ? parseInt(a.modified, 10) : a.modified || Number.MAX_SAFE_INTEGER
      const timeB = typeof b.modified === "string" ? parseInt(b.modified, 10) : b.modified || Number.MAX_SAFE_INTEGER

      // Sort oldest first (ascending) so they're added to gallery in chronological order
      return timeA - timeB
    })

    console.log(`[GallerySyncService] Sorted ${sortedFiles.length} files by capture time:`)
    sortedFiles.slice(0, 5).forEach((file, idx) => {
      const captureTime = typeof file.modified === "string" ? parseInt(file.modified, 10) : file.modified || 0
      const captureDate = new Date(captureTime)
      const fileType = file.is_video ? "video" : "photo"
      console.log(`  ${idx + 1}. ${file.name} - ${captureDate.toISOString()} (${fileType})`)
    })
    if (sortedFiles.length > 5) {
      console.log(`  ... and ${sortedFiles.length - 5} more files`)
    }

    let savedCount = 0
    let failedCount = 0

    // Save files in chronological order (oldest first)
    for (const photoInfo of sortedFiles) {
      const filePath = photoInfo.filePath || localStorageService.getPhotoFilePath(photoInfo.name)

      // Parse the capture timestamp from the photo metadata
      // The 'modified' field contains the original capture time from the glasses
      let captureTime: number | undefined
      if (photoInfo.modified) {
        captureTime = typeof photoInfo.modified === "string" ? parseInt(photoInfo.modified, 10) : photoInfo.modified
        if (isNaN(captureTime)) {
          console.warn(`[GallerySyncService] Invalid modified timestamp for ${photoInfo.name}:`, photoInfo.modified)
          captureTime = undefined
        }
      }

      // Save to camera roll with capture time for logging
      const success = await MediaLibraryPermissions.saveToLibrary(filePath, captureTime)
      if (success) {
        savedCount++
      } else {
        failedCount++
      }
    }

    console.log(
      `[GallerySyncService] Saved ${savedCount}/${sortedFiles.length} files to camera roll in chronological order`,
    )
    if (failedCount > 0) {
      console.warn(`[GallerySyncService] Failed to save ${failedCount} files to camera roll`)
    }
  }

  /**
   * Handle sync completion
   */
  private async onSyncComplete(downloadedCount: number, failedCount: number): Promise<void> {
    console.log(`[GallerySyncService] Sync complete: ${downloadedCount} downloaded, ${failedCount} failed`)

    // Clear the queue
    await localStorageService.clearSyncQueue()

    // Show completion notification
    await gallerySyncNotifications.showSyncComplete(downloadedCount, failedCount)

    // Close hotspot if we opened it
    const store = useGallerySyncStore.getState()
    if (store.syncServiceOpenedHotspot) {
      await this.closeHotspot()
    }

    // Clear glasses gallery status since files are now synced
    store.clearGlassesGalleryStatus()
  }

  /**
   * Cancel the current sync
   */
  async cancelSync(): Promise<void> {
    console.log("[GallerySyncService] Cancelling sync...")

    // Abort any ongoing downloads
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    // Clear timeout
    if (this.hotspotConnectionTimeout) {
      clearTimeout(this.hotspotConnectionTimeout)
      this.hotspotConnectionTimeout = null
    }

    const store = useGallerySyncStore.getState()

    // Close hotspot if we opened it
    if (store.syncServiceOpenedHotspot) {
      await this.closeHotspot()
    }

    // Update store
    store.setSyncCancelled()

    // Clear queue
    await localStorageService.clearSyncQueue()

    // Dismiss notification
    await gallerySyncNotifications.showSyncCancelled()
  }

  /**
   * Close the hotspot
   */
  private async closeHotspot(): Promise<void> {
    const store = useGallerySyncStore.getState()

    try {
      console.log("[GallerySyncService] Closing hotspot...")
      await CoreModule.setHotspotState(false)
      store.setSyncServiceOpenedHotspot(false)
      store.setHotspotInfo(null)
      console.log("[GallerySyncService] Hotspot closed")
    } catch (error) {
      console.error("[GallerySyncService] Failed to close hotspot:", error)
    }
  }

  /**
   * Check for resumable sync on app start
   */
  async checkForResumableSync(): Promise<boolean> {
    const hasResumable = await localStorageService.hasResumableSyncQueue()

    if (hasResumable) {
      console.log("[GallerySyncService] Found resumable sync queue")
      // Don't auto-resume - let user decide
      // Could emit an event here for UI to show "Resume sync?" prompt
    }

    return hasResumable
  }

  /**
   * Resume a previously interrupted sync
   */
  async resumeSync(): Promise<void> {
    const queue = await localStorageService.getSyncQueue()

    if (!queue || queue.currentIndex >= queue.files.length) {
      console.log("[GallerySyncService] No queue to resume")
      await localStorageService.clearSyncQueue()
      return
    }

    // Check if queue is too old - hotspot auto-disables after 40s of inactivity,
    // so stale queues can't be resumed (hotspot credentials are no longer valid)
    const queueAge = Date.now() - queue.startedAt
    if (queueAge > TIMING.MAX_QUEUE_AGE_MS) {
      console.log(`[GallerySyncService] Queue too old (${Math.round(queueAge / 1000)}s) - clearing stale queue`)
      await localStorageService.clearSyncQueue()
      // Don't auto-start - let user tap sync button if they want to continue
      return
    }

    console.log(`[GallerySyncService] Resuming sync from file ${queue.currentIndex + 1}/${queue.files.length}`)

    const store = useGallerySyncStore.getState()
    const remainingFiles = queue.files.slice(queue.currentIndex)

    // Reset abort controller so cancellation works for resumed syncs
    this.abortController = new AbortController()

    // Set up state
    store.setHotspotInfo(queue.hotspotInfo)
    store.setSyncing(remainingFiles)

    // Try to connect and resume
    await this.connectToHotspotWifi(queue.hotspotInfo)
  }

  /**
   * Query glasses for gallery status
   */
  async queryGlassesGalleryStatus(): Promise<void> {
    try {
      await CoreModule.queryGalleryStatus()
    } catch (error) {
      console.error("[GallerySyncService] Failed to query gallery status:", error)
    }
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncing(): boolean {
    const store = useGallerySyncStore.getState()
    return (
      store.syncState === "syncing" || store.syncState === "connecting_wifi" || store.syncState === "requesting_hotspot"
    )
  }
}

export const gallerySyncService = GallerySyncService.getInstance()
