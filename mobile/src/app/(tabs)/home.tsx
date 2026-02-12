import {useFocusEffect} from "@react-navigation/native"
import {useCallback, useEffect, useRef, useState} from "react"
import {ScrollView, View, NativeScrollEvent, NativeSyntheticEvent} from "react-native"

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
import {DeviceStatus} from "@/components/home/DeviceStatus"

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
  const hasTriggered = useRef(false)
  const PULL_THRESHOLD = 140 // How far to pull down to trigger

  useFocusEffect(
    useCallback(() => {
      refreshApplets()
    }, [refreshApplets]),
  )

  useEffect(() => {
    const attemptInitialConnect = async () => {
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

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent

      // How far past the bottom the user has scrolled
      const overscroll = contentOffset.y - (contentSize.height - layoutMeasurement.height)

      // Trigger when pulling past the bottom
      if (overscroll > PULL_THRESHOLD && !hasTriggered.current && !showSwitcher) {
        hasTriggered.current = true
        setShowSwitcher(true)
      }
    },
    [showSwitcher],
  )

  const handleScrollEndDrag = useCallback(() => {
    // Reset trigger when user releases
    hasTriggered.current = false
  }, [])

  const handleCloseSwitcher = useCallback(() => {
    setShowSwitcher(false)
    hasTriggered.current = false
  }, [])

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
          {/* {!appSwitcherUi && <CompactDeviceStatus />} */}
          {/* {appSwitcherUi && <DeviceStatus />} */}
          {!offlineMode && !appSwitcherUi && <BackgroundAppsLink />}
        </Group>
        <View className="h-2" />
        {!appSwitcherUi && <ActiveForegroundApp />}
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

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{flex: 1}}
        contentContainerStyle={{flexGrow: 1}}
        onScroll={appSwitcherUi ? handleScroll : undefined}
        onScrollEndDrag={appSwitcherUi ? handleScrollEndDrag : undefined}
        scrollEventThrottle={16}>
        <View className="h-4" />
        {renderContent()}
        <View className="h-4" />
        {!appSwitcherUi && <IncompatibleApps />}
      </ScrollView>
      {appSwitcherUi && <AppSwitcherButton onPress={() => setShowSwitcher(true)} />}
      {appSwitcherUi && <AppSwitcher visible={showSwitcher} onClose={handleCloseSwitcher} />}
    </Screen>
  )
}
