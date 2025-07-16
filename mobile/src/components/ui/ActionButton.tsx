import React from "react"
import {TouchableOpacity, Text, ViewStyle, TextStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

export type ActionButtonVariant = "default" | "warning" | "destructive" | "secondary"

interface ActionButtonProps {
  /**
   * The text to display in the button
   */
  label: string

  /**
   * The button variant - default (blue), warning (orange), or destructive (red)
   */
  variant?: ActionButtonVariant

  /**
   * Callback when the button is pressed
   */
  onPress: () => void

  /**
   * Whether the button is disabled
   */
  disabled?: boolean

  /**
   * Optional style overrides for the container
   */
  containerStyle?: ViewStyle
}

/**
 * A reusable action button component for settings screens.
 * Similar to RouteButton but for actions like delete, disconnect, etc.
 */
export default function ActionButton({
  label,
  variant = "default",
  onPress,
  disabled = false,
  containerStyle,
}: ActionButtonProps) {
  const {theme, themed} = useAppTheme()

  const getTextColor = () => {
    switch (variant) {
      case "warning":
        return theme.colors.palette.accent100
      case "destructive":
        return theme.colors.destructiveAction
      case "secondary":
        return theme.colors.textDim
      default:
        return theme.colors.palette.primary500
    }
  }

  return (
    <TouchableOpacity
      style={[themed($container), disabled && {opacity: 0.4}, containerStyle]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}>
      <Text style={[themed($text), {color: getTextColor()}]}>{label}</Text>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.md,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})

const $text: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: spacing.md,
  fontWeight: "500",
  textAlign: "left",
})
