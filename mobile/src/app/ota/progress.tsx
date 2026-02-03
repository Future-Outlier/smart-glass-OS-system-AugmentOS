import CoreModule from "core"
import {useEffect, useState, useRef, useCallback} from "react"
import {View, ActivityIndicator} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Screen, Header, Button, Text, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useGlassesStore} from "@/stores/glasses"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

type ProgressState =
  | "starting"
  | "downloading"
  | "installing"
  | "completed"
  | "failed"
  | "disconnected"
  | "restarting"
  | "wifi_disconnected"

const MAX_RETRIES = 3
const RETRY_INTERVAL_MS = 5000 // 5 seconds between retries

export default function OtaProgressScreen() {
  const {theme} = useAppTheme()
  const {replace, push} = useNavigationHistory()
  const otaProgress = useGlassesStore((state) => state.otaProgress)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const wifiConnected = useGlassesStore((state) => state.wifiConnected)
  const buildNumber = useGlassesStore((state) => state.buildNumber)

  const [progressState, setProgressState] = useState<ProgressState>("starting")
  const [retryCount, setRetryCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // DEBUG: Log otaProgress changes
  useEffect(() => {
    console.log("🔍 OTA DEBUG: otaProgress changed:", JSON.stringify(otaProgress, null, 2))
    console.log("🔍 OTA DEBUG: progressState:", progressState)
    console.log("🔍 OTA DEBUG: glassesConnected:", glassesConnected)
  }, [otaProgress, progressState, glassesConnected])

  // Track if we've received any progress from glasses
  const hasReceivedProgress = useRef(false)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track initial build number to detect successful install
  const initialBuildNumber = useRef<string | null>(null)

  focusEffectPreventBack()

  // DEBUG: Log component mount and clear stale OTA state
  useEffect(() => {
    console.log("🔍 OTA PROGRESS SCREEN MOUNTED")
    console.log("🔍 OTA MOUNT: Initial otaProgress =", JSON.stringify(otaProgress))
    console.log("🔍 OTA MOUNT: Initial progressState =", progressState)

    // Clear any stale OTA progress from previous attempts
    // This ensures we start fresh each time the screen mounts
    useGlassesStore.getState().setOtaProgress(null)

    return () => {
      console.log("🔍 OTA PROGRESS SCREEN UNMOUNTED")
    }
  }, [])

  // Capture initial build number on mount
  useEffect(() => {
    if (buildNumber && !initialBuildNumber.current) {
      initialBuildNumber.current = buildNumber
      console.log("OTA: Initial build number:", buildNumber)
    }
  }, [buildNumber])

  // Detect successful install by watching for build number increase after installing
  useEffect(() => {
    if (progressState !== "installing") return
    if (!buildNumber || !initialBuildNumber.current) return

    const currentVersion = parseInt(buildNumber, 10)
    const initialVersion = parseInt(initialBuildNumber.current, 10)

    if (!isNaN(currentVersion) && !isNaN(initialVersion) && currentVersion > initialVersion) {
      console.log(`OTA: Build number increased from ${initialVersion} to ${currentVersion} - install complete!`)
      setProgressState("completed")
    }
  }, [buildNumber, progressState])

  // Send OTA start command with retry logic
  const sendOtaStartCommand = useCallback(async () => {
    try {
      console.log(`OTA: Sending start command to glasses (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      await CoreModule.sendOtaStart()

      // Set up timeout to check if we received progress
      retryTimeoutRef.current = setTimeout(() => {
        if (!hasReceivedProgress.current && progressState === "starting") {
          if (retryCount < MAX_RETRIES - 1) {
            console.log("OTA: No progress received, retrying...")
            setRetryCount((prev) => prev + 1)
          } else {
            console.log("OTA: Max retries reached, failing")
            setErrorMessage("Unable to start update. Glasses did not respond.")
            setProgressState("failed")
          }
        }
      }, RETRY_INTERVAL_MS)
    } catch (error) {
      console.error("OTA: Failed to send start command:", error)
      if (retryCount < MAX_RETRIES - 1) {
        setRetryCount((prev) => prev + 1)
      } else {
        setErrorMessage("Failed to communicate with glasses.")
        setProgressState("failed")
      }
    }
  }, [retryCount, progressState])

  // Initial send and retry on count change
  useEffect(() => {
    // Don't retry if we've already received progress or completed/failed
    if (hasReceivedProgress.current || progressState !== "starting") return

    sendOtaStartCommand()

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [retryCount, sendOtaStartCommand, progressState])

  // Watch for BLE disconnection
  useEffect(() => {
    // Don't fail on disconnect during "installing" or "restarting" - glasses will reboot/power off
    // Only fail if we're in starting/downloading states
    if (
      !glassesConnected &&
      progressState !== "completed" &&
      progressState !== "failed" &&
      progressState !== "installing" &&
      progressState !== "restarting" &&
      progressState !== "disconnected"
    ) {
      console.log("OTA: Glasses disconnected during update")
      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      setErrorMessage("Glasses disconnected during update.")
      setProgressState("disconnected")
    }

    // If we're installing/restarting and disconnect, that's expected for MTK/BES updates
    if (!glassesConnected && (progressState === "installing" || progressState === "restarting")) {
      const updateType = otaProgress?.currentUpdate
      if (updateType === "mtk" || updateType === "bes") {
        console.log(`OTA: Glasses disconnected during ${updateType} update - expected behavior`)
        setProgressState("restarting")
      }
    }
  }, [glassesConnected, progressState, otaProgress?.currentUpdate])

  // Watch for WiFi disconnection during active download/install
  useEffect(() => {
    // Only trigger on WiFi disconnect during downloading or starting states
    // (installing state for MTK/BES may not need WiFi - data already on glasses)
    if (
      !wifiConnected &&
      (progressState === "downloading" || progressState === "starting") &&
      progressState !== "wifi_disconnected" &&
      progressState !== "failed" &&
      progressState !== "completed"
    ) {
      console.log("OTA: WiFi disconnected during download - showing WiFi disconnected state")
      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      setProgressState("wifi_disconnected")
    }
  }, [wifiConnected, progressState])

  // Track completion timeout to allow cleanup
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track MTK-only timeout (if MTK finishes but no BES follows)
  const mtkOnlyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track if we're waiting for MTK system install to complete
  const waitingForMtkComplete = useRef(false)

  // Listen for mtk_update_complete event from glasses (sent after system install finishes)
  useEffect(() => {
    const handleMtkUpdateComplete = (data: {message: string; timestamp: number}) => {
      console.log("OTA: Received mtk_update_complete event:", data.message)

      if (waitingForMtkComplete.current) {
        console.log("OTA: MTK system install complete - transitioning to completed state")
        waitingForMtkComplete.current = false

        // Mark MTK as updated this session
        useGlassesStore.getState().setMtkUpdatedThisSession(true)

        // Transition to completed state
        setProgressState("completed")
      }
    }

    GlobalEventEmitter.on("mtk_update_complete", handleMtkUpdateComplete)

    return () => {
      GlobalEventEmitter.off("mtk_update_complete", handleMtkUpdateComplete)
    }
  }, [])

  // Watch for OTA progress updates from glasses
  useEffect(() => {
    console.log("🔍 OTA EFFECT: otaProgress effect triggered, otaProgress =", otaProgress)
    if (!otaProgress) {
      console.log("🔍 OTA EFFECT: otaProgress is null, returning early")
      return
    }

    console.log(
      "🔍 OTA EFFECT: Processing - stage:",
      otaProgress.stage,
      "status:",
      otaProgress.status,
      "progress:",
      otaProgress.progress,
      "currentUpdate:",
      otaProgress.currentUpdate,
    )

    // Mark that we've received progress - stop retrying
    if (!hasReceivedProgress.current) {
      hasReceivedProgress.current = true
      console.log("🔍 OTA EFFECT: First progress received, stopping retries")
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }

    if (otaProgress.status === "STARTED" || otaProgress.status === "PROGRESS") {
      // Clear MTK-only timeout if BES starts
      if (mtkOnlyTimeoutRef.current && otaProgress.currentUpdate === "bes") {
        console.log("OTA: BES update started - clearing MTK-only timeout")
        clearTimeout(mtkOnlyTimeoutRef.current)
        mtkOnlyTimeoutRef.current = null
      }

      // MTK: Always show "Installing..." regardless of stage (no download progress shown)
      if (otaProgress.currentUpdate === "mtk") {
        console.log("🔍 OTA EFFECT: MTK update - always show installing state")
        setProgressState("installing")
      } else if (otaProgress.stage === "download") {
        console.log("🔍 OTA EFFECT: Setting progressState to 'downloading'")
        setProgressState("downloading")
      } else if (otaProgress.stage === "install") {
        console.log("🔍 OTA EFFECT: Setting progressState to 'installing'")
        setProgressState("installing")
      }
    } else if (otaProgress.status === "FINISHED") {
      const updateType = otaProgress.currentUpdate
      const stage = otaProgress.stage

      // MTK: Install FINISHED is sent after download completes (before system install starts)
      // Stay in "installing" state and wait for mtk_update_complete event
      if (updateType === "mtk") {
        if (stage === "install") {
          console.log("OTA: MTK install FINISHED received - waiting for mtk_update_complete from system")

          // Clear any existing timeout
          if (mtkOnlyTimeoutRef.current) {
            clearTimeout(mtkOnlyTimeoutRef.current)
          }

          // Mark that we're waiting for the system install to complete
          waitingForMtkComplete.current = true

          // Stay in installing state - will transition to completed when mtk_update_complete is received
          setProgressState("installing")
        }
        // Ignore download FINISHED - only care about install FINISHED
        return
      }

      if (updateType === "bes") {
        // Clear any pending MTK timeout
        if (mtkOnlyTimeoutRef.current) {
          clearTimeout(mtkOnlyTimeoutRef.current)
          mtkOnlyTimeoutRef.current = null
        }
        // BES has two phases: download (server→glasses) and install (glasses→BES chip)
        if (stage === "download") {
          // Download finished - now waiting for install phase
          console.log("🔍 OTA: BES download FINISHED - transitioning to install phase, waiting for install progress")
          // Stay in downloading state briefly, install progress should start soon
          // If no install progress comes, the glasses will send install FINISHED when BES reboots
        } else if (stage === "install") {
          // BES install finished - glasses will power off
          console.log("OTA: BES install FINISHED - glasses will power off")
          setProgressState("restarting")
        } else {
          console.log("🔍 OTA: BES FINISHED with unknown stage:", stage, "- going to restarting")
          setProgressState("restarting")
        }
      } else {
        // APK update - show completed after 10 seconds to allow installation
        console.log("OTA: APK install FINISHED - showing completed in 10 seconds")
        completionTimeoutRef.current = setTimeout(() => {
          setProgressState("completed")
        }, 12000)
      }
    } else if (otaProgress.status === "FAILED") {
      setErrorMessage(otaProgress.errorMessage || null)
      setProgressState("failed")
    }
  }, [otaProgress])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current)
      }
      if (mtkOnlyTimeoutRef.current) {
        clearTimeout(mtkOnlyTimeoutRef.current)
      }
    }
  }, [])

  const handleContinue = () => {
    // After firmware update complete, navigate to check-for-updates to check for more updates (e.g., BES after MTK)
    // Use replace() to avoid stacking duplicate screens
    console.log("OTA: Continue pressed - replacing with check-for-updates")
    replace("/ota/check-for-updates")
  }

  const handleRetry = () => {
    // Reset state and retry the update
    console.log("OTA: Retry pressed - resetting state")
    setProgressState("starting")
    setRetryCount(0)
    setErrorMessage(null)
    hasReceivedProgress.current = false
  }

  const progress = otaProgress?.progress ?? 0
  const currentUpdate = otaProgress?.currentUpdate // "apk", "mtk", or "bes"

  // DEBUG: Log render values
  console.log("🔍 OTA RENDER: progressState:", progressState, "progress:", progress, "currentUpdate:", currentUpdate)

  // Get user-friendly name for current component being updated
  const getComponentName = (component: string | undefined): string => {
    switch (component) {
      case "apk":
        return "Software"
      case "mtk":
        return "System Firmware"
      case "bes":
        return "Bluetooth Firmware"
      default:
        return "Update"
    }
  }

  const renderContent = () => {
    console.log(
      "🔍 OTA renderContent: progressState =",
      progressState,
      ", currentUpdate =",
      currentUpdate,
      ", progress =",
      progress,
    )
    // Starting state - waiting for glasses to respond
    if (progressState === "starting") {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="world-download" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text tx="ota:startingUpdate" className="font-semibold text-xl text-center" />
          <View className="h-4" />
          <ActivityIndicator size="large" color={theme.colors.foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center text-secondary-foreground" />
        </View>
      )
    }

    // Downloading state
    if (progressState === "downloading") {
      const componentName = getComponentName(currentUpdate)
      console.log(
        "🔍 OTA DOWNLOADING STATE: componentName =",
        componentName,
        ", progress =",
        progress,
        ", currentUpdate =",
        currentUpdate,
      )
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="world-download" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text text={`Downloading ${componentName}...`} className="font-semibold text-xl text-center" />
          <View className="h-4" />
          <Text text={`${progress}%`} className="text-3xl font-bold" style={{color: theme.colors.primary}} />
          <View className="h-4" />
          <ActivityIndicator size="large" color={theme.colors.foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>
      )
    }

    // Installing state - show percentage for BES firmware updates, spinner-only for APK/MTK
    if (progressState === "installing") {
      const componentName = getComponentName(currentUpdate)
      // Only BES firmware updates report install progress
      // MTK install happens in background on glasses - no progress tracking
      const showProgress = currentUpdate === "bes"
      console.log(
        "🔍 OTA INSTALLING STATE: componentName =",
        componentName,
        ", showProgress =",
        showProgress,
        ", progress =",
        progress,
        ", currentUpdate =",
        currentUpdate,
      )
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="settings" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text text={`Installing ${componentName}...`} className="font-semibold text-xl text-center" />
          <View className="h-4" />
          {showProgress && (
            <>
              <Text text={`${progress}%`} className="text-3xl font-bold" style={{color: theme.colors.primary}} />
              <View className="h-4" />
            </>
          )}
          <ActivityIndicator size="large" color={theme.colors.foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>
      )
    }

    // Restarting state - for MTK/BES updates that require reboot/power cycle
    if (progressState === "restarting") {
      const updateType = otaProgress?.currentUpdate
      const componentName = getComponentName(updateType)
      const isBes = updateType === "bes"

      // Determine the appropriate message based on update type
      let statusMessage: string

      if (isBes) {
        // BES update causes automatic power off
        statusMessage = "Your glasses will power off. Please turn them back on to continue."
      } else {
        // MTK-only update (or MTK completed, no BES) - needs manual restart
        statusMessage = "Please restart your glasses to apply the update."
      }

      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="check" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text text={`${componentName} Installed`} className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text text={statusMessage} className="text-sm text-center" style={{color: theme.colors.textDim}} />
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Completed state
    if (progressState === "completed") {
      const componentName = getComponentName(currentUpdate)
      const isMtk = currentUpdate === "mtk"

      // MTK updates require restart to apply - show appropriate message
      const completedMessage = isMtk
        ? "Restart your glasses to apply the update, or continue to check for additional updates."
        : "Press continue to check for additional updates."

      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="check" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text text={`${componentName} Update Complete`} className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text text={completedMessage} className="text-sm text-center" style={{color: theme.colors.textDim}} />
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Disconnected state (BLE) - retry only
    if (progressState === "disconnected") {
      const disconnectedComponentName = getComponentName(currentUpdate)
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="bluetooth-off" size={64} color={theme.colors.error} />
            <View className="h-6" />
            <Text
              text={`${disconnectedComponentName} Update Interrupted`}
              className="font-semibold text-xl text-center"
            />
            <View className="h-2" />
            <Text
              text="Glasses disconnected during update. Please reconnect and try again."
              className="text-sm text-center text-secondary-foreground"
            />
          </View>

          <View className="gap-3 pb-2">
            <Button preset="primary" tx="common:retry" flexContainer onPress={handleRetry} />
            {__DEV__ && <Button preset="secondary" text="Skip (dev only)" onPress={handleContinue} />}
          </View>
        </>
      )
    }

    // WiFi disconnected state - navigate to WiFi setup
    if (progressState === "wifi_disconnected") {
      const wifiDisconnectedComponentName = getComponentName(currentUpdate)
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="wifi-off" size={64} color={theme.colors.error} />
            <View className="h-6" />
            <Text
              text={`${wifiDisconnectedComponentName} Update Interrupted`}
              className="font-semibold text-xl text-center"
            />
            <View className="h-2" />
            <Text
              text="WiFi disconnected during update. Please reconnect to WiFi to continue."
              className="text-sm text-center text-secondary-foreground"
            />
          </View>

          <View className="gap-3 pb-2">
            <Button preset="primary" tx="common:continue" flexContainer onPress={() => push("/wifi/scan")} />
          </View>
        </>
      )
    }

    // Failed state (WiFi still connected) - retry or change WiFi
    const failedComponentName = getComponentName(currentUpdate)
    return (
      <>
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="warning" size={64} color={theme.colors.error} />
          <View className="h-6" />
          <Text text={`${failedComponentName} Update Failed`} className="font-semibold text-xl text-center" />
          {errorMessage ? (
            <>
              <View className="h-2" />
              <Text text={errorMessage} className="text-sm text-center text-secondary-foreground" />
            </>
          ) : null}
          <View className="h-2" />
          <Text
            text="Please try again or connect to a different WiFi network."
            className="text-sm text-center text-secondary-foreground"
          />
        </View>

        <View className="gap-3 pb-2">
          <Button preset="primary" tx="common:retry" flexContainer onPress={() => replace("/ota/check-for-updates")} />
          <Button preset="secondary" text="Change WiFi" flexContainer onPress={() => push("/wifi/scan")} />
        </View>
      </>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <Header RightActionComponent={<MentraLogoStandalone />} />

      {renderContent()}
    </Screen>
  )
}
