import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {HomeContainer} from "@/components/home/HomeContainer"
import PermissionsWarning from "@/components/home/PermissionsWarning"
import {Header, Screen} from "@/components/ignite"
import {AppsOfflineList} from "@/components/misc/AppsOfflineList"
import CloudConnection from "@/components/misc/CloudConnection"
import Divider from "@/components/misc/Divider"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {OfflineModeButton} from "@/components/misc/OfflineModeButton"
import {OnboardingSpotlight} from "@/components/misc/OnboardingSpotlight"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {OtaUpdateChecker} from "@/components/utils/OtaUpdateChecker"
import {Reconnect} from "@/components/utils/Reconnect"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {translate} from "@/i18n"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "@react-navigation/native"
import MicIcon from "assets/icons/component/MicIcon"
import {useCallback, useRef, useState} from "react"
import {ScrollView, View, ViewStyle} from "react-native"

export default function Homepage() {
  const {refreshAppStatus} = useAppStatus()
  const [onboardingTarget, setOnboardingTarget] = useState<"glasses" | "livecaptions">("glasses")
  const liveCaptionsRef = useRef<any>(null)
  const connectButtonRef = useRef<any>(null)
  const {themed, theme} = useAppTheme()
  const [isOfflineMode, _setIsOfflineMode] = useSetting(SETTINGS_KEYS.offline_mode)

  useFocusEffect(
    useCallback(() => {
      refreshAppStatus()
    }, []),
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={themed($headerRight)}>
            <PermissionsWarning />
            <OfflineModeButton />
            <MicIcon width={24} height={24} />
            <NonProdWarning />
          </View>
        }
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <CloudConnection />
        <SensingDisabledWarning />

        {isOfflineMode ? (
          <>
            <CompactDeviceStatus />
            <Divider variant="full" />
            <AppsOfflineList />
          </>
        ) : (
          <HomeContainer />
        )}
      </ScrollView>

      <OnboardingSpotlight
        targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
        setOnboardingTarget={setOnboardingTarget}
        onboardingTarget={onboardingTarget}
        message={
          onboardingTarget === "glasses"
            ? translate("home:connectGlassesToStart")
            : translate("home:tapToStartLiveCaptions")
        }
      />
      <Reconnect />
      <OtaUpdateChecker />
    </Screen>
  )
}

const $headerRight: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
