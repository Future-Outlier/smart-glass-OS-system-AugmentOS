import {useAppTheme} from "@/utils/useAppTheme"
import {View, ViewStyle, TextStyle, Platform} from "react-native"
import {Icon, Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {PillButton} from "@/components/ignite/PillButton"
import {BluetoothSettingsHelper} from "@/utils/BluetoothSettingsHelper"

interface AudioPairingPromptProps {
  deviceName: string
  onSkip?: () => void
}

/**
 * Component that prompts iOS users to pair Mentra Live for audio
 * Shows instructions and a button to open Bluetooth Settings
 */
export function AudioPairingPrompt({deviceName, onSkip}: AudioPairingPromptProps) {
  const {theme, themed} = useAppTheme()

  // Only show on iOS
  if (Platform.OS !== "ios") {
    return null
  }

  const handleOpenSettings = async () => {
    const success = await BluetoothSettingsHelper.openBluetoothSettings()
    if (!success) {
      console.error("Failed to open Bluetooth settings")
    }
  }

  return (
    <View style={themed($container)}>
      <View style={themed($iconContainer)}>
        <Icon name="device-airpods-case" size={48} color={theme.colors.tint} />
      </View>

      <Text style={themed($title)} preset="heading">
        Pair Audio
      </Text>

      <Text style={themed($description)} preset="default">
        To enable audio, please pair &quot;{deviceName}&quot; in your Bluetooth settings.
      </Text>

      <View style={themed($instructionsContainer)}>
        <View style={themed($instructionRow)}>
          <Text style={themed($stepNumber)}>1.</Text>
          <Text style={themed($instructionText)}>Tap &quot;Pair Audio Now&quot; below</Text>
        </View>
        <View style={themed($instructionRow)}>
          <Text style={themed($stepNumber)}>2.</Text>
          <Text style={themed($instructionText)}>Find &quot;{deviceName}&quot; in the list</Text>
        </View>
        <View style={themed($instructionRow)}>
          <Text style={themed($stepNumber)}>3.</Text>
          <Text style={themed($instructionText)}>Tap to pair</Text>
        </View>
        <View style={themed($instructionRow)}>
          <Text style={themed($stepNumber)}>4.</Text>
          <Text style={themed($instructionText)}>Return to this app</Text>
        </View>
      </View>

      <PillButton
        text="Pair Audio Now"
        onPress={handleOpenSettings}
        buttonStyle={themed($pairButton)}
        textStyle={themed($pairButtonText)}
      />

      {onSkip && (
        <PillButton
          text="Skip for now"
          onPress={onSkip}
          buttonStyle={themed($skipButton)}
          textStyle={themed($skipButtonText)}
        />
      )}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.lg,
  alignItems: "center",
})

const $iconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({spacing}) => ({
  fontSize: 24,
  fontWeight: "bold",
  marginBottom: spacing.sm,
  textAlign: "center",
})

const $description: ThemedStyle<TextStyle> = ({spacing}) => ({
  fontSize: 16,
  marginBottom: spacing.lg,
  textAlign: "center",
  opacity: 0.8,
})

const $instructionsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  marginBottom: spacing.lg,
})

const $instructionRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  marginBottom: spacing.sm,
  alignItems: "flex-start",
})

const $stepNumber: ThemedStyle<TextStyle> = ({spacing}) => ({
  fontSize: 16,
  fontWeight: "bold",
  marginRight: spacing.xs,
  minWidth: 24,
})

const $instructionText: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  flex: 1,
})

const $pairButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  marginBottom: spacing.sm,
})

const $pairButtonText: ThemedStyle<TextStyle> = () => ({
  fontWeight: "bold",
})

const $skipButton: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
  backgroundColor: "transparent",
})

const $skipButtonText: ThemedStyle<TextStyle> = () => ({
  opacity: 0.6,
})
