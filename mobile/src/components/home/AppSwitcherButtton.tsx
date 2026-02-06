import {TouchableOpacity, View} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {Badge} from "@/components/ui"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {useActiveApps} from "@/stores/applets"

interface AppSwitcherButtonProps {
  onPress: () => void
}

export default function AppSwitcherButton({onPress}: AppSwitcherButtonProps) {
  const {theme} = useAppTheme()
  const apps = useActiveApps()
  const appsCount = apps.length

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="bg-primary-foreground py-3 px-2 rounded-2xl flex-row justify-between items-center min-h-[72px] mt-4 mb-2">
      <View className="flex-row items-center gap-3 flex-1 px-2">
        <View className="flex-row items-center">
          {apps.slice(0, 3).map((app, index) => (
            <View
              key={app.packageName}
              style={{
                zIndex: 3 - index,
                marginLeft: index > 0 ? -theme.spacing.s8 : 0,
              }}>
              <AppIcon app={app} className="w-12 h-12" />
            </View>
          ))}
        </View>

        <View className="flex-col gap-1 flex-1 opacity-40">
          <Text className="font-semibold text-secondary-foreground text-sm">{translate("home:activeApps")}</Text>
          {appsCount > 0 && <Badge text={`${translate("home:activeAppsCount", {count: appsCount})}`} />}
        </View>
      </View>
    </TouchableOpacity>
  )
}
