import {Image, ImageSourcePropType, ImageStyle, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Screen, Text} from "@/components/ignite"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {TxKeyPath} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import {$styles, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

import {DeviceTypes} from "@/../../cloud/packages/types/src"

const CardButton = ({onPress, tx, imageSrc}: {onPress: () => void; tx: string; imageSrc: ImageSourcePropType}) => {
  const {themed} = useAppTheme()
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={themed($cardButton)}>
      <Image source={imageSrc} style={themed($cardButtonImage)} />
      <Text tx={tx as TxKeyPath} style={themed($cardButtonText)} />
    </TouchableOpacity>
  )
}

const $cardButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  height: 190,
  borderRadius: spacing.s6,
  padding: 16,
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.25,
  shadowRadius: 3.84,
  elevation: 5,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.s4,
})

const $cardButtonImage: ThemedStyle<ImageStyle> = ({spacing}) => ({
  // width: 100,
  // height: 100,
  marginRight: spacing.s2,
})

const $cardButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.secondary_foreground,
  fontSize: 20,
  fontWeight: 400,
})

export default function OnboardingWelcome() {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()
  const [_onboarding, setOnboardingCompleted] = useSetting(SETTINGS.onboarding_completed.key)

  // User has smart glasses - go to glasses selection screen
  const handleHasGlasses = async () => {
    // TODO: Track analytics event - user has glasses
    // analytics.track('onboarding_has_glasses_selected')
    setOnboardingCompleted(true)
    push("/pairing/select-glasses-model", {onboarding: true})
  }

  // User doesn't have glasses yet - go directly to simulated glasses
  const handleNoGlasses = () => {
    // TODO: Track analytics event - user doesn't have glasses
    // analytics.track('onboarding_no_glasses_selected')
    setOnboardingCompleted(true)
    // Go directly to simulated glasses pairing screen
    push("/pairing/prep", {glassesModelName: DeviceTypes.SIMULATED})
  }

  return (
    <Screen
      preset="fixed"
      backgroundColor={theme.colors.primary_foreground}
      style={themed($styles.screen)}
      safeAreaEdges={["top"]}>
      <Image source={require("@assets/logo/logo.svg")} style={themed($logo)} />

      <View style={themed($infoContainer)}>
        <Text style={themed($title)} tx="onboarding:welcome" />
        <Spacer height={theme.spacing.s4} />
        <Text style={themed($subtitle)} tx="onboarding:doYouHaveGlasses" />
      </View>
      <Spacer height={theme.spacing.s12} />
      <CardButton
        onPress={handleHasGlasses}
        tx="onboarding:haveGlasses"
        imageSrc={require("@assets/glasses/have.svg")}
      />
      <Spacer height={theme.spacing.s8} />
      <CardButton
        onPress={handleNoGlasses}
        tx="onboarding:dontHaveGlasses"
        imageSrc={require("@assets/glasses/dont-have.svg")}
      />
    </Screen>
  )
}

const $logo: ThemedStyle<ImageStyle> = ({spacing}) => ({
  alignSelf: "center",
  marginTop: spacing.s6,
  marginBottom: spacing.s18,
})

const $infoContainer: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flex: 0,
  justifyContent: "center",
  width: "100%",
})

const $title: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 30,
  lineHeight: 30,
  fontWeight: 600,
  textAlign: "center",
  color: colors.secondary_foreground,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: 400,
  textAlign: "center",
  color: colors.secondary_foreground,
})
