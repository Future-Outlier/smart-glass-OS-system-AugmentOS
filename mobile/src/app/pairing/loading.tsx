import {useState, useEffect, useRef, useCallback} from "react"
import {View, TouchableOpacity, ScrollView, ViewStyle, TextStyle, BackHandler, Platform} from "react-native"
import {Text} from "@/components/ignite"
import {useRoute} from "@react-navigation/native"
import Icon from "react-native-vector-icons/FontAwesome"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import GlassesPairingLoader from "@/components/misc/GlassesPairingLoader"
import {AudioPairingPrompt} from "@/components/pairing/AudioPairingPrompt"
import {router} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {Screen} from "@/components/ignite/Screen"
import {$styles, ThemedStyle} from "@/theme"
import {Header} from "@/components/ignite/Header"
import {PillButton} from "@/components/ignite/PillButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import CoreModule from "core"

export default function GlassesPairingGuideScreen() {
  const {replace, clearHistory, clearHistoryAndGoHome} = useNavigationHistory()
  const {status} = useCoreStatus()
  const route = useRoute()
  const {themed} = useAppTheme()
  const {glassesModelName} = route.params as {glassesModelName: string}
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  const [pairingInProgress, setPairingInProgress] = useState(true)
  const [audioPairingNeeded, setAudioPairingNeeded] = useState(false)
  const [audioDeviceName, setAudioDeviceName] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAlertShownRef = useRef(false)
  const backHandlerRef = useRef<any>(null)

  const handleForgetGlasses = useCallback(async () => {
    setPairingInProgress(false)
    await CoreModule.disconnect()
    await CoreModule.forget()
    clearHistory()
    router.dismissTo("/pairing/select-glasses-model")
  }, [clearHistory])

  useEffect(() => {
    if (Platform.OS !== "android") return

    const onBackPress = () => {
      handleForgetGlasses()
      return true
    }

    const timeout = setTimeout(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress)
      backHandlerRef.current = backHandler
    }, 100)

    return () => {
      clearTimeout(timeout)
      if (backHandlerRef.current) {
        backHandlerRef.current.remove()
        backHandlerRef.current = null
      }
    }
  }, [handleForgetGlasses])

  const handlePairFailure = (error: string) => {
    CoreModule.forget()
    replace("/pairing/failure", {error: error, glassesModelName: glassesModelName})
  }

  useEffect(() => {
    GlobalEventEmitter.on("PAIR_FAILURE", handlePairFailure)
    return () => {
      GlobalEventEmitter.off("PAIR_FAILURE", handlePairFailure)
    }
  }, [])

  // Audio pairing event handlers
  // Note: These events are only sent from iOS native code, so no need to gate on Platform.OS
  useEffect(() => {
    const handleAudioPairingNeeded = (data: {deviceName: string}) => {
      console.log("Audio pairing needed:", data.deviceName)
      setAudioPairingNeeded(true)
      setAudioDeviceName(data.deviceName)
      setPairingInProgress(false)
    }

    const handleAudioConnected = (data: {deviceName: string}) => {
      console.log("Audio connected:", data.deviceName)
      setAudioPairingNeeded(false)
      // Continue to home after audio is connected
      clearHistoryAndGoHome()
    }

    GlobalEventEmitter.on("AUDIO_PAIRING_NEEDED", handleAudioPairingNeeded)
    GlobalEventEmitter.on("AUDIO_CONNECTED", handleAudioConnected)

    return () => {
      GlobalEventEmitter.off("AUDIO_PAIRING_NEEDED", handleAudioPairingNeeded)
      GlobalEventEmitter.off("AUDIO_CONNECTED", handleAudioConnected)
    }
  }, [replace])

  useEffect(() => {
    hasAlertShownRef.current = false
    setPairingInProgress(true)

    timerRef.current = setTimeout(() => {
      if (!status.glasses_info?.model_name && !hasAlertShownRef.current) {
        hasAlertShownRef.current = true
      }
    }, 30000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    }
  }, [])

  useEffect(() => {
    if (!status.glasses_info?.model_name) return

    // Don't navigate to home if we're waiting for audio pairing
    if (audioPairingNeeded) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    clearHistoryAndGoHome()
  }, [status, clearHistoryAndGoHome, audioPairingNeeded])

  if (pairingInProgress) {
    return (
      <Screen preset="fixed" style={themed($styles.screen)}>
        <Header
          leftIcon="chevron-left"
          onLeftPress={handleForgetGlasses}
          RightActionComponent={
            <PillButton
              text="Help"
              variant="icon"
              onPress={() => setShowTroubleshootingModal(true)}
              buttonStyle={themed($pillButton)}
            />
          }
        />
        <GlassesPairingLoader glassesModelName={glassesModelName} />
        <GlassesTroubleshootingModal
          isVisible={showTroubleshootingModal}
          onClose={() => setShowTroubleshootingModal(false)}
          glassesModelName={glassesModelName}
        />
      </Screen>
    )
  }

  // Show audio pairing prompt if needed
  // Note: This will only trigger on iOS since the events are only sent from iOS native code
  if (audioPairingNeeded && audioDeviceName) {
    return (
      <Screen preset="fixed" style={themed($styles.screen)}>
        <Header
          leftIcon="chevron-left"
          onLeftPress={handleForgetGlasses}
          RightActionComponent={
            <PillButton
              text="Help"
              variant="icon"
              onPress={() => setShowTroubleshootingModal(true)}
              buttonStyle={themed($pillButton)}
            />
          }
        />
        <ScrollView style={themed($scrollView)}>
          <View style={themed($contentContainer)}>
            <AudioPairingPrompt
              deviceName={audioDeviceName}
              onSkip={() => {
                setAudioPairingNeeded(false)
                clearHistoryAndGoHome()
              }}
            />
          </View>
        </ScrollView>
        <GlassesTroubleshootingModal
          isVisible={showTroubleshootingModal}
          onClose={() => setShowTroubleshootingModal(false)}
          glassesModelName={glassesModelName}
        />
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header
        leftIcon="chevron-left"
        onLeftPress={handleForgetGlasses}
        RightActionComponent={
          <PillButton
            text="Help"
            variant="icon"
            onPress={() => setShowTroubleshootingModal(true)}
            buttonStyle={themed($pillButton)}
          />
        }
      />
      <ScrollView style={themed($scrollView)}>
        <View style={themed($contentContainer)}>
          <TouchableOpacity style={themed($helpButton)} onPress={() => setShowTroubleshootingModal(true)}>
            <Icon name="question-circle" size={16} color="#FFFFFF" style={{marginRight: 8}} />
            <Text style={themed($helpButtonText)}>Need Help Pairing?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <GlassesTroubleshootingModal
        isVisible={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
        glassesModelName={glassesModelName}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.s4,
})

const $pillButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.s4,
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $contentContainer: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "flex-start",
})

const $helpButton: ThemedStyle<ViewStyle> = ({isDark}) => ({
  alignItems: "center",
  borderRadius: 8,
  flexDirection: "row",
  justifyContent: "center",
  marginBottom: 30,
  marginTop: 20,
  paddingHorizontal: 20,
  paddingVertical: 12,
  backgroundColor: isDark ? "#3b82f6" : "#007BFF",
})

const $helpButtonText: ThemedStyle<TextStyle> = ({typography}) => ({
  color: "#FFFFFF",
  fontFamily: typography.primary.normal,
  fontSize: 16,
  fontWeight: "600",
})
