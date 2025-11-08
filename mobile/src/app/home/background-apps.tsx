import {ScrollView, TextStyle, View, ViewStyle} from "react-native"

import {ActiveBackgroundApps} from "@/components/home/ActiveBackgroundApps"
import {BackgroundAppsGrid} from "@/components/home/BackgroundAppsGrid"
import {Header, Screen, Text} from "@/components/ignite"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {$styles, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

export default function BackgroundAppsScreen() {
  const {themed, theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  return (
    <Screen preset="fixed" style={themed($styles.screen)}>
      <Header leftIcon="arrow-left" onLeftPress={goBack} titleTx="home:backgroundApps" />

      <View style={themed($headerInfo)}>
        <Text style={themed($headerText)}>Multiple background apps can be active at once.</Text>
      </View>

      <ScrollView
        style={themed($scrollView)}
        contentContainerStyle={themed($scrollViewContent)}
        showsVerticalScrollIndicator={false}>
        <ActiveBackgroundApps />
        <Spacer height={theme.spacing.s4} />
        <BackgroundAppsGrid />

        <Spacer height={theme.spacing.s12} />
      </ScrollView>
    </Screen>
  )
}

const $headerInfo: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  paddingHorizontal: spacing.s4,
  paddingVertical: spacing.s3,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
})

const $headerText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $scrollViewContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingTop: spacing.s4,
})
