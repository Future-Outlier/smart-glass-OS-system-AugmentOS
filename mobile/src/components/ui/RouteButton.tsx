import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import {ArrowLeftIcon} from "assets/icons/component/ArrowLeftIcon"

import {router as _router} from "expo-router"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"

interface RouteButtonProps {
  label: string
  subtitle?: string
  onPress?: () => void
  position?: "top" | "bottom" | "middle"
  text?: string
}

export default function RouteButton({label, subtitle, onPress, position, text}: RouteButtonProps) {
  const {theme, themed} = useAppTheme()

  let containerStyle
  if (position === "top") {
    containerStyle = themed($top)
  } else if (position === "bottom") {
    containerStyle = themed($bottom)
  } else if (position === "middle") {
    containerStyle = themed($middle)
  }

  return (
    <View style={[themed($settingsGroup), containerStyle, {paddingVertical: 0}]}>
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
            <Text style={themed($label)}>{label}</Text>
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

const $top: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.md,
  borderBottomLeftRadius: spacing.xxs,
  borderBottomRightRadius: spacing.xxs,
})

const $bottom: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.md,
  borderTopLeftRadius: spacing.xxs,
  borderTopRightRadius: spacing.xxs,
})

const $middle: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.xxs,
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
