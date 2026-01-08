import {useEffect, useState} from "react"
import {Screen} from "@/components/ignite"
import {OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import showAlert from "@/utils/AlertUtils"
import CoreModule from "core"
import {AudioPairingPrompt} from "@/components/pairing/AudioPairingPrompt"
import GlassesTroubleshootingModal from "@/components/misc/GlassesTroubleshootingModal"
import {SETTINGS, useSetting} from "@/stores/settings"

const CDN_BASE = "https://mentra-videos-cdn.mentraglass.com/onboarding/mentra-live/light"

export default function BtClassicPairingScreen() {
  const {pushPrevious} = useNavigationHistory()
  const btcConnected = useGlassesStore((state) => state.btcConnected)
  const [deviceName] = useSetting(SETTINGS.device_name.key)
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)

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

  focusEffectPreventBack()

  const handleSuccess = () => {
    // showAlert(translate("common:success"), translate("pairing:btClassicConnected"), [
    //   {
    //     text: translate("common:ok"),
    //     onPress: () => {
    //       CoreModule.connectByName(deviceName)
    //       pushPrevious()
    //     },
    //   },
    // ])
    // we should have a device name saved in the core:

    CoreModule.connectByName("")
    pushPrevious()
  }

  useEffect(() => {
    console.log("BTCLASSIC: useEffect()", btcConnected)
    if (btcConnected) {
      handleSuccess()
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
      {/* <OnboardingGuide
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
      /> */}
      <AudioPairingPrompt
        deviceName={deviceName}
        // onSkip={() => {
        //   // Navigate first - don't update state which could cause race conditions
        //   // replace("/pairing/success", {glassesModelName: glassesModelName})
        // }}
      />
      <GlassesTroubleshootingModal
        isVisible={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
        glassesModelName={defaultWearable}
      />
      {/* <View className="flex-1 justify-center items-center">
        <Text>BT Classic Pairing</Text>
        <Text>Waiting for BT Classic to connect...</Text>
      </View> */}
    </Screen>
  )
}
