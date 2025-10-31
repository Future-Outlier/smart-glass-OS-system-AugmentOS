import {DeviceTypes} from "@/../../cloud/packages/types/src"
import {Header, Screen, Text} from "@/components/ignite"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {Group} from "@/components/ui/Group"
import {RouteButton} from "@/components/ui/RouteButton"
import {Spacer} from "@/components/ui/Spacer"
import BackendUrl from "@/components/dev/BackendUrl"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {ScrollView, View, ViewStyle, TextStyle} from "react-native"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import Constants from "expo-constants"

export default function DeveloperSettingsScreen() {
  const {theme, themed} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [powerSavingMode, setPowerSavingMode] = useSetting(SETTINGS_KEYS.power_saving_mode)
  const [reconnectOnAppForeground, setReconnectOnAppForeground] = useSetting(SETTINGS_KEYS.reconnect_on_app_foreground)
  const [enableSquircles, setEnableSquircles] = useSetting(SETTINGS_KEYS.enable_squircles)
  const [debugConsole, setDebugConsole] = useSetting(SETTINGS_KEYS.debug_console)

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Developer Settings" leftIcon="caretLeft" onLeftPress={() => goBack()} />

      <View style={themed($warningContainer)}>
        <View style={themed($warningContent)}>
          <Icon name="alert" size={16} color={theme.colors.text} />
          <Text tx="warning:warning" style={themed($warningTitle)} />
        </View>
        <Text tx="warning:developerSettingsWarning" style={themed($warningSubtitle)} />
      </View>

      <Spacer height={theme.spacing.md} />

      <ScrollView style={{flex: 1, marginHorizontal: -theme.spacing.md, paddingHorizontal: theme.spacing.md}}>
        <RouteButton
          label="🎥 Buffer Recording Debug"
          subtitle="Control 30-second video buffer on glasses"
          onPress={() => push("/settings/buffer-debug")}
        />

        <Spacer height={theme.spacing.md} />

        <Group>
          <ToggleSetting
            label={translate("settings:reconnectOnAppForeground")}
            subtitle={translate("settings:reconnectOnAppForegroundSubtitle")}
            value={reconnectOnAppForeground}
            onValueChange={value => setReconnectOnAppForeground(value)}
          />

          <ToggleSetting
            label={translate("devSettings:debugConsole")}
            subtitle={translate("devSettings:debugConsoleSubtitle")}
            value={debugConsole}
            onValueChange={value => setDebugConsole(value)}
          />

          <ToggleSetting
            label="Enable Squircles"
            subtitle="Use iOS-style squircle app icons instead of circles"
            value={enableSquircles}
            onValueChange={value => setEnableSquircles(value)}
          />
        </Group>

        <Spacer height={theme.spacing.md} />

        {/* G1 Specific Settings - Only show when connected to Even Realities G1 */}
        {defaultWearable && defaultWearable.includes(DeviceTypes.G1) && (
          <Group title="G1 Specific Settings">
            <ToggleSetting
              label={translate("settings:powerSavingMode")}
              subtitle={translate("settings:powerSavingModeSubtitle")}
              value={powerSavingMode}
              onValueChange={async value => {
                await setPowerSavingMode(value)
              }}
            />
            <Spacer height={theme.spacing.md} />
          </Group>
        )}

        {!Constants.expoConfig?.extra?.CUSTOM_BACKEND_URL_OVERRIDE && <BackendUrl />}

        <Spacer height={theme.spacing.md} />
        <Spacer height={theme.spacing.xxl} />
      </ScrollView>
    </Screen>
  )
}

const $warningContainer: ThemedStyle<ViewStyle> = ({colors, spacing, isDark}) => ({
  borderRadius: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderWidth: spacing.xxxs,
  borderColor: colors.destructive,
  backgroundColor: isDark ? "#2B1E1A" : "#FEEBE7",
})

const $warningContent: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  marginBottom: 4,
})

const $warningTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "bold",
  marginLeft: 6,
  color: colors.text,
})

const $warningSubtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  marginLeft: 22,
  color: colors.text,
})
