import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, Animated, Platform, ViewStyle, TextStyle, ScrollView} from "react-native"
import {useNavigation, useFocusEffect, useRoute} from "@react-navigation/native"
import type {NavigationProp} from "@react-navigation/native"
import {Header, Screen} from "@/components/ignite"
import {
  ConnectedDeviceInfo,
  ConnectDeviceButton,
  ConnectedGlasses,
  SplitDeviceInfo,
} from "@/components/misc/ConnectedDeviceInfo"
import ConnectedSimulatedGlassesInfo from "@/components/misc/ConnectedSimulatedGlassesInfo"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useAppStatus} from "@/contexts/AppStatusProvider"
// import {ScrollView} from 'react-native-gesture-handler';
import BackendServerComms from "@/backend_comms/BackendServerComms"
import semver from "semver"
import Constants from "expo-constants"
import CloudConnection from "@/components/misc/CloudConnection"
import {loadSetting} from "@/utils/SettingsHelper"

import {SETTINGS_KEYS} from "@/consts"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"
import {translate} from "@/i18n/translate"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

interface AnimatedSectionProps extends PropsWithChildren {
  delay?: number
}

export default function Homepage() {
  const {appStatus} = useAppStatus()
  const {status} = useStatus()
  const [isSimulatedPuck, setIsSimulatedPuck] = React.useState(false)
  const [isCheckingVersion, setIsCheckingVersion] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {themed, theme} = useAppTheme()

  // Reset loading state when connection status changes
  useEffect(() => {
    if (status.core_info.cloud_connection_status === "CONNECTED") {
      setIsInitialLoading(true)
      const timer = setTimeout(() => {
        setIsInitialLoading(false)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [status.core_info.cloud_connection_status])

  // Clear loading state if apps are loaded
  useEffect(() => {
    if (appStatus.length > 0) {
      setIsInitialLoading(false)
    }
  }, [appStatus.length])

  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())
  let pageTitle

  if (status.core_info.default_wearable) {
    pageTitle = formatGlassesTitle(status.core_info.default_wearable)
  } else {
    pageTitle = translate("glasses:title")
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftText={pageTitle} />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <CloudConnection />
        {status.glasses_info?.model_name && <ConnectedSimulatedGlassesInfo />}
        <Spacer height={theme.spacing.lg} />
        <ConnectDeviceButton />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
