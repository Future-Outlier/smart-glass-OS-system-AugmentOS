import {useRef} from "react"
import {Tabs} from "expo-router/tabs"
import {translate} from "@/i18n"
import {ThemedStyle} from "@/theme"
import {TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {useAppTheme} from "@/utils/useAppTheme"
import {LinearGradient} from "expo-linear-gradient"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import HomeIcon from "assets/icons/navbar/HomeIcon"
import StoreIcon from "assets/icons/navbar/StoreIcon"
import UserIcon from "assets/icons/navbar/UserIcon"
import showAlert from "@/utils/AlertUtils"
import Toast from "react-native-toast-message"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS} from "@/stores/settings"
import {useSettingsStore} from "@/stores/settings"
import {Platform} from "react-native"
import {NativeTabs, Icon, Label} from "expo-router/unstable-native-tabs"

export default function Layout() {
  const {bottom} = useSafeAreaInsets()

  const isNewUi = useSettingsStore(state => state.settings[SETTINGS_KEYS.new_ui])
  const setSetting = useSettingsStore(state => state.setSetting)
  const {theme, themed} = useAppTheme()
  const {replace} = useNavigationHistory()

  const iconFocusedColor = theme.colors.primary
  const iconInactiveColor = theme.colors.textDim

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<number | null>(null)

  const handleQuickPress = () => {
    replace("/settings")

    const currentTime = Date.now()
    const timeDiff = currentTime - lastPressTime.current
    const maxTimeDiff = 2000
    const maxPressCount = 10
    const showAlertAtPressCount = 5

    // Reset counter if too much time has passed (more than 500ms between presses)
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
      // Show alert on 8th press
      showAlert("Developer Mode", "You are now a developer!", [{text: translate("common:ok")}])
      useSettingsStore.getState().setSetting(SETTINGS_KEYS.dev_mode, true)
      pressCount.current = 0
    } else if (pressCount.current >= showAlertAtPressCount) {
      const remaining = maxPressCount - pressCount.current
      Toast.show({
        type: "info",
        text1: "Developer Mode",
        text2: `${remaining} more taps to enable developer mode`,
        position: "top",
        topOffset: 80,
        visibilityTime: 1000,
      })
    }

    // Reset counter after 2 seconds of no activity
    pressTimeout.current = setTimeout(() => {
      pressCount.current = 0
    }, maxTimeDiff)
  }

  if (Platform.OS === "ios") {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Label>{translate("navigation:home")}</Label>
          <Icon sf="house.fill" drawable="custom_android_drawable" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf="gear" drawable="custom_settings_drawable" />
          <Label>{translate("navigation:glasses")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf="gear" drawable="custom_settings_drawable" />
          <Label>{translate("navigation:store")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf="gear" drawable="custom_settings_drawable" />
          <Label>{translate("navigation:account")}</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    )
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarStyle: [
          themed($tabBar),
          {
            // height: 90,
            // paddingBottom: 10,
            // marginBottom: 100,
            // borderTopColor moved to View wrapping LinearGradient
            borderTopWidth: 0,
            // backgroundColor: "transparent",
          },
        ],
        tabBarActiveTintColor: iconFocusedColor,
        tabBarInactiveTintColor: iconInactiveColor,
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
        tabBarLabelPosition: "below-icon",
        // tabBarPosition: 'left',
        // animation: 'shift',
        // tabBarBackground: () => <View />,
        tabBarVariant: "uikit",
        tabBarBackground: () => (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderTopColor: theme.colors.separator,
              // borderTopWidth: 1,
              overflow: "hidden",
            }}>
            <LinearGradient
              colors={[theme.colors.backgroundStart, theme.colors.backgroundEnd]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
              start={{x: 0, y: 0}}
              end={{x: 0, y: 2}}
            />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          href: "/home",
          headerShown: false,
          // tabBarIcon: ({focused, color}) => (
          //   <HomeIcon size={28} color={focused ? iconFocusedColor : theme.colors.tabBarIconInactive} />
          // ),
          tabBarIcon: ({focused}) => {
            const mColor = focused ? iconFocusedColor : iconInactiveColor
            return (
              <TouchableOpacity onPress={() => replace("/home")}>
                <HomeIcon size={28} color={mColor} />
              </TouchableOpacity>
            )
          },
          tabBarLabel: translate("navigation:home"),
        }}
      />
      <Tabs.Screen
        name="glasses"
        options={{
          href: "/glasses",
          headerShown: false,
          tabBarIcon: ({focused}) => {
            const mColor = focused ? iconFocusedColor : iconInactiveColor
            return <SolarLineIconsSet4 size={28} color={mColor} />
          },
          tabBarLabel: translate("navigation:glasses"),
        }}
      />
      {/* <Tabs.Screen
        name="mirror"
        options={{
          href: "/mirror",
          headerShown: false,
          tabBarIcon: ({focused, color}) => (
            <MirrorIcon size={28} color={focused ? iconFocusedColor : theme.colors.textDim} />
          ),
          tabBarLabel: translate("navigation:mirror"),
        }}
      /> */}
      <Tabs.Screen
        name="store"
        options={{
          href: "/store",
          headerShown: false,
          tabBarIcon: ({focused}) => {
            const mColor = focused ? iconFocusedColor : iconInactiveColor
            return <StoreIcon size={28} color={mColor} />
          },
          tabBarLabel: translate("navigation:store"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: "/settings",
          headerShown: false,
          tabBarIcon: ({focused}) => {
            const mColor = focused ? iconFocusedColor : iconInactiveColor
            return (
              <TouchableOpacity onPress={handleQuickPress}>
                <UserIcon size={28} color={mColor} />
              </TouchableOpacity>
            )
          },
          tabBarLabel: translate("navigation:account"),
          // tabBarButton: ({, color}) => userIcon(focused),
        }}
      />
    </Tabs>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  // backgroundColor: "red",
  // borderTopColor: colors.separator,
  // borderTopWidth: 10,
  // paddingTop: spacing.sm,
  // height: 40,
  // width: 50,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  // paddingTop: spacing.sm,
  // paddingBottom: spacing.xs,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  marginTop: 4,
})
