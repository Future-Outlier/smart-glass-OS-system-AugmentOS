import {Capabilities, getModelCapabilities} from "@/../../cloud/packages/types/src"
import {useFocusEffect} from "@react-navigation/native"
import {useCallback, useRef} from "react"
import {ScrollView, View} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {PairGlassesCard} from "@/components/home/PairGlassesCard"
import {Header, Screen} from "@/components/ignite"
import CloudConnection from "@/components/misc/CloudConnection"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {Group} from "@/components/ui"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {checkForOtaUpdate} from "@/effects/OtaUpdateChecker"
import {translate} from "@/i18n/translate"
import {useRefreshApplets} from "@/stores/applets"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS, useSetting} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"

export default function Homepage() {
  const {theme} = useAppTheme()
  const {push, pushUnder} = useNavigationHistory()
  const refreshApplets = useRefreshApplets()
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [offlineMode] = useSetting(SETTINGS.offline_mode.key)
  const [dismissedVersion, setDismissedVersion] = useSetting<string>(SETTINGS.dismissed_ota_version.key)

  // OTA check state from glasses store
  const glassesConnected = useGlassesStore((state) => state.connected)
  const otaVersionUrl = useGlassesStore((state) => state.otaVersionUrl)
  const buildNumber = useGlassesStore((state) => state.buildNumber)
  const glassesWifiConnected = useGlassesStore((state) => state.wifiConnected)

  // Track if we've already checked this session to avoid repeated prompts
  const hasCheckedOta = useRef(false)

  useFocusEffect(
    useCallback(() => {
      // Refresh applets
      setTimeout(() => {
        refreshApplets()
      }, 1000)

      // OTA check (only for WiFi-capable glasses)
      if (hasCheckedOta.current) return
      if (!glassesConnected || !otaVersionUrl || !buildNumber) return

      const features: Capabilities = getModelCapabilities(defaultWearable)
      if (!features?.hasWifi) return

      checkForOtaUpdate(otaVersionUrl, buildNumber).then(({updateAvailable, latestVersionInfo}) => {
        if (!updateAvailable || !latestVersionInfo) return

        // Skip if user already dismissed this version
        if (dismissedVersion === latestVersionInfo.versionCode?.toString()) return

        hasCheckedOta.current = true

        if (glassesWifiConnected) {
          // WiFi connected - go straight to OTA check screen
          showAlert(
            translate("ota:updateAvailable"),
            translate("ota:updateReadyToInstall", {version: latestVersionInfo.versionCode}),
            [
              {
                text: translate("ota:updateLater"),
                style: "cancel",
                onPress: () => setDismissedVersion(latestVersionInfo.versionCode?.toString() ?? ""),
              },
              {text: translate("ota:install"), onPress: () => push("/ota/check-for-updates")},
            ],
          )
        } else {
          // No WiFi - prompt to connect
          showAlert(translate("ota:updateAvailable"), translate("ota:updateConnectWifi"), [
            {
              text: translate("ota:updateLater"),
              style: "cancel",
              onPress: () => setDismissedVersion(latestVersionInfo.versionCode?.toString() ?? ""),
            },
            {
              text: translate("ota:setupWifi"),
              onPress: () => {
                push("/wifi/scan")
                pushUnder("/ota/check-for-updates")
              },
            },
          ])
        }
      })
    }, [
      glassesConnected,
      otaVersionUrl,
      buildNumber,
      glassesWifiConnected,
      dismissedVersion,
      defaultWearable,
      push,
      pushUnder,
      refreshApplets,
      setDismissedVersion,
    ]),
  )

  return (
    <Screen preset="fixed">
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={{flexDirection: "row", alignItems: "center"}}>
            <NonProdWarning />
            <MentraLogoStandalone />
          </View>
        }
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <Spacer height={theme.spacing.s4} />
        <CloudConnection />
        <Group>
          {!defaultWearable && <PairGlassesCard />}
          {defaultWearable && <CompactDeviceStatus />}
          {!offlineMode && <BackgroundAppsLink />}
        </Group>
        <Spacer height={theme.spacing.s2} />
        <ActiveForegroundApp />
        <Spacer height={theme.spacing.s2} />
        <ForegroundAppsGrid />
        <IncompatibleApps />
      </ScrollView>
    </Screen>
  )
}
