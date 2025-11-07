import {Icon, IconTypes, Text} from "@/components/ignite"
import {translate} from "@/i18n"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps} from "expo-router/ui"
import {Pressable, TextStyle, View, ViewStyle} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"

type TabButtonProps = TabTriggerSlotProps & {
  iconName: IconTypes
  label: string
}

export default function Layout() {
  const {theme, themed} = useAppTheme()
  const {bottom} = useSafeAreaInsets()

  function TabButton({iconName, isFocused, label, ...props}: TabButtonProps) {
    // const iconColor = isFocused ? theme.colors.primary : theme.colors.textDim
    const iconColor = isFocused ? theme.colors.background : theme.colors.muted_foreground
    const textColor = isFocused ? theme.colors.secondary_foreground : theme.colors.muted_foreground
    const iconBgColor = isFocused ? theme.colors.primary : theme.colors.background
    return (
      <Pressable {...props} style={[themed($tabButton), {marginBottom: bottom}]}>
        <View style={[themed($icon), {backgroundColor: iconBgColor}]}>
          <Icon name={iconName} size={24} color={iconColor} />
        </View>
        <Text text={label} style={[themed($tabLabel), {color: textColor}]} />
      </Pressable>
    )
  }

  return (
    <Tabs>
      <TabSlot />
      <TabList style={themed($tabList)}>
        <TabTrigger name="home" href="/home" style={themed($tabTrigger)} asChild>
          <TabButton iconName="home" label={translate("navigation:home")} />
        </TabTrigger>
        <TabTrigger name="store" href="/store" style={themed($tabTrigger)} asChild>
          <TabButton iconName="shopping-bag" label={translate("navigation:store")} />
        </TabTrigger>
        <TabTrigger name="account" href="/account" style={themed($tabTrigger)} asChild>
          <TabButton iconName={"user-round-filled"} label={translate("navigation:account")} />
        </TabTrigger>
      </TabList>
    </Tabs>
  )
}

const $icon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
  borderRadius: spacing.md,
})

const $tabList: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  backgroundColor: colors.primary_foreground + "fb",
  position: "absolute",
  bottom: 0,
  borderTopColor: colors.separator,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
})

const $tabTrigger: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.xs,
})

const $tabLabel: ThemedStyle<TextStyle> = ({typography}) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
})

const $tabButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexDirection: "column",
  gap: spacing.xxs,
  flex: 1,
})
