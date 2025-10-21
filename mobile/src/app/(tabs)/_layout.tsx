import {Platform, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import {Tabs} from "expo-router/tabs"
import {NativeTabs, Icon, Label} from "expo-router/unstable-native-tabs"
import {LinearGradient} from "expo-linear-gradient"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import HomeIcon from "assets/icons/navbar/HomeIcon"
import StoreIcon from "assets/icons/navbar/StoreIcon"
import UserIcon from "assets/icons/navbar/UserIcon"
import {translate} from "@/i18n"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function Layout() {
  const {theme, themed} = useAppTheme()
  const {replace} = useNavigationHistory()

  const iconFocusedColor = theme.colors.primary
  const iconInactiveColor = theme.colors.textDim

  if (Platform.OS === "ios") {
    return (
      <NativeTabs backgroundColor={"#FFFFFF"}>
        <NativeTabs.Trigger name="home">
          <Label>{translate("navigation:home")}</Label>
          <Icon sf="house.fill" drawable="custom_android_drawable" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="glasses">
          <Icon sf="eyes" drawable="custom_settings_drawable" />
          <Label>{translate("navigation:glasses")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="store">
          <Icon sf="cart.fill" drawable="custom_settings_drawable" />
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
            return <UserIcon size={28} color={mColor} />
          },
          tabBarLabel: translate("navigation:account"),
          // tabBarButton: ({, color}) => userIcon(focused),
        }}
      />
    </Tabs>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = () => ({
  // backgroundColor: "red",
  // borderTopColor: colors.separator,
  // borderTopWidth: 10,
  // paddingTop: spacing.sm,
  // height: 40,
  // width: 50,
})

const $tabBarItem: ThemedStyle<ViewStyle> = () => ({
  // paddingTop: spacing.sm,
  // paddingBottom: spacing.xs,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  marginTop: 4,
})
