import {AccountGroup} from "@/components/account/AccountGroup"
import {Header, Screen, Text} from "@/components/ignite"
import RouteButton from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import Constants from "expo-constants"
import {useRef} from "react"
import {Platform, View, ViewStyle} from "react-native"
import {ScrollView} from "react-native-gesture-handler"
import Toast from "react-native-toast-message"
import {ProfileCard} from "@/components/account/ProfileCard"

export default function AccountPage() {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()
  const [devMode, setDevMode] = useSetting(SETTINGS_KEYS.dev_mode)
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<number | null>(null)

  const handleQuickPress = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - lastPressTime.current
    const maxTimeDiff = 2000
    const maxPressCount = 10
    const showAlertAtPressCount = 5

    // Reset counter if too much time has passed
    if (timeDiff > maxTimeDiff) {
      pressCount.current = 1
    } else {
      pressCount.current += 1
    }

    lastPressTime.current = currentTime

    // Clear existing timeout
    if (pressTimeout.current) {
      clearTimeout(pressTimeout.current)
    }

    // Handle different press counts
    if (pressCount.current === maxPressCount) {
      showAlert("Developer Mode", "Developer mode enabled!", [{text: translate("common:ok")}])
      setDevMode(true)
      pressCount.current = 0
    } else if (pressCount.current >= showAlertAtPressCount) {
      const remaining = maxPressCount - pressCount.current
      Toast.show({
        type: "info",
        text1: "Developer Mode",
        text2: `${remaining} more taps to enable developer mode`,
        position: "bottom",
        topOffset: 80,
        visibilityTime: 1000,
      })
    }

    // Reset counter after 2 seconds of no activity
    pressTimeout.current = setTimeout(() => {
      pressCount.current = 0
    }, maxTimeDiff)
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.xl}}>
      <Header leftTx="settings:title" onLeftPress={handleQuickPress} />

      <ScrollView
        style={{marginRight: -theme.spacing.xl, paddingRight: theme.spacing.xl}}
        contentInsetAdjustmentBehavior="automatic">
        {/*<Spacer height={theme.spacing.xl} />*/}

        <ProfileCard />

        <View style={{flex: 1, gap: theme.spacing.lg}}>
          <AccountGroup title={translate("account:accountSettings")}>
            <RouteButton label={translate("settings:profileSettings")} onPress={() => push("/settings/profile")} />
            <RouteButton label={translate("settings:feedback")} onPress={() => push("/settings/feedback")} />
          </AccountGroup>

          {defaultWearable && (
            <AccountGroup title={translate("account:deviceSettings")}>
              <RouteButton label={defaultWearable} onPress={() => push("/settings/glasses")} />
              {/*<RouteButton label={translate("settings:transcription")} onPress={() => push("/settings/transcription")} />*/}
            </AccountGroup>
          )}

          <AccountGroup title={translate("account:appSettings")}>
            <RouteButton label={translate("settings:themeSettings")} onPress={() => push("/settings/theme")} />
            {/*<RouteButton label={translate("settings:transcription")} onPress={() => push("/settings/transcription")} />*/}
            {Platform.OS === "android" && (
              <RouteButton label="Notification Settings" onPress={() => push("/settings/notifications")} />
            )}
            <RouteButton
              label={translate("settings:transcriptionSettings")}
              onPress={() => push("/settings/transcription")}
            />
            <RouteButton label={translate("settings:privacySettings")} onPress={() => push("/settings/privacy")} />
          </AccountGroup>

          {devMode && (
            <>
              <RouteButton
                label={translate("settings:developerSettings")}
                onPress={() => push("/settings/developer")}
              />
            </>
          )}
        </View>

        <View style={themed($versionContainer)}>
          <Text
            text={translate("common:version", {number: Constants.expoConfig?.extra?.MENTRAOS_VERSION})}
            style={{color: theme.colors.textDim}}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const $versionContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  bottom: spacing.xs,
  width: "100%",
  paddingVertical: spacing.xs,
  borderRadius: spacing.md,
  marginTop: spacing.xxxl,
})
