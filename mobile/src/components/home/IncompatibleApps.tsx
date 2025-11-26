import {useCallback, useMemo} from "react"
import {FlatList, ImageStyle, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/misc/AppIcon"
import {translate} from "@/i18n"
import {ClientAppletInterface, DUMMY_APPLET, useIncompatibleApps} from "@/stores/applets"
import {SETTINGS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"

const GRID_COLUMNS = 4

export const IncompatibleApps: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const incompatibleApps = useIncompatibleApps()
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)

  // Get connected glasses name
  const glassesName = defaultWearable || "your glasses"

  // Prepare grid data with placeholders
  const gridData = useMemo(() => {
    // Calculate how many empty placeholders we need to fill the last row
    const totalItems = incompatibleApps.length
    const remainder = totalItems % GRID_COLUMNS
    const emptySlots = remainder === 0 ? 0 : GRID_COLUMNS - remainder

    // Add empty placeholders to align items to the left
    const paddedApps = [...incompatibleApps]
    for (let i = 0; i < emptySlots; i++) {
      paddedApps.push(DUMMY_APPLET)
    }

    return paddedApps
  }, [incompatibleApps])

  const handleAppPress = useCallback(
    (app: ClientAppletInterface) => {
      // Show alert explaining why the app is incompatible
      const missingHardware =
        app.compatibility?.missingRequired?.map(req => req.type.toLowerCase()).join(", ") || "required features"

      showAlert(
        translate("home:hardwareIncompatible"),
        app.compatibility?.message ||
          translate("home:hardwareIncompatibleMessage", {
            app: app.name,
            missing: missingHardware,
          }),
        [{text: translate("common:ok")}],
        {
          iconName: "alert-circle-outline",
          iconColor: theme.colors.error,
        },
      )
    },
    [theme],
  )

  const renderItem = useCallback(
    ({item}: {item: ClientAppletInterface}) => {
      // Don't render empty placeholders
      if (!item.name) {
        return <View style={themed($gridItem)} />
      }

      return (
        <TouchableOpacity style={themed($gridItem)} onPress={() => handleAppPress(item)} activeOpacity={0.7}>
          <View style={themed($appContainer)}>
            <AppIcon app={item as any} style={themed($appIcon)} />
          </View>
          <Text text={item.name} style={themed($appNameIncompatible)} numberOfLines={2} />
        </TouchableOpacity>
      )
    },
    [themed, theme, handleAppPress],
  )

  // Don't show section if no incompatible apps
  if (incompatibleApps.length === 0) {
    return null
  }

  return (
    <View style={themed($container)}>
      <View style={themed($header)}>
        <Text style={themed($headerText)}>{`Incompatible with ${glassesName}`}</Text>
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
  marginTop: spacing.s4,
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s3,
  paddingHorizontal: spacing.s2,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "600",
  color: colors.textDim,
  flex: 1,
})

const $gridContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingBottom: spacing.s3,
})

const $gridItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  marginVertical: spacing.s3,
  paddingHorizontal: spacing.s2,
})

const $appContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "relative",
  width: 64,
  height: 64,
  marginBottom: spacing.s2,
})

const $appIcon: ThemedStyle<ImageStyle> = ({spacing}) => ({
  width: 64,
  height: 64,
  borderRadius: spacing.s3,
  opacity: 0.4,
})

const $appNameIncompatible: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.s1,
  lineHeight: 14,
  opacity: 0.6,
})
