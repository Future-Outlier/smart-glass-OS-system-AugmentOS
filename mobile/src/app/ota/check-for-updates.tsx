import {useFocusEffect} from "expo-router"
import {useEffect, useState, useCallback} from "react"
import {View, ActivityIndicator} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {ConnectionOverlay} from "@/components/glasses/ConnectionOverlay"
import {Screen, Header, Button, Text, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {checkForOtaUpdate} from "@/effects/OtaUpdateChecker"
import {translate} from "@/i18n/translate"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS, useSetting} from "@/stores/settings"

type CheckState = "checking" | "update_available" | "no_update" | "error"

export default function OtaCheckForUpdatesScreen() {
  const {theme} = useAppTheme()
  const {push, clearHistoryAndGoHome} = useNavigationHistory()
  const otaVersionUrl = useGlassesStore((state) => state.otaVersionUrl)
  const currentBuildNumber = useGlassesStore((state) => state.buildNumber)
  const mtkFwVersion = useGlassesStore((state) => state.mtkFwVersion)
  const besFwVersion = useGlassesStore((state) => state.besFwVersion)
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const deviceName = defaultWearable || "Glasses"
  const glassesConnected = useGlassesStore((state) => state.connected)
  const wifiConnected = useGlassesStore((state) => state.wifiConnected)
  const [onboardingLiveCompleted] = useSetting(SETTINGS.onboarding_live_completed.key)

  const [checkState, setCheckState] = useState<CheckState>("checking")
  const [availableUpdates, setAvailableUpdates] = useState<string[]>([])
  const [checkKey, setCheckKey] = useState(0)

  focusEffectPreventBack()

  // Re-run OTA check when screen gains focus (for iterative updates: APK → MTK → BES)
  useFocusEffect(
    useCallback(() => {
      console.log("OTA: Screen focused - triggering re-check")
      setCheckState("checking")
      setAvailableUpdates([])
      setCheckKey((k) => k + 1)
    }, []),
  )

  // Perform OTA check when checkKey changes (on mount and on focus)
  useEffect(() => {
    const MIN_DISPLAY_TIME_MS = 1100

    const performCheck = async () => {
      if (!otaVersionUrl || !currentBuildNumber || !glassesConnected || !wifiConnected) {
        console.log("OTA: Missing requirements for OTA check - proceeding to next step")
        handleContinue()
        return
      }

      const startTime = Date.now()

      try {
        const result = await checkForOtaUpdate(otaVersionUrl, currentBuildNumber, mtkFwVersion, besFwVersion)
        console.log("📱 OTA check completed - result:", JSON.stringify(result))

        // Calculate remaining time to meet minimum display duration
        const elapsed = Date.now() - startTime
        const remainingDelay = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed)

        // Wait for minimum display time before showing result
        await new Promise((resolve) => setTimeout(resolve, remainingDelay))

        if (!result.hasCheckCompleted) {
          console.log("📱 OTA check did not complete - setting error state")
          setCheckState("error")
          return
        }

        if (result.updateAvailable && result.latestVersionInfo) {
          // Filter out MTK if it was already updated this session
          const mtkUpdatedThisSession = useGlassesStore.getState().mtkUpdatedThisSession
          let filteredUpdates = result.updates || []
          if (mtkUpdatedThisSession && filteredUpdates.includes("mtk")) {
            console.log("📱 Filtering out MTK - already updated this session (pending reboot)")
            filteredUpdates = filteredUpdates.filter((u) => u !== "mtk")
          }

          if (filteredUpdates.length > 0) {
            console.log("📱 Updates available - setting update_available state")
            setAvailableUpdates(filteredUpdates)
            setCheckState("update_available")
          } else {
            console.log("📱 No updates available after filtering - setting no_update state")
            setCheckState("no_update")
          }
        } else {
          console.log("📱 No updates available - setting no_update state")
          setCheckState("no_update")
        }
      } catch (error) {
        console.error("OTA check failed:", error)
        // Still respect minimum display time on error
        const elapsed = Date.now() - startTime
        const remainingDelay = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed)
        await new Promise((resolve) => setTimeout(resolve, remainingDelay))
        setCheckState("error")
      }
    }

    performCheck()
  }, [checkKey])

  // Navigate to next step based on onboarding status
  const handleContinue = () => {
    console.log("OTA: handleContinue() - onboardingLiveCompleted:", onboardingLiveCompleted)
    if (!onboardingLiveCompleted) {
      // Fresh pairing - go to onboarding
      console.log("OTA: Fresh pairing - navigating to onboarding")
      push("/onboarding/live")
    } else {
      // Not fresh pairing - go home
      console.log("OTA: Onboarding already done - navigating home")
      clearHistoryAndGoHome()
    }
  }

  // Retry OTA check
  const handleRetry = () => {
    console.log("OTA: handleRetry()")
    setCheckState("checking")
    setAvailableUpdates([])
    setCheckKey((k) => k + 1)
  }

  const handleUpdateNow = () => {
    console.log("OTA: handleUpdateNow()")
    // Push to progress screen - it will send the OTA start command
    push("/ota/progress")
  }

  const renderContent = () => {
    // Checking state - no skip button, OTA is mandatory
    if (checkState === "checking") {
      return (
        <>
          <View className="flex items-center justify-center pt-8">
            <Icon name="world-download" size={48} color={theme.colors.primary} />
            <View className="h-6" />
            <Text tx="ota:checkingForUpdates" className="font-semibold text-lg" />
            <View className="h-2" />
            <Text tx="ota:checkingForUpdatesMessage" className="text-sm text-center px-6" />
          </View>

          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
          </View>

          {/* No skip button - OTA check is mandatory */}
          <View className="h-12" />
        </>
      )
    }

    // Update available state
    if (checkState === "update_available") {
      const updateList = availableUpdates.map((u) => u.toUpperCase()).join(", ")
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="world-download" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text text={translate("ota:updateAvailable", {deviceName})} className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text
              text={`Updates available: ${updateList}`}
              className="text-base text-center"
              style={{color: theme.colors.textDim}}
            />
            <View className="h-4" />
            <Text tx="ota:updateDescription" className="text-sm text-center" style={{color: theme.colors.textDim}} />
          </View>

          <View className="gap-3 pb-2">
            <Button preset="primary" tx="ota:updateNow" onPress={handleUpdateNow} />
            {__DEV__ && <Button preset="secondary" text="Skip (dev only)" onPress={handleContinue} />}
          </View>
        </>
      )
    }

    // No update state
    if (checkState === "no_update") {
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="check" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text tx="ota:upToDate" className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text tx="ota:noUpdatesAvailable" className="text-sm text-center" style={{color: theme.colors.textDim}} />
          </View>

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleContinue} />
          </View>
        </>
      )
    }

    // Error state - retry only, no skip (except dev mode)
    return (
      <>
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="warning" size={64} color={theme.colors.error} />
          <View className="h-6" />
          <Text tx="ota:checkFailed" className="font-semibold text-xl text-center" />
          <View className="h-2" />
          <Text tx="ota:checkFailedMessage" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>

        <View className="gap-3 pb-2">
          <Button preset="primary" tx="common:retry" flexContainer onPress={handleRetry} />
          {__DEV__ && <Button preset="secondary" text="Skip (dev only)" onPress={handleContinue} />}
        </View>
      </>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <Header RightActionComponent={<MentraLogoStandalone />} />
      <ConnectionOverlay />

      {renderContent()}
    </Screen>
  )
}
