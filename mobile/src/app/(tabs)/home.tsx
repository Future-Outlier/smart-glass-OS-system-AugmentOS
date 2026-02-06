import {useFocusEffect} from "@react-navigation/native"
import {useCallback, useEffect, useRef, useState} from "react"
import {ScrollView, View} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {PairGlassesCard} from "@/components/home/PairGlassesCard"
import {Header, Screen} from "@/components/ignite"
import NonProdWarning from "@/components/home/NonProdWarning"
import {Group} from "@/components/ui"
import {useRefreshApplets} from "@/stores/applets"
import {SETTINGS, useSetting} from "@/stores/settings"
import {useGlassesStore} from "@/stores/glasses"
import {useCoreStore} from "@/stores/core"
import WebsocketStatus from "@/components/error/WebsocketStatus"
import CoreStatusBar from "@/components/dev/CoreStatusBar"
import {attemptReconnect} from "@/effects/Reconnect"
import AppSwitcherButton from "@/components/home/AppSwitcherButtton"
import AppSwitcher from "@/components/home/AppSwitcher"

export default function Homepage() {
  const refreshApplets = useRefreshApplets()
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [offlineMode] = useSetting(SETTINGS.offline_mode.key)
  const [debugCoreStatusBarEnabled] = useSetting(SETTINGS.debug_core_status_bar.key)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const isSearching = useCoreStore((state) => state.searching)
  const hasAttemptedInitialConnect = useRef(false)
  const [appSwitcherUi] = useSetting(SETTINGS.app_switcher_ui.key)
  const [showSwitcher, setShowSwitcher] = useState(false)

  useFocusEffect(
    useCallback(() => {
      refreshApplets()
    }, [refreshApplets]),
  )

  // Auto-connect on initial app startup when home screen is reached
  // This ensures all initialization is complete before attempting connection
  useEffect(() => {
    const attemptInitialConnect = async () => {
      // Only attempt once per app session
      if (hasAttemptedInitialConnect.current) {
        return
      }
      let attempted = await attemptReconnect()
      if (attempted) {
        hasAttemptedInitialConnect.current = true
      }
    }

    attemptInitialConnect()
  }, [glassesConnected, isSearching, defaultWearable])

  const renderContent = () => {
    if (!defaultWearable) {
      return (
        <>
          {debugCoreStatusBarEnabled && <CoreStatusBar />}
          <Group>
            <PairGlassesCard />
          </Group>
        </>
      )
    }

    return (
      <>
        {debugCoreStatusBarEnabled && <CoreStatusBar />}
        <Group>
          <CompactDeviceStatus />
          {!offlineMode && !appSwitcherUi && <BackgroundAppsLink />}
        </Group>
        <View className="h-2" />
        {!appSwitcherUi && <ActiveForegroundApp />}
        {appSwitcherUi && <AppSwitcherButton onPress={() => setShowSwitcher(true)} />}
        {/* <ActiveForegroundApp /> */}
        <ForegroundAppsGrid />
      </>
    )
  }

  return (
    <Screen preset="fixed">
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View className="flex-row items-center flex-1 justify-end">
            <WebsocketStatus />
            <NonProdWarning />
            <View className="w-2" />
            <MentraLogoStandalone />
          </View>
        }
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <View className="h-4" />
        {renderContent()}
        <View className="h-4" />
        <IncompatibleApps />
      </ScrollView>
      {appSwitcherUi && <AppSwitcher visible={showSwitcher} onClose={() => setShowSwitcher(false)} />}
    </Screen>
  )
}
