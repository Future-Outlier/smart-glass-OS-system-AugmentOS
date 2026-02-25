import {useCallback, useMemo} from "react"
import {FlatList, TouchableOpacity, View} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {useAppTheme} from "@/contexts/ThemeContext"
import {
  ClientAppletInterface,
  DUMMY_APPLET,
  getPackageNamePriority,
  useForegroundApps,
  useStartApplet,
} from "@/stores/applets"
import {askPermissionsUI} from "@/utils/PermissionsUtils"
import {SETTINGS, useSetting} from "@/stores/settings"

const GRID_COLUMNS = 4

export const ForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()

  const startApplet = useStartApplet()
  const [appSwitcherUi] = useSetting(SETTINGS.app_switcher_ui.key)
  const apps = useForegroundApps()

  const gridData = useMemo(() => {
    // Filter out incompatible apps and running apps
    let filteredApps = apps.filter((app) => {
      // Exclude running apps
      if (app.running && !appSwitcherUi) return false
      if (!app.compatibility?.isCompatible) return false
      return true
    })

    // sort by package name priority
    filteredApps.sort(getPackageNamePriority)

    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = filteredApps.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    for (let i = 0; i < emptySlots; i++) {
      filteredApps.push({...DUMMY_APPLET, packageName: `__empty_${filteredApps.length}`})
    }

    // ensure we have at least 20 apps to make sure we can scroll
    while (filteredApps.length < 20) {
      filteredApps.push({...DUMMY_APPLET, packageName: `__empty_${filteredApps.length}`})
    }

    return filteredApps
  }, [apps, appSwitcherUi])

  const handlePress = async (app: ClientAppletInterface) => {
    const result = await askPermissionsUI(app, theme)
    if (result !== 1) {
      return
    }

    startApplet(app.packageName)
  }

  const renderItem = useCallback(
    ({item}: {item: ClientAppletInterface}) => {
      // Don't render empty placeholders
      if (!item.name) {
        return <View className="flex-1 items-center my-3" />
      }

      // small hack to help with some long app names:
      // const numberOfLines = item.name.split(" ").length > 1 ? 2 : 1

      return (
        <TouchableOpacity className="flex-1 items-center" onPress={() => handlePress(item)} activeOpacity={0.7}>
          <AppIcon app={item} className="w-16 h-16" />
          <View className="w-full h-7 my-1 items-center justify-start w-full h-9">
            <Text
              className="text-secondary-foreground text-center mt-1 text-[12px] shrink"
              numberOfLines={2}
              ellipsizeMode="tail"
              text={item.name}
            />
            {/* <AutoSizeText
              className="text-secondary-foreground text-wrap text-center mt-1"
              numberOfLines={numberOfLines}
              ellipsizeMode="tail"
              minimumFontScale={1}
              fontSize={12}
              mode={ResizeTextMode.max_lines}>
              {item.name}
            </AutoSizeText> */}
          </View>
        </TouchableOpacity>
      )
    },
    [themed, theme, startApplet],
  )

  return (
    <View className="flex-1 mt-3">
      {!appSwitcherUi && (
        <View className="flex-row justify-between items-center pb-3">
          <Text tx="home:inactiveApps" className="font-semibold text-xl text-secondary-foreground" />
        </View>
      )}
      <FlatList
        data={gridData}
        renderItem={renderItem}
        keyExtractor={(item) => item.packageName}
        numColumns={GRID_COLUMNS}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-4"
      />
    </View>
  )
}
