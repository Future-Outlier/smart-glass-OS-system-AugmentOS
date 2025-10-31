import {useCallback, useMemo} from "react"
import {FlatList, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {GetMoreAppsIcon} from "@/components/misc/GetMoreAppsIcon"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {
  ClientAppletInterface,
  DUMMY_APPLET,
  useActiveForegroundApp,
  useInactiveForegroundApps,
  useStartApplet,
} from "@/stores/applets"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

const GRID_COLUMNS = 4

// Special type for the Get More Apps item
interface GridItem extends ClientAppletInterface {
  isGetMoreApps?: boolean
}

export const ForegroundAppsGrid: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const foregroundApps = useInactiveForegroundApps()
  const activeForegroundApp = useActiveForegroundApp()
  const startApplet = useStartApplet()

  const gridData = useMemo(() => {
    // Filter out incompatible apps and running apps
    const inactiveApps = foregroundApps.filter(app => {
      // Exclude running apps
      if (app.running) return false
      if (!app.compatibility?.isCompatible) return false
      return true
    })

    // Sort to put Camera app first, then alphabetical
    inactiveApps.sort((a, b) => {
      // Camera app always comes first
      if (a.packageName === "com.mentra.camera") return -1
      if (b.packageName === "com.mentra.camera") return 1

      // Otherwise sort alphabetically
      return a.name.localeCompare(b.name)
    })

    // Add "Get More Apps" as the last item
    const appsWithGetMore = [
      ...inactiveApps,
      {
        packageName: "get-more-apps",
        name: "Get More Apps",
        type: "standard",
        isGetMoreApps: true,
        logoUrl: "",
        permissions: [],
      } as GridItem,
    ]

    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = appsWithGetMore.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    const paddedApps = [...appsWithGetMore]
    for (let i = 0; i < emptySlots; i++) {
      paddedApps.push(DUMMY_APPLET)
    }

    return paddedApps
  }, [foregroundApps])

  const handleAppPress = useCallback(
    async (app: GridItem) => {
      console.log("App pressed:", app.packageName, "isGetMoreApps:", app.isGetMoreApps)

      // Handle "Get More Apps" specially
      if (app.isGetMoreApps) {
        push("/store")
        return
      }

      // // Check if there's already an active foreground app and automatically switch
      // // This applies to both online and offline apps
      // if (activeForegroundApp && app.packageName !== activeForegroundApp.packageName) {
      //   console.log("Switching from", activeForegroundApp.packageName, "to", app.packageName)
      //   await stopApplet(activeForegroundApp.packageName)
      // }

      // Now start the new app (offline or online)
      await startApplet(app.packageName)
    },
    [activeForegroundApp, push],
  )

  const renderItem = useCallback(
    ({item}: {item: GridItem}) => {
      // Don't render empty placeholders
      if (!item.name && !item.isGetMoreApps) {
        return <View style={themed($gridItem)} />
      }

      // Render "Get More Apps" item
      if (item.isGetMoreApps) {
        return (
          <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
            <GetMoreAppsIcon size="large" />
            <Text text={item.name} style={themed($appName)} numberOfLines={2} />
          </TouchableOpacity>
        )
      }

      // small hack to help with some long app names:
      const numberOfLines = item.name.split(" ").length > 1 ? 2 : 1
      let size = 12
      if (numberOfLines == 1 && item.name.length > 10) {
        size = 11
      }

      return (
        <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
          <AppIcon app={item} style={themed($appIcon)} />
          <Text
            text={item.name}
            style={[themed(!item.healthy ? $appNameOffline : $appName), {fontSize: size}]}
            numberOfLines={numberOfLines}
            ellipsizeMode="tail"
          />
        </TouchableOpacity>
      )
    },
    [themed, theme, handleAppPress],
  )

  if (foregroundApps.length === 0) {
    // Still show "Get More Apps" even when no apps
    return (
      <View style={themed($container)}>
        <Text style={themed($emptyText)}>No foreground apps available</Text>
        <TouchableOpacity style={themed($getMoreAppsButton)} onPress={() => push("/store")} activeOpacity={0.7}>
          <GetMoreAppsIcon size="large" style={{marginBottom: theme.spacing.xs}} />
          <Text text="Get More Apps" style={themed($appName)} />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={themed($container)}>
      <View style={themed($header)}>
        <Text tx="home:inactiveApps" style={themed($headerText)} />
      </View>
      <FlatList
        data={gridData}
        renderItem={renderItem}
        keyExtractor={item => item.packageName}
        numColumns={GRID_COLUMNS}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={themed($gridContent)}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginTop: spacing.sm,
})

const $gridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingBottom: spacing.md,
})

const $gridItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  marginVertical: spacing.sm,
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingBottom: spacing.sm,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: 600,
  color: colors.secondary_foreground,
})

const $appIcon: ThemedStyle<ViewStyle> = () => ({
  width: 64,
  height: 64,
  // borderRadius is handled by AppIcon component based on squircle settings
})

const $appName: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.text,
  textAlign: "center",
  marginTop: spacing.xxs,
  lineHeight: 14,
  // overflow: "hidden",
  // wordWrap: "break-word",
})

const $appNameOffline: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.xxs,
  textDecorationLine: "line-through",
  lineHeight: 14,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 15,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.lg,
})

const $getMoreAppsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.md,
})
