import {useCallback, useMemo} from "react"
import {FlatList, TextStyle, TouchableOpacity, View} from "react-native"
import {AutoSizeText, ResizeTextMode} from "react-native-auto-size-text"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {useAppTheme} from "@/contexts/ThemeContext"
import {ClientAppletInterface, DUMMY_APPLET, useForegroundApps, useStartApplet} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
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
      // if (app.running && !appSwitcherUi) return false
      // if (!app.compatibility?.isCompatible) return false
      return true
    })

    // Sort to put Camera app first, then alphabetical
    filteredApps.sort((a, b) => {
      const priority = (pkg: string) => {
        if (pkg === "com.mentra.camera") return 0
        if (pkg === "com.mentra.gallery") return 2
        if (pkg === "com.mentra.settings") return 3
        if (pkg === "com.mentra.store") return 4
        return 1
      }
      const pa = priority(a.packageName)
      const pb = priority(b.packageName)
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    })

    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = filteredApps.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    for (let i = 0; i < emptySlots; i++) {
      filteredApps.push(DUMMY_APPLET)
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
      const numberOfLines = item.name.split(" ").length > 1 ? 2 : 1

      return (
        <TouchableOpacity className="flex-1 items-center" onPress={() => handlePress(item)} activeOpacity={0.7}>
          <AppIcon app={item} className="w-16 h-16" />
          <View className="w-full h-7 my-1 items-center justify-start">
            <AutoSizeText
              className="text-secondary-foreground text-center mt-1"
              numberOfLines={numberOfLines}
              ellipsizeMode="tail"
              fontSize={14}
              mode={ResizeTextMode.max_lines}>
              {item.name}
            </AutoSizeText>
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