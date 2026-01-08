import {useRoute} from "@react-navigation/native"
import CoreModule from "core"
import {useEffect, useRef, useState} from "react"
import {BackHandler, Platform, ScrollView, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"

import {Button, Icon, Text} from "@/components/ignite"
import {Header} from "@/components/ignite/Header"
import {PillButton} from "@/components/ignite/PillButton"
import {Screen} from "@/components/ignite/Screen"
import GlassesPairingLoader from "@/components/misc/GlassesPairingLoader"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import {AudioPairingPrompt} from "@/components/pairing/AudioPairingPrompt"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useGlassesStore} from "@/stores/glasses"
import {$styles, ThemedStyle} from "@/theme"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"

const CDN_BASE = "https://mentra-videos-cdn.mentraglass.com/onboarding/mentra-live/light"

export default function BtClassicPairingScreen() {
  const {pushPrevious} = useNavigationHistory()
  const route = useRoute()
  const {glassesModelName, deviceName} = route.params as {glassesModelName: string; deviceName?: string}
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  const [pairingInProgress, setPairingInProgress] = useState(true)
  const btcConnected = useGlassesStore((state) => state.btcConnected)

  // useEffect(() => {
  //   if (Platform.OS !== "android") return

  //   const onBackPress = () => {
  //     goBack()
  //     return true
  //   }

  //   const timeout = setTimeout(() => {
  //     const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress)
  //     backHandlerRef.current = backHandler
  //   }, 100)

  //   return () => {
  //     clearTimeout(timeout)
  //     if (backHandlerRef.current) {
  //       backHandlerRef.current.remove()
  //       backHandlerRef.current = null
  //     }
  //   }
  // }, [goBack])

  // const handlePairFailure = (error: string) => {
  //   CoreModule.forget()
  //   replace("/pairing/failure", {error: error, glassesModelName: glassesModelName})
  // }

  // useEffect(() => {
  //   GlobalEventEmitter.on("pair_failure", handlePairFailure)
  //   return () => {
  //     GlobalEventEmitter.off("pair_failure", handlePairFailure)
  //   }
  // }, [])

  // Audio pairing event handlers
  // Note: These events are only sent from iOS native code, so no need to gate on Platform.OS
  // useEffect(() => {
  //   const handleAudioPairingNeeded = (data: {deviceName: string}) => {
  //     console.log("Audio pairing needed:", data.deviceName)
  //     setAudioPairingNeeded(true)
  //     setAudioDeviceName(data.deviceName)
  //     setPairingInProgress(false)
  //   }

  //   const handleAudioConnected = (data: {deviceName: string}) => {
  //     console.log("Audio connected:", data.deviceName)
  //     setAudioPairingNeeded(false)
  //     // Continue to success screen after audio is connected
  //     replace("/pairing/success", {glassesModelName: glassesModelName})
  //   }

  //   GlobalEventEmitter.on("audio_pairing_needed", handleAudioPairingNeeded)
  //   GlobalEventEmitter.on("audio_connected", handleAudioConnected)

  //   return () => {
  //     GlobalEventEmitter.off("audio_pairing_needed", handleAudioPairingNeeded)
  //     GlobalEventEmitter.off("audio_connected", handleAudioConnected)
  //   }
  // }, [replace, glassesModelName])

  // useEffect(() => {
  //   hasAlertShownRef.current = false
  //   setPairingInProgress(true)

  //   timerRef.current = setTimeout(() => {
  //     if (!glassesConnected && !hasAlertShownRef.current) {
  //       hasAlertShownRef.current = true
  //     }
  //   }, 30000)

  //   return () => {
  //     if (timerRef.current) clearTimeout(timerRef.current)
  //     if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
  //   }
  // }, [])

  // useEffect(() => {
  //   if (!glassesConnected) return
  //   // Don't navigate to home if we're waiting for audio pairing
  //   if (audioPairingNeeded) return
  //   if (timerRef.current) clearTimeout(timerRef.current)
  //   if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
  //   replace("/pairing/success", {glassesModelName: glassesModelName})
  // }, [glassesConnected, replace, audioPairingNeeded, glassesModelName])

  // if (pairingInProgress) {
  //   return (
  //     <Screen preset="fixed" safeAreaEdges={["bottom"]}>
  //       <Header leftIcon="chevron-left" onLeftPress={goBack} />
  //       <View style={themed($pairingContainer)}>
  //         <View style={themed($centerWrapper)}>
  //           <GlassesPairingLoader glassesModelName={glassesModelName} deviceName={deviceName} onCancel={goBack} />
  //         </View>
  //         <Button
  //           preset="secondary"
  //           tx="pairing:needMoreHelp"
  //           onPress={() => setShowTroubleshootingModal(true)}
  //           style={themed($helpButtonBottom)}
  //         />
  //       </View>
  //       <GlassesTroubleshootingModal
  //         isVisible={showTroubleshootingModal}
  //         onClose={() => setShowTroubleshootingModal(false)}
  //         glassesModelName={glassesModelName}
  //       />
  //     </Screen>
  //   )
  // }

  // // Show audio pairing prompt if needed
  // // Note: This will only trigger on iOS since the events are only sent from iOS native code
  // if (audioPairingNeeded && audioDeviceName) {
  //   return (
  //     <Screen preset="fixed" safeAreaEdges={["bottom"]}>
  //       <Header
  //         leftIcon="chevron-left"
  //         onLeftPress={goBack}
  //         RightActionComponent={
  //           <PillButton
  //             text="Help"
  //             variant="icon"
  //             onPress={() => setShowTroubleshootingModal(true)}
  //             buttonStyle={themed($pillButton)}
  //           />
  //         }
  //       />
  //       <AudioPairingPrompt
  //         deviceName={audioDeviceName}
  //         onSkip={() => {
  //           // Navigate first - don't update state which could cause race conditions
  //           replace("/pairing/success", {glassesModelName: glassesModelName})
  //         }}
  //       />
  //       <GlassesTroubleshootingModal
  //         isVisible={showTroubleshootingModal}
  //         onClose={() => setShowTroubleshootingModal(false)}
  //         glassesModelName={glassesModelName}
  //       />
  //     </Screen>
  //   )
  // }

  useEffect(() => {
    console.log("BT_CLASSIC: useEffect()", btcConnected)
    if (btcConnected) {
      // replace("/pairing/success", {glassesModelName: glassesModelName})
      pushPrevious()
    }
  }, [btcConnected])

  let steps: OnboardingStep[] = [
    {
      type: "video",
      source: `${CDN_BASE}/ONB0_start_onboarding.mp4`,
      poster: require("@assets/onboarding/live/thumbnails/ONB0_start_onboarding.jpg"),
      name: "Start Onboarding",
      playCount: 1,
      transition: true,
      title: " ", // for spacing so it's consistent with the other steps
      // title: "Welcome to Mentra Live",
      // info: "Learn the basics",
    },
    {
      type: "video",
      source: `${CDN_BASE}/ONB4_action_button_click.mp4`,
      poster: require("@assets/onboarding/live/thumbnails/ONB4_action_button_click.jpg"),
      name: "Action Button Click",
      playCount: 2,
      transition: false,
      title: translate("onboarding:liveTakeAPhoto"),
      subtitle: translate("onboarding:livePressActionButton"),
      info: translate("onboarding:liveLedFlashWarning"),
    },
    {
      type: "video",
      source: `${CDN_BASE}/ONB5_action_button_record.mp4`,
      poster: require("@assets/onboarding/live/thumbnails/ONB5_action_button_record.jpg"),
      name: "Action Button Record",
      playCount: 2,
      transition: false,
      title: translate("onboarding:liveStartRecording"),
      subtitle: translate("onboarding:livePressAndHold"),
      info: translate("onboarding:liveLedFlashWarning"),
    },
  ]

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <OnboardingGuide
        steps={steps}
        autoStart={false}
        mainTitle={translate("onboarding:liveWelcomeTitle")}
        mainSubtitle={translate("onboarding:liveWelcomeSubtitle")}
        showCloseButton={false}
        // exitFn={() => {
        //   pushPrevious()
        // }}
        endButtonText={translate("common:continue")}
        endButtonFn={() => {
          console.log("BT_CLASSIC: endButtonFn()")
          // pushPrevious()
        }}
        showSkipButton={false}
        // endButtonText={
        //   onboardingOsCompleted ? translate("onboarding:liveEndTitle") : translate("onboarding:learnAboutOs")
        // }
      />
    </Screen>
  )
}

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

const $helpButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontSize: 16,
})

const $pairingContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingBottom: spacing.s6,
})

const $centerWrapper: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $helpButtonBottom: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})
