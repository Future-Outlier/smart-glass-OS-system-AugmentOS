import {useEffect} from "react"
import {Screen} from "@/components/ignite"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import CoreModule from "core"
import {SETTINGS, useSetting} from "@/stores/settings"
import {SettingsNavigationUtils} from "@/utils/SettingsNavigationUtils"

export default function BtClassicPairingScreen() {
  const {pushPrevious, goBack} = useNavigationHistory()
  const btcConnected = useGlassesStore((state) => state.btcConnected)
  const [deviceName] = useSetting(SETTINGS.device_name.key)

  focusEffectPreventBack()

  const handleSuccess = () => {
    // we should have a device name saved in the core:
    CoreModule.connectByName(deviceName)
    pushPrevious()
  }

  const handleBack = () => {
    goBack()
  }

  const handleOpenSettings = async () => {
    const success = await SettingsNavigationUtils.openBluetoothSettings()
    if (!success) {
      console.error("Failed to open Bluetooth settings")
    }
  }

  useEffect(() => {
    console.log("BTCLASSIC: check btcConnected", btcConnected)
    if (btcConnected) {
      handleSuccess()
    }
  }, [btcConnected])

  useEffect(() => {
    console.log("BTCLASSIC: check deviceName", deviceName)
    if (deviceName == "" || deviceName == null) {
      console.log("BTCLASSIC: deviceName is empty, cannot continue")
      handleBack()
      return
    }
  }, [deviceName])

  let steps: OnboardingStep[] = [
    {
      type: "image",
      source: require("@assets/onboarding/os/thumbnails/btclassic.png"),
      name: "Start Onboarding",
      transition: false,
      title: translate("onboarding:btClassicTitle"),
      subtitle: translate("onboarding:btClassicSubtitle", {name: deviceName}),
      numberedBullets: [
        translate("onboarding:btClassicStep1"),
        translate("onboarding:btClassicStep2"),
        translate("onboarding:btClassicStep3", {name: deviceName}),
        translate("onboarding:btClassicStep4"),
      ],
    },
  ]

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      {/* <Header leftIcon="chevron-left" onLeftPress={handleBack} /> */}
      <OnboardingGuide
        steps={steps}
        autoStart={true}
        mainTitle={translate("onboarding:liveWelcomeTitle")}
        mainSubtitle={translate("onboarding:liveWelcomeSubtitle")}
        showCloseButton={false}
        endButtonText={translate("onboarding:openSettings")}
        endButtonFn={handleOpenSettings}
        showSkipButton={false}
      />
    </Screen>
  )
}
