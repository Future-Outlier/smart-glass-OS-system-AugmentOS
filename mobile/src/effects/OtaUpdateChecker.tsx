import {Capabilities, getModelCapabilities} from "@/../../cloud/packages/types/src"
import {useEffect, useRef} from "react"

import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS, useSetting} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n/translate"
import {usePathname} from "expo-router"

export interface VersionInfo {
  versionCode: number
  versionName: string
  downloadUrl: string
  apkSize: number
  sha256: string
  releaseNotes: string
}

export interface MtkPatch {
  start_firmware: string
  end_firmware: string
  url: string
}

export interface BesFirmware {
  version: string
  url: string
}

interface VersionJson {
  apps?: {
    [packageName: string]: VersionInfo
  }
  mtk_patches?: MtkPatch[]
  bes_firmware?: BesFirmware
  // Legacy format support
  versionCode?: number
  versionName?: string
  downloadUrl?: string
  apkSize?: number
  sha256?: string
  releaseNotes?: string
}

export async function fetchVersionInfo(url: string): Promise<VersionJson | null> {
  try {
    console.log("📱 Fetching version info from URL: " + url)
    const response = await fetch(url)
    if (!response.ok) {
      console.error("Failed to fetch version info:", response.status)
      return null
    }
    const versionJson = await response.json()
    console.log("📱 versionInfo: " + JSON.stringify(versionJson))
    return versionJson
  } catch (error) {
    console.error("Error fetching version info:", error)
    return null
  }
}

export function checkVersionUpdateAvailable(
  currentBuildNumber: string | undefined,
  versionJson: VersionJson | null,
): boolean {
  if (!currentBuildNumber || !versionJson) {
    return false
  }

  const currentVersion = parseInt(currentBuildNumber, 10)
  if (isNaN(currentVersion)) {
    return false
  }

  let serverVersion: number | undefined

  // Check new format first
  if (versionJson.apps?.["com.mentra.asg_client"]) {
    serverVersion = versionJson.apps["com.mentra.asg_client"].versionCode
  } else if (versionJson.versionCode) {
    // Legacy format
    serverVersion = versionJson.versionCode
  }

  if (!serverVersion || isNaN(serverVersion)) {
    return false
  }

  return serverVersion > currentVersion
}

export function getLatestVersionInfo(versionJson: VersionJson | null): VersionInfo | null {
  if (!versionJson) {
    return null
  }

  // Check new format first
  if (versionJson.apps?.["com.mentra.asg_client"]) {
    return versionJson.apps["com.mentra.asg_client"]
  }

  // Legacy format
  if (versionJson.versionCode) {
    return {
      versionCode: versionJson.versionCode,
      versionName: versionJson.versionName || "",
      downloadUrl: versionJson.downloadUrl || "",
      apkSize: versionJson.apkSize || 0,
      sha256: versionJson.sha256 || "",
      releaseNotes: versionJson.releaseNotes || "",
    }
  }

  return null
}

/**
 * Find MTK firmware patch matching the current version.
 * MTK requires sequential updates - must find patch starting from current version.
 *
 * Handles format mismatch between:
 * - Server format: "MentraLive_20260113" (with prefix)
 * - Glasses format: "20260113" (just date)
 */
export function findMatchingMtkPatch(
  patches: MtkPatch[] | undefined,
  currentVersion: string | undefined,
): MtkPatch | null {
  if (!patches || !currentVersion) {
    return null
  }

  // MTK requires sequential updates - find the patch that starts from current version
  // Handle format mismatch: server uses "MentraLive_YYYYMMDD", glasses report "YYYYMMDD"
  return (
    patches.find((p) => {
      // Exact match first
      if (p.start_firmware === currentVersion) {
        return true
      }
      // Extract date from server format (e.g., "MentraLive_20260113" -> "20260113")
      const serverDate = p.start_firmware.includes("_") ? p.start_firmware.split("_").pop() : p.start_firmware
      // Compare extracted date with glasses version
      return serverDate === currentVersion
    }) || null
  )
}

/**
 * Check if BES firmware update is available.
 * BES does not require sequential updates - can install any newer version directly.
 * If current version is unknown, assume update is needed.
 */
export function checkBesUpdate(besFirmware: BesFirmware | undefined, currentVersion: string | undefined): boolean {
  if (!besFirmware) {
    return false
  }

  // If current version is unknown, assume we need to update
  if (!currentVersion) {
    console.log("📱 BES current version unknown - will suggest update to server version: " + besFirmware.version)
    return true
  }
  // BES does not require sequential updates - can install any newer version directly
  return compareVersions(besFirmware.version, currentVersion) > 0
}

/**
 * Compare two version strings.
 * Supports formats like "17.26.1.14" (BES) or "20241130" (MTK date format).
 */
function compareVersions(version1: string, version2: string): number {
  // For dotted versions like "17.26.1.14", split and compare each component
  if (version1.includes(".") && version2.includes(".")) {
    const parts1 = version1.split(".")
    const parts2 = version2.split(".")
    const maxLen = Math.max(parts1.length, parts2.length)

    for (let i = 0; i < maxLen; i++) {
      const v1 = i < parts1.length ? parseInt(parts1[i], 10) : 0
      const v2 = i < parts2.length ? parseInt(parts2[i], 10) : 0
      if (v1 !== v2) {
        return v1 - v2
      }
    }
    return 0
  } else {
    // For date format or simple strings, use lexicographic comparison
    return version1.localeCompare(version2)
  }
}

interface OtaUpdateAvailable {
  hasCheckCompleted: boolean
  updateAvailable: boolean
  latestVersionInfo: VersionInfo | null
  updates: string[] // ["apk", "mtk", "bes"]
  mtkPatch: MtkPatch | null
  besVersion: string | null
}

export async function checkForOtaUpdate(
  otaVersionUrl: string,
  currentBuildNumber: string,
  currentMtkVersion?: string, // MTK firmware version (e.g., "20241130")
  currentBesVersion?: string, // BES firmware version (e.g., "17.26.1.14")
): Promise<OtaUpdateAvailable> {
  try {
    console.log("📱 Checking for OTA update - URL: " + otaVersionUrl + ", current build: " + currentBuildNumber)
    const versionJson = await fetchVersionInfo(otaVersionUrl)
    const latestVersionInfo = getLatestVersionInfo(versionJson)

    // Check APK update
    const apkUpdateAvailable = checkVersionUpdateAvailable(currentBuildNumber, versionJson)
    console.log(`📱 APK update available: ${apkUpdateAvailable} (current: ${currentBuildNumber})`)

    // Check firmware patches
    const mtkPatch = findMatchingMtkPatch(versionJson?.mtk_patches, currentMtkVersion)
    console.log(`📱 MTK patch available: ${mtkPatch ? "yes" : "no"} (current MTK: ${currentMtkVersion || "unknown"})`)

    const besUpdateAvailable = checkBesUpdate(versionJson?.bes_firmware, currentBesVersion)
    console.log(`📱 BES update available: ${besUpdateAvailable} (current BES: ${currentBesVersion || "unknown"})`)

    // Build updates array
    const updates: string[] = []
    if (apkUpdateAvailable) updates.push("apk")
    if (mtkPatch) updates.push("mtk")
    if (besUpdateAvailable) updates.push("bes")

    console.log(`📱 OTA check result - updates available: ${updates.length > 0}, updates: [${updates.join(", ")}]`)

    return {
      hasCheckCompleted: true,
      updateAvailable: updates.length > 0,
      latestVersionInfo: latestVersionInfo,
      updates: updates,
      mtkPatch: mtkPatch,
      besVersion: versionJson?.bes_firmware?.version || null,
    }
  } catch (error) {
    console.error("Error checking for OTA update:", error)
    return {
      hasCheckCompleted: false,
      updateAvailable: false,
      latestVersionInfo: null,
      updates: [],
      mtkPatch: null,
      besVersion: null,
    }
  }
}

// export function OtaUpdateChecker() {
//   const [isChecking, setIsChecking] = useState(false)
//   const [hasChecked, setHasChecked] = useState(false)
//   const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
//   const {push} = useNavigationHistory()
//   // Extract only the specific values we need to watch to avoid re-renders
//   const glassesModel = useGlassesStore(state => state.modelName)
//   const otaVersionUrl = useGlassesStore(state => state.otaVersionUrl)
//   const currentBuildNumber = useGlassesStore(state => state.buildNumber)
//   const glassesWifiConnected = useGlassesStore(state => state.wifiConnected)

//   useEffect(() => {
//     // Only check for glasses that support WiFi self OTA updates
//     if (!glassesModel) {
//       return
//     }
//     const features: Capabilities = getModelCapabilities(defaultWearable)
//     if (!features || !features.hasWifi) {
//       return
//     }
//     if (!otaVersionUrl || !currentBuildNumber) {
//       return
//     }
//     const asyncCheckForOtaUpdate = async () => {
//       setIsChecking(true)
//       let {hasCheckCompleted, updateAvailable, latestVersionInfo} = await checkForOtaUpdate(
//         otaVersionUrl,
//         currentBuildNumber,
//       )
//       if (hasCheckCompleted) {
//         setHasChecked(true)
//       }
//       if (updateAvailable) {
//         showAlert(
//           "Update Available",
//           `An update for your glasses is available (v${
//             latestVersionInfo?.versionCode || "Unknown"
//           }).\n\nConnect your glasses to WiFi to automatically install the update.`,
//           [
//             {
//               text: "Later",
//               style: "cancel",
//             },
//             {
//               text: "Setup WiFi",
//               onPress: () => {
//                 push("/wifi/scan")
//               },
//             },
//           ],
//         )
//       }
//       setHasChecked(true)
//     }
//     asyncCheckForOtaUpdate()
//   }, [glassesModel, otaVersionUrl, currentBuildNumber, glassesWifiConnected, hasChecked, isChecking])
//   return null
// }

export function OtaUpdateChecker() {
  const {push} = useNavigationHistory()
  const pathname = usePathname()

  // OTA check state from glasses store
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const otaVersionUrl = useGlassesStore((state) => state.otaVersionUrl)
  const buildNumber = useGlassesStore((state) => state.buildNumber)
  const glassesWifiConnected = useGlassesStore((state) => state.wifiConnected)
  const mtkFwVersion = useGlassesStore((state) => state.mtkFwVersion)
  const besFwVersion = useGlassesStore((state) => state.besFwVersion)

  // Track OTA check state:
  // - hasCheckedOta: whether we've done the initial check
  // - pendingUpdate: cached update info when WiFi wasn't connected
  const hasCheckedOta = useRef(false)
  const pendingUpdate = useRef<{
    latestVersionInfo: VersionInfo
    updates: string[]
  } | null>(null)
  const otaCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reset OTA check flag when glasses disconnect (allows fresh check on reconnect)
  useEffect(() => {
    if (!glassesConnected) {
      if (hasCheckedOta.current) {
        console.log("📱 OTA: Glasses disconnected - resetting check flag for next connection")
        hasCheckedOta.current = false
        pendingUpdate.current = null
      }
      // Clear any pending OTA check timeout
      if (otaCheckTimeoutRef.current) {
        clearTimeout(otaCheckTimeoutRef.current)
        otaCheckTimeoutRef.current = null
      }
      // Clear MTK session flag on disconnect (glasses rebooted, new version now active)
      const mtkWasUpdated = useGlassesStore.getState().mtkUpdatedThisSession
      if (mtkWasUpdated) {
        console.log("📱 OTA: Clearing MTK session flag - glasses disconnected (likely rebooted)")
        useGlassesStore.getState().setMtkUpdatedThisSession(false)
      }
    }
  }, [glassesConnected])

  // Effect to show install prompt when WiFi connects after pending update
  useEffect(() => {
    if (pathname !== "/home") return
    if (!glassesConnected) return // Verify glasses still connected
    if (!glassesWifiConnected) return
    if (!pendingUpdate.current) return

    const {updates} = pendingUpdate.current
    const deviceName = defaultWearable || "Glasses"
    const updateList = updates.join(", ").toUpperCase()
    const updateMessage = `Updates available: ${updateList}`

    console.log("📱 WiFi connected - showing pending OTA update prompt")

    // Clear pending update before showing alert to prevent re-triggering
    pendingUpdate.current = null

    showAlert(translate("ota:updateAvailable", {deviceName}), updateMessage, [
      {
        text: translate("ota:updateLater"),
        style: "cancel",
      },
      {text: translate("ota:install"), onPress: () => push("/ota/check-for-updates")},
    ])
  }, [glassesConnected, glassesWifiConnected, pathname, defaultWearable, push])

  // Main OTA check effect
  useEffect(() => {
    // Log every effect run with full state for debugging
    console.log(
      `📱 OTA effect triggered - pathname: ${pathname}, hasChecked: ${hasCheckedOta.current}, connected: ${glassesConnected}, url: ${!!otaVersionUrl}, build: ${buildNumber}`,
    )

    // only check if we're on the home screen:
    if (pathname !== "/home") {
      return
    }

    // OTA check (only for WiFi-capable glasses)
    if (hasCheckedOta.current) {
      console.log("📱 OTA check skipped - already checked this session")
      return
    }
    if (!glassesConnected || !otaVersionUrl || !buildNumber) {
      console.log(
        `📱 OTA check skipped - missing data (connected: ${glassesConnected}, url: ${!!otaVersionUrl}, build: ${buildNumber})`,
      )
      return
    }

    const features: Capabilities = getModelCapabilities(defaultWearable)
    if (!features?.hasWifi) {
      console.log("📱 OTA check skipped - device doesn't have WiFi capability")
      return
    }

    // Clear any existing timeout
    if (otaCheckTimeoutRef.current) {
      clearTimeout(otaCheckTimeoutRef.current)
    }

    // Delay OTA check by 500ms to allow all version_info chunks to arrive
    // (version_info_1, version_info_2, version_info_3 arrive sequentially with ~100ms gaps)
    console.log("📱 OTA check scheduled - waiting 500ms for firmware version info...")
    otaCheckTimeoutRef.current = setTimeout(() => {
      // Re-check conditions after delay (glasses might have disconnected)
      if (!useGlassesStore.getState().connected) {
        console.log("📱 OTA check cancelled - glasses disconnected during delay")
        return
      }
      if (hasCheckedOta.current) {
        console.log("📱 OTA check cancelled - already checked")
        return
      }

      // Get latest firmware versions from store (they may have arrived during delay)
      const latestMtkFwVersion = useGlassesStore.getState().mtkFwVersion
      const latestBesFwVersion = useGlassesStore.getState().besFwVersion

      console.log(
        `📱 OTA check starting (MTK: ${latestMtkFwVersion || "unknown"}, BES: ${latestBesFwVersion || "unknown"})`,
      )
      hasCheckedOta.current = true // Mark as checked to prevent duplicate checks

      checkForOtaUpdate(otaVersionUrl, buildNumber, latestMtkFwVersion, latestBesFwVersion)
        .then(({updateAvailable, latestVersionInfo, updates}) => {
          console.log(
            `📱 OTA check completed - updateAvailable: ${updateAvailable}, updates: ${updates?.join(", ") || "none"}`,
          )

          // Filter out MTK if it was already updated this session (A/B updates don't change version until reboot)
          const mtkUpdatedThisSession = useGlassesStore.getState().mtkUpdatedThisSession
          let filteredUpdates = updates
          if (mtkUpdatedThisSession && updates.includes("mtk")) {
            console.log("📱 OTA: Filtering out MTK - already updated this session (pending reboot)")
            filteredUpdates = updates.filter((u) => u !== "mtk")
          }

          if (filteredUpdates.length === 0 || !latestVersionInfo) {
            console.log("📱 OTA check result: No updates available")
            return
          }

          // Verify glasses are still connected before showing alert
          const currentlyConnected = useGlassesStore.getState().connected
          if (!currentlyConnected) {
            console.log("📱 OTA update found but glasses disconnected - skipping alert")
            return
          }

          const deviceName = defaultWearable || "Glasses"
          const updateList = filteredUpdates.join(", ").toUpperCase() // "APK, MTK, BES"
          const updateMessage = `Updates available: ${updateList}`

          console.log(`📱 OTA showing alert - WiFi connected: ${glassesWifiConnected}, updates: ${updateList}`)

          if (glassesWifiConnected) {
            // WiFi connected - go to OTA check screen to confirm and start update
            showAlert(translate("ota:updateAvailable", {deviceName}), updateMessage, [
              {
                text: translate("ota:updateLater"),
                style: "cancel",
              },
              {text: translate("ota:install"), onPress: () => push("/ota/check-for-updates")},
            ])
          } else {
            // No WiFi - cache the update info and prompt to connect
            console.log("📱 Update available but WiFi not connected - caching for later")
            pendingUpdate.current = {latestVersionInfo, updates: filteredUpdates}

            const wifiMessage = `Updates available: ${updateList}\n\nConnect your ${deviceName} to WiFi to install.`
            showAlert(translate("ota:updateAvailable", {deviceName}), wifiMessage, [
              {
                text: translate("ota:updateLater"),
                style: "cancel",
                onPress: () => {
                  pendingUpdate.current = null // Clear pending on dismiss
                },
              },
              {text: translate("ota:setupWifi"), onPress: () => push("/wifi/scan")},
            ])
          }
        })
        .catch((error) => {
          console.log(`📱 OTA check failed with error: ${error?.message || error}`)
        })
    }, 500) // Delay to allow version_info_3 to arrive

    // Cleanup timeout on effect re-run or unmount
    return () => {
      if (otaCheckTimeoutRef.current) {
        clearTimeout(otaCheckTimeoutRef.current)
        otaCheckTimeoutRef.current = null
      }
    }
  }, [
    glassesConnected,
    otaVersionUrl,
    buildNumber,
    mtkFwVersion,
    besFwVersion,
    glassesWifiConnected,
    defaultWearable,
    pathname,
    push,
  ])

  return null
}
