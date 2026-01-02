import {useEffect, useState} from "react"
import {View, ActivityIndicator} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Screen, Header, Button, Text, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {checkForOtaUpdate, VersionInfo} from "@/effects/OtaUpdateChecker"
import {useGlassesStore} from "@/stores/glasses"

type CheckState = "checking" | "update_available" | "no_update" | "error"

export default function OtaCheckForUpdatesScreen() {
  const {theme} = useAppTheme()
  const {pushPrevious, push} = useNavigationHistory()
  const otaVersionUrl = useGlassesStore(state => state.otaVersionUrl)
  const currentBuildNumber = useGlassesStore(state => state.buildNumber)

  const [checkState, setCheckState] = useState<CheckState>("checking")
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  focusEffectPreventBack()

  // Perform OTA check on mount
  useEffect(() => {
    const performCheck = async () => {
      if (!otaVersionUrl || !currentBuildNumber) {
        console.log("OTA: No version URL or build number, skipping check")
        handleSkip()
        return
      }

      try {
        const result = await checkForOtaUpdate(otaVersionUrl, currentBuildNumber)

        if (!result.hasCheckCompleted) {
          setCheckState("error")
          // setTimeout(() => handleSkip(), 2000)
          return
        }

        if (result.updateAvailable && result.latestVersionInfo) {
          setVersionInfo(result.latestVersionInfo)
          setCheckState("update_available")
        } else {
          setCheckState("no_update")
          // setTimeout(() => handleSkip(), 2000)
        }
      } catch (error) {
        console.error("OTA check failed:", error)
        setCheckState("error")
        // setTimeout(() => handleSkip(), 2000)
      }
    }

    performCheck()
  }, [])

  const handleSkip = () => {
    console.log("OTA: handleSkip()")
    pushPrevious()
  }

  const handleUpdateNow = () => {
    console.log("OTA: handleUpdateNow()")
    // Push to progress screen - it will send the OTA start command
    push("/ota/progress")
  }

  const renderContent = () => {
    // Checking state
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

          <View className="justify-center items-center">
            <Button preset="primary" tx="common:skip" flexContainer onPress={handleSkip} />
          </View>
        </>
      )
    }

    // Update available state
    if (checkState === "update_available") {
      return (
        <>
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="world-download" size={64} color={theme.colors.primary} />
            <View className="h-6" />
            <Text tx="ota:updateAvailable" className="font-semibold text-xl text-center" />
            <View className="h-2" />
            <Text
              text={`Version ${versionInfo?.versionName || versionInfo?.versionCode || "Unknown"}`}
              className="text-base text-center"
              style={{color: theme.colors.textDim}}
            />
            <View className="h-4" />
            <Text tx="ota:updateDescription" className="text-sm text-center" style={{color: theme.colors.textDim}} />
          </View>

          <View className="gap-3 px-4 pb-2">
            <Button preset="primary" tx="ota:updateNow" onPress={handleUpdateNow} />
            <Button preset="default" tx="ota:updateLater" onPress={handleSkip} />
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
            <Button preset="primary" tx="common:continue" flexContainer onPress={handleSkip} />
          </View>
        </>
      )
    }

    // Error state
    return (
      <>
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="warning" size={64} color={theme.colors.error} />
          <View className="h-6" />
          <Text tx="ota:checkFailed" className="font-semibold text-xl text-center" />
          <View className="h-2" />
          <Text tx="ota:checkFailedMessage" className="text-sm text-center" style={{color: theme.colors.textDim}} />
        </View>

        <View className="justify-center items-center">
          <Button preset="primary" tx="common:continue" flexContainer onPress={handleSkip} />
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
