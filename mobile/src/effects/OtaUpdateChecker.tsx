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
    const response = await fetch(url)
    if (!response.ok) {
      console.error("Failed to fetch version info:", response.status)
      return null
    }
    return await response.json()
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
 */
export function findMatchingMtkPatch(
  patches: MtkPatch[] | undefined,
  currentVersion: string | undefined,
): MtkPatch | null {
  if (!patches || !currentVersion) {
    return null
  }
  // MTK requires sequential updates - find the patch that starts from current version
  return patches.find((p) => p.start_firmware === currentVersion) || null
}

/**
 * Check if BES firmware update is available.
 * BES does not require sequential updates - can install any newer version directly.
 */
export function checkBesUpdate(besFirmware: BesFirmware | undefined, currentVersion: string | undefined): boolean {
  if (!besFirmware || !currentVersion) {
    return false
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
    const versionJson = await fetchVersionInfo(otaVersionUrl)
    const latestVersionInfo = getLatestVersionInfo(versionJson)

    // Check APK update
    const apkUpdateAvailable = checkVersionUpdateAvailable(currentBuildNumber, versionJson)

    // Check firmware patches
    const mtkPatch = findMatchingMtkPatch(versionJson?.mtk_patches, currentMtkVersion)
    const besUpdateAvailable = checkBesUpdate(versionJson?.bes_firmware, currentBesVersion)

    // Build updates array
    const updates: string[] = []
    if (apkUpdateAvailable) updates.push("apk")
    if (mtkPatch) updates.push("mtk")
    if (besUpdateAvailable) updates.push("bes")

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
  const [dismissedVersion, setDismissedVersion] = useSetting<string>(SETTINGS.dismissed_ota_version.key)
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

  // Track if we've already checked this session to avoid repeated prompts
  const hasCheckedOta = useRef(false)

  useEffect(() => {
    // only check if we're on the home screen:
    if (pathname !== "/home") return

    // OTA check (only for WiFi-capable glasses)
    if (hasCheckedOta.current) return
    if (!glassesConnected || !otaVersionUrl || !buildNumber) return

    const features: Capabilities = getModelCapabilities(defaultWearable)
    if (!features?.hasWifi) return

    checkForOtaUpdate(otaVersionUrl, buildNumber, mtkFwVersion, besFwVersion).then(
      ({updateAvailable, latestVersionInfo, updates}) => {
        if (!updateAvailable || !latestVersionInfo) return

        // Skip if user already dismissed this version
        if (dismissedVersion === latestVersionInfo.versionCode?.toString()) return

        hasCheckedOta.current = true

        const deviceName = defaultWearable || "Glasses"
        const updateList = updates.join(", ").toUpperCase() // "APK, MTK, BES"
        const updateMessage = `Updates available: ${updateList}\n\n${translate("ota:updateReadyToInstall", {version: latestVersionInfo.versionCode, deviceName})}`

        if (glassesWifiConnected) {
          // WiFi connected - go straight to OTA check screen
          showAlert(translate("ota:updateAvailable", {deviceName}), updateMessage, [
            {
              text: translate("ota:updateLater"),
              style: "cancel",
              onPress: () => setDismissedVersion(latestVersionInfo.versionCode?.toString() ?? ""),
            },
            {text: translate("ota:install"), onPress: () => push("/ota/check-for-updates")},
          ])
        } else {
          // No WiFi - prompt to connect
          const wifiMessage = `Updates available: ${updateList}\n\n${translate("ota:updateConnectWifi", {deviceName})}`
          showAlert(translate("ota:updateAvailable", {deviceName}), wifiMessage, [
            {
              text: translate("ota:updateLater"),
              style: "cancel",
              onPress: () => setDismissedVersion(latestVersionInfo.versionCode?.toString() ?? ""),
            },
            {text: translate("ota:setupWifi"), onPress: () => push("/wifi/scan")},
          ])
        }
      },
    )
  }, [
    glassesConnected,
    otaVersionUrl,
    buildNumber,
    glassesWifiConnected,
    dismissedVersion,
    defaultWearable,
    setDismissedVersion,
    pathname,
  ])

  return null
}
