import {View, ViewStyle, TextStyle} from "react-native"

import {Text} from "@/components/ignite"
import {ThemedSlider} from "@/components/misc/ThemedSlider"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

type SliderSettingProps = {
  label: string
  subtitle?: string
  value: number | undefined // Allow undefined if value might not always be set
  min: number
  max: number
  onValueChange: (value: number) => void // For immediate feedback, e.g., UI updates
  onValueSet: (value: number) => void // For BLE requests or final actions
  style?: ViewStyle
  disableBorder?: boolean
}

const SliderSetting: React.FC<SliderSettingProps> = ({
  label,
  subtitle,
  value = 0, // Default value if not provided
  min,
  max,
  onValueChange,
  onValueSet,
  style,
  disableBorder = false,
}) => {
  const handleValueChange = (val: number) => {
    const roundedValue = Math.round(val)
    onValueChange(roundedValue) // Emit only integer values
  }

  const handleValueSet = (val: number) => {
    const roundedValue = Math.round(val)
    onValueSet(roundedValue) // Emit only integer values
  }

  const {themed} = useAppTheme()

  return (
    <View style={[themed($container), disableBorder && {borderWidth: 0}, style]}>
      <View style={themed($textContainer)}>
        <View style={themed($labelRow)}>
          <Text text={label} style={themed($label)} />
          <Text text={String(value || 0)} style={themed($valueText)} />
        </View>
        {subtitle && <Text text={subtitle} style={themed($subtitle)} />}
      </View>
      <ThemedSlider
        value={value || 0}
        min={min}
        max={max}
        onValueChange={handleValueChange}
        onSlidingComplete={handleValueSet}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "column",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  width: "100%",
  backgroundColor: colors.backgroundAlt,
  paddingVertical: spacing.s4,
  paddingHorizontal: spacing.s6,
  borderRadius: spacing.s4,
  borderWidth: spacing.s0_5,
  borderColor: colors.border,
})

const $textContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  gap: 4,
  width: "100%",
  marginBottom: 8,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
})

const $labelRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
})

const $valueText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.textDim,
  fontWeight: "500",
})

export default SliderSetting
