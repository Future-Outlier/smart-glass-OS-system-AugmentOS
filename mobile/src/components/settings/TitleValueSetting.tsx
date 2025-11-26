import {View, ViewStyle, TextStyle} from "react-native"

import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

type TitleValueSettingProps = {
  label: string
  value: string
}

const TitleValueSetting = ({label, value}: TitleValueSettingProps) => {
  const {themed} = useAppTheme()
  return (
    <View style={themed($container)}>
      <Text text={label} style={themed($label)} />
      <Text text={value} style={themed($value)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  marginVertical: 10,
  width: "100%",
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  fontWeight: "bold",
  color: colors.text,
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  marginTop: 5,
  color: colors.text,
})

export default TitleValueSetting
