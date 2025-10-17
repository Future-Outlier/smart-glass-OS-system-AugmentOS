import {View} from "react-native"

import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {Spacer} from "@/components/misc/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"

export const HomeContainer: React.FC = () => {
  const {theme} = useAppTheme()

  return (
    <View>
      <CompactDeviceStatus />
      <BackgroundAppsLink />
      <ActiveForegroundApp />
      <ForegroundAppsGrid />
      <IncompatibleApps />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
    </View>
  )
}
