import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import {ArrowLeftIcon} from "assets/icons/component/ArrowLeftIcon"

import {router as _router} from "expo-router"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"

interface StatusCardProps {
  label: string
  text?: string
  style?: ViewStyle
  iconStart?: React.ReactNode
  iconEnd?: React.ReactNode
}

export function StatusCard({label, style, iconStart, iconEnd}: StatusCardProps) {
  const {theme, themed} = useAppTheme()

  return (
    <View style={[themed($settingsGroup), {paddingVertical: 0}, style]}>
      <View style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, alignItems: "center"}}>
        <View
          style={{
            flexDirection: "column",
            justifyContent: "space-between",
            paddingVertical: 8,
            maxWidth: "90%",
            gap: theme.spacing.xxs,
          }}>
          <View style={{flexDirection: "row", alignItems: "center", gap: theme.spacing.md}}>
            {iconStart && <View style={themed($icon)}>{iconStart}</View>}
            <Text style={themed($label)}>{label}</Text>
          </View>
        </View>
        {iconEnd && iconEnd}
      </View>
    </View>
  )
}

interface RouteButtonProps {
  label: string
  subtitle?: string
  onPress?: () => void
  position?: "top" | "bottom" | "middle"
  text?: string
  style?: ViewStyle
  icon?: React.ReactNode
}

export function RouteButton({label, subtitle, onPress, style, text, icon}: RouteButtonProps) {
  const {theme, themed} = useAppTheme()

  return (
    <View style={[themed($settingsGroup), {paddingVertical: 0}, style]}>
      <TouchableOpacity onPress={onPress} disabled={!onPress}>
        <View style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, alignItems: "center"}}>
          <View
            style={{
              flexDirection: "column",
              justifyContent: "space-between",
              paddingVertical: 8,
              maxWidth: "90%",
              gap: theme.spacing.xxs,
            }}>
            <View style={{flexDirection: "row", alignItems: "center", gap: theme.spacing.md}}>
              {icon && <View style={themed($icon)}>{icon}</View>}
              <Text style={themed($label)}>{label}</Text>
            </View>
            {subtitle && <Text style={themed($subtitle)}>{subtitle}</Text>}
          </View>
          {onPress && (
            <View style={themed($iconContainer)}>
              <ArrowLeftIcon size={24} color={theme.colors.text} />
            </View>
          )}
          {text && <Text style={themed($text)}>{text}</Text>}
        </View>
      </TouchableOpacity>
    </View>
  )
}

const $icon: ThemedStyle<ViewStyle> = () => ({
  justifyContent: "center",
  alignItems: "center",
})

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.md,
})

const $text: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontWeight: 300,
  color: colors.text,
  fontSize: spacing.md,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  padding: spacing.sm,
  width: spacing.xxl,
  height: spacing.xxl,
  borderRadius: spacing.xxl,
  transform: [{scaleX: -1}],
  alignItems: "center",
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontWeight: "500",
  color: colors.text,
  fontSize: spacing.md,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
  fontWeight: "400",
})
