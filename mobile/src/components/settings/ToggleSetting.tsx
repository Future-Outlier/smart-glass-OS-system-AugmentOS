import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {View, ViewStyle, TextStyle} from "react-native"
import {Switch, Text} from "@/components/ignite"

type ToggleSettingProps = {
  label: string
  subtitle?: string
  value: boolean
  onValueChange: (newValue: boolean) => void
  disabled?: boolean
  style?: ViewStyle
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({
  label,
  subtitle,
  value,
  onValueChange,
  disabled = false,
  style,
}) => {
  const {themed} = useAppTheme()

  return (
    <View style={[themed($container), style, disabled && {opacity: 0.5}]}>
      <View style={themed($textContainer)}>
        <Text text={label} style={themed($label)} />
        {subtitle && <Text text={subtitle} style={themed($subtitle)} />}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  backgroundColor: colors.primary_foreground,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.md,
  // borderWidth: spacing.xxxs,
  // borderColor: colors.border,
})

const $textContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  gap: 4,
  flex: 1,
  marginRight: 16, // Add spacing between text and toggle
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: 600,
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
})

export default ToggleSetting
