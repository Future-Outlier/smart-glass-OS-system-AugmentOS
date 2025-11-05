import {View} from "react-native"

import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {Spacer} from "@/components/ui/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {Group} from "@/components/ui/Group"
import {PairGlassesCard} from "@/components/home/PairGlassesCard"

export const HomeContainer: React.FC = () => {
  const {theme} = useAppTheme()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [offlineMode] = useSetting(SETTINGS_KEYS.offline_mode)

  return (
    <View>
      <Group>
        {!defaultWearable && <PairGlassesCard />}
        {defaultWearable && <CompactDeviceStatus />}
        {!offlineMode && <BackgroundAppsLink />}
      </Group>
      <Spacer height={theme.spacing.xs} />
      <ActiveForegroundApp />
      <Spacer height={theme.spacing.xs} />
      <ForegroundAppsGrid />
      <IncompatibleApps />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
    </View>
  )
}
