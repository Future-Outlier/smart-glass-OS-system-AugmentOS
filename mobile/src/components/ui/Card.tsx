import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {View, ViewStyle} from "react-native"

export const Card = ({children}: {children: React.ReactNode}) => {
  const {themed} = useAppTheme()
  return <View style={themed($container)}>{children}</View>
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderRadius: spacing.xs,
  padding: spacing.sm,
})
