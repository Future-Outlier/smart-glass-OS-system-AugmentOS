import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {Icon, Text} from "@/components/ignite"
import {ArrowLeftIcon} from "assets/icons/component/ArrowLeftIcon"

import {router as _router} from "expo-router"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"

interface StatusCardProps {
  label: string
  text?: string
  style?: ViewStyle
  textStyle?: TextStyle
  iconStart?: React.ReactNode
  iconEnd?: React.ReactNode
  subtitle?: string
}

export function StatusCard({label, style, iconStart, iconEnd, textStyle, subtitle}: StatusCardProps) {
  const {theme, themed} = useAppTheme()

  return (
    <View style={[themed($settingsGroup), themed($statusCardContainer), style]}>
      <View style={{flexDirection: "row", alignItems: "center", gap: theme.spacing.s4}}>
        {iconStart && <View style={themed($icon)}>{iconStart}</View>}
        <View
          style={{
            gap: theme.spacing.s1,
          }}>
          <Text style={[themed($label), textStyle]}>{label}</Text>
          {subtitle && <Text style={themed($subtitle)}>{subtitle}</Text>}
        </View>
      </View>
      {iconEnd && iconEnd}
    </View>
  )
}

const $statusCardContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  // paddingVertical: 16,
  height: 48,
  alignItems: "center",
})

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
              gap: theme.spacing.s1,
            }}>
            <View style={{flexDirection: "row", alignItems: "center", gap: theme.spacing.s4}}>
              {icon && <View style={themed($icon)}>{icon}</View>}
              <Text style={themed($label)}>{label}</Text>
            </View>
            {subtitle && <Text style={themed($subtitle)}>{subtitle}</Text>}
          </View>
          {onPress && (
            <View style={themed($iconContainer)}>
              <Icon name="arrow-right" size={24} color={theme.colors.foreground} />
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
  paddingVertical: spacing.s3,
  paddingHorizontal: spacing.s4,
  borderRadius: spacing.s4,
})

const $text: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontWeight: 300,
  color: colors.text,
  fontSize: spacing.s4,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  padding: spacing.s3,
  width: spacing.s12,
  height: spacing.s12,
  borderRadius: spacing.s12,
  alignItems: "center",
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontWeight: 600,
  color: colors.secondary_foreground,
  fontSize: 14,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.s3,
  fontWeight: "400",
})
