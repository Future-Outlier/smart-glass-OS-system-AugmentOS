import CoreModule from "core"
import {useEffect, useState, useRef, useCallback} from "react"
import {View, ActivityIndicator} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Screen, Header, Button, Text, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useGlassesStore} from "@/stores/glasses"

type ProgressState = "starting" | "downloading" | "installing" | "completed" | "failed" | "disconnected" | "restarting"

const MAX_RETRIES = 3
const RETRY_INTERVAL_MS = 5000 // 5 seconds between retries

export default function OtaProgressScreen() {
  const {theme} = useAppTheme()
  const {pushPrevious} = useNavigationHistory()
  const otaProgress = useGlassesStore((state) => state.otaProgress)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const buildNumber = useGlassesStore((state) => state.buildNumber)

  const [progressState, setProgressState] = useState<ProgressState>("starting")
  const [retryCount, setRetryCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Track if we've received any progress from glasses
  const hasReceivedProgress = useRef(false)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track initial build number to detect successful install
  const initialBuildNumber = useRef<string | null>(null)

  focusEffectPreventBack()

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

  // Track completion timeout to allow cleanup
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track MTK-only timeout (if MTK finishes but no BES follows)
  const mtkOnlyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Watch for OTA progress updates from glasses
  useEffect(() => {
    if (!otaProgress) return

    // Mark that we've received progress - stop retrying
    if (!hasReceivedProgress.current) {
      hasReceivedProgress.current = true
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

      if (otaProgress.stage === "download") {
        setProgressState("downloading")
      } else if (otaProgress.stage === "install") {
        setProgressState("installing")
      }
    } else if (otaProgress.status === "FINISHED") {
      const updateType = otaProgress.currentUpdate

      if (updateType === "mtk") {
        // MTK finished - mark as updated this session to prevent re-prompting
        // (MTK A/B updates don't change version until reboot)
        useGlassesStore.getState().setMtkUpdatedThisSession(true)
        console.log("OTA: MTK update FINISHED - marked as updated this session")

        // BES update may start automatically next
        // Set timeout: if BES doesn't start within 10 seconds, show "restarting" state
        // (user needs to manually restart glasses to apply MTK A/B slot switch)
        console.log("OTA: Waiting up to 10s for BES update to start")
        mtkOnlyTimeoutRef.current = setTimeout(() => {
          console.log("OTA: No BES update started after MTK - showing restarting state (manual restart needed)")
          setProgressState("restarting")
        }, 10000)
      } else if (updateType === "bes") {
        // Clear any pending MTK timeout
        if (mtkOnlyTimeoutRef.current) {
          clearTimeout(mtkOnlyTimeoutRef.current)
          mtkOnlyTimeoutRef.current = null
        }
        // BES finished - glasses will power off
        console.log("OTA: BES update FINISHED - glasses will power off")
        setProgressState("restarting")
      } else {
        // APK update - show completed after delay
        console.log("OTA: Received FINISHED for APK update - showing completed in 2 seconds")
        completionTimeoutRef.current = setTimeout(() => {
          setProgressState("completed")
        }, 2000)
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
    // After firmware updates complete (or staged), go back to previous screen
    // OtaUpdateChecker will prompt for any remaining updates when glasses reconnect
    console.log("OTA: Continue pressed - returning to previous screen")
    pushPrevious(1)
  }

  const progress = otaProgress?.progress ?? 0
  const currentUpdate = otaProgress?.currentUpdate // "apk", "mtk", or "bes"

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
    // Starting state - waiting for glasses to respond
    if (progressState === "starting") {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="world-download" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text tx="ota:startingUpdate" className="font-semibold text-xl text-center" />
          <View className="h-4" />
          <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center text-secondary-foreground" />
        </View>
      )
    }

    // Downloading state
    if (progressState === "downloading") {
      const componentName = getComponentName(currentUpdate)
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="world-download" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text text={`Downloading ${componentName}...`} className="font-semibold text-xl text-center" />
          <View className="h-4" />
          <Text text={`${progress}%`} className="text-3xl font-bold" style={{color: theme.colors.primary}} />
          <View className="h-4" />
          <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>
      )
    }

    // Installing state - no percentage shown since APK installation doesn't report progress
    if (progressState === "installing") {
      const componentName = getComponentName(currentUpdate)
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="settings" size={64} color={theme.colors.primary} />
          <View className="h-6" />
          <Text text={`Installing ${componentName}...`} className="font-semibold text-xl text-center" />
          <View className="h-4" />
          <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
          <View className="h-4" />
          <Text tx="ota:doNotDisconnect" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>
      )
    }

    // Restarting state - for MTK/BES updates that require reboot/power cycle
    if (progressState === "restarting") {
      const updateType = otaProgress?.currentUpdate
      const isBes = updateType === "bes"

      // Determine the appropriate message based on update type
      let statusMessage: string
      let showSpinner = false

      if (isBes) {
        // BES update causes automatic power off
        statusMessage = "Your glasses will power off. Please turn them back on to continue."
        showSpinner = true
      } else {
        // MTK-only update (or MTK completed, no BES) - needs manual restart
        statusMessage = "Update staged. Please restart your glasses to apply the update."
        showSpinner = false
      }

      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="check" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text text="Update Installed" className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text text={statusMessage} className="text-sm text-center" style={{color: theme.colors.textDim}} />
            {showSpinner && (
              <>
                <View className="h-4" />
                <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
              </>
            )}
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Completed state
    if (progressState === "completed") {
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="check" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text tx="ota:updateComplete" className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text
              tx="ota:updateCompleteMessage"
              className="text-sm text-center"
              style={{color: theme.colors.textDim}}
            />
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Disconnected state
    if (progressState === "disconnected") {
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="bluetooth-off" size={64} color={theme.colors.error} />
            <View className="h-6" />
            <Text tx="ota:glassesDisconnected" className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text tx="ota:glassesDisconnectedMessage" className="text-sm text-center text-secondary-foreground" />
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Failed state
    return (
      <>
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="warning" size={64} color={theme.colors.error} />
          <View className="h-6" />
          <Text tx="ota:updateFailed" className="font-semibold text-xl text-center" />
          {errorMessage ? (
            <>
              <View className="h-2" />
              <Text text={errorMessage} className="text-sm text-center text-secondary-foreground" />
            </>
          ) : null}
          <View className="h-2" />
          <Text tx="ota:updateFailedMessage" className="text-sm text-center text-secondary-foreground" />
        </View>

        <View className="justify-center items-center">
          <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
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
