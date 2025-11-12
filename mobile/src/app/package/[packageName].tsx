// loading screen with a spinner

import {Icon} from "@/components/ignite/Icon"
import {Screen} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {View, Text, ActivityIndicator, ViewStyle, TextStyle} from "react-native"

export default function LoadingScreen() {
  const {themed, theme} = useAppTheme()

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <View style={themed($mainContainer)}>
        <View style={themed($infoContainer)}>
          {/* <View style={themed($iconContainer)}>
            <Icon name="check-circle" size={80} color={theme.colors.palette.primary500} />
          </View> */}

          {/* <Text style={themed($title)}>{getStatusTitle()}</Text> */}
        </View>
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
})

const $mainContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  flexDirection: "column",
  justifyContent: "space-between",
  padding: spacing.s6,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingTop: spacing.s8,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s8,
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 28,
  fontWeight: "bold",
  fontFamily: typography.primary.bold,
  textAlign: "center",
  marginBottom: spacing.s4,
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 16,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  marginBottom: spacing.s8,
  lineHeight: 24,
  paddingHorizontal: spacing.s6,
  color: colors.textDim,
})

const $versionText: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 14,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  marginBottom: spacing.s2,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  alignItems: "center",
  paddingBottom: spacing.s8,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  marginBottom: spacing.s4,
})
