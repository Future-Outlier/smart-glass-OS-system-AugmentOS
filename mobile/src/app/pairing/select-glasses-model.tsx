import {View, TouchableOpacity, Platform, ScrollView, Image, ViewStyle, ImageStyle, TextStyle} from "react-native"
import {Text} from "@/components/ignite"
import {getGlassesImage} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {Screen} from "@/components/ignite/Screen"
import {Header} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {DeviceTypes} from "@/../../cloud/packages/types/src"
import {useLocalSearchParams} from "expo-router"

export default function SelectGlassesModelScreen() {
  const {theme, themed} = useAppTheme()
  const {push, replace, goBack} = useNavigationHistory()
  const {onboarding} = useLocalSearchParams()

  // Platform-specific glasses options
  const glassesOptions =
    Platform.OS === "ios"
      ? [
          // {modelName: DeviceTypes.SIMULATED, key: DeviceTypes.SIMULATED},
          {modelName: DeviceTypes.G1, key: "evenrealities_g1"},
          {modelName: DeviceTypes.LIVE, key: "mentra_live"},
          {modelName: DeviceTypes.MACH1, key: "mentra_mach1"},
          // {modelName: DeviceTypes.NEX, key: "mentra_nex"},
          // {modelName: "Vuzix Z100", key: "vuzix-z100"},
          //{modelName: "Brilliant Labs Frame", key: "frame"},
        ]
      : [
          // Android:
          // {modelName: DeviceTypes.SIMULATED, key: DeviceTypes.SIMULATED},
          {modelName: DeviceTypes.G1, key: "evenrealities_g1"},
          {modelName: DeviceTypes.LIVE, key: "mentra_live"},
          {modelName: DeviceTypes.MACH1, key: "mentra_mach1"},
          // {modelName: "Mentra Nex", key: "mentra_nex"},
          // {modelName: "Vuzix Z100", key: "vuzix-z100"},
          // {modelName: "Brilliant Labs Frame", key: "frame"},
        ]

  const triggerGlassesPairingGuide = async (glassesModelName: string) => {
    // No need for Bluetooth permissions anymore as we're using direct communication
    console.log("TRIGGERING SEARCH SCREEN FOR: " + glassesModelName)
    push("/pairing/prep", {glassesModelName: glassesModelName})
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.s4}} safeAreaEdges={["bottom"]}>
      <Header
        titleTx="pairing:selectModel"
        leftIcon="caretLeft"
        onLeftPress={() => {
          if (onboarding) {
            goBack()
          } else {
            replace("/(tabs)/home")
          }
        }}
      />
      <ScrollView style={{marginRight: -theme.spacing.s4, paddingRight: theme.spacing.s4}}>
        <View style={{flexDirection: "column", gap: theme.spacing.s4}}>
          {glassesOptions
            .filter(glasses => {
              // Hide simulated glasses during onboarding (users get there via "I don't have glasses yet")
              if (onboarding && glasses.modelName === DeviceTypes.SIMULATED) {
                return false
              }
              return true
            })
            .map(glasses => (
              <TouchableOpacity
                key={glasses.key}
                style={themed($settingItem)}
                onPress={() => triggerGlassesPairingGuide(glasses.modelName)}>
                <Image source={getGlassesImage(glasses.modelName)} style={themed($glassesImage)} />
                <Text style={[themed($label)]}>{glasses.modelName}</Text>
              </TouchableOpacity>
            ))}
        </View>
      </ScrollView>
    </Screen>
  )
}

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.s3,
  height: 190,
  borderRadius: spacing.s4,
  backgroundColor: colors.primary_foreground,
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: 180,
  maxHeight: 80,
  resizeMode: "contain",
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: spacing.s4,
  fontWeight: "600",
  flexWrap: "wrap",
  color: colors.text,
})
