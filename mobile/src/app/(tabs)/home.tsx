import {useFocusEffect} from "@react-navigation/native"
import {useCallback} from "react"
import {ScrollView} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Header, Screen} from "@/components/ignite"
import CloudConnection from "@/components/misc/CloudConnection"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import {Spacer} from "@/components/ui/Spacer"
import {useRefreshApplets} from "@/stores/applets"
import {useAppTheme} from "@/utils/useAppTheme"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {Group} from "@/components/ui"
import {PairGlassesCard} from "@/components/home/PairGlassesCard"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {SETTINGS, useSetting} from "@/stores/settings"

export default function Homepage() {
  const {theme} = useAppTheme()
  const refreshApplets = useRefreshApplets()
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [offlineMode] = useSetting(SETTINGS.offline_mode.key)

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        refreshApplets()
      }, 1000)
    }, []),
  )

  return (
    <Screen preset="fixed">
      <Header leftTx="home:title" RightActionComponent={<MentraLogoStandalone />} />

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <Spacer height={theme.spacing.s4} />
        <CloudConnection />
        <SensingDisabledWarning />
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
