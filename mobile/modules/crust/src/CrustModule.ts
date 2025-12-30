import {NativeModule, requireNativeModule} from "expo"

import {CrustModuleEvents} from "./Crust.types"

declare class CrustModule extends NativeModule<CrustModuleEvents> {

  // Android-specific commands
  getInstalledApps(): Promise<any>
  hasNotificationListenerPermission(): Promise<boolean>

  // Notification management
  getInstalledAppsForNotifications(): Promise<
    Array<{
      packageName: string
      appName: string
      isBlocked: boolean
      icon: string | null
    }>
  >

  // Media Library Commands
  saveToGalleryWithDate(
    filePath: string,
    captureTimeMillis?: number,
  ): Promise<{
    success: boolean
    uri?: string
    identifier?: string
    error?: string
  }>
}

// This call loads the native module object from the JSI.
export default requireNativeModule<CrustModule>("Crust")
