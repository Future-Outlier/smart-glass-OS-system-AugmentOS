import {useEffect} from "react"
import {Button, Screen} from "@/components/ignite"
import {OnboardingGuide, OnboardingStep} from "@/components/onboarding/OnboardingGuide"
import {translate} from "@/i18n"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import CoreModule from "core"
import {SETTINGS, useSetting} from "@/stores/settings"
import {SettingsNavigationUtils} from "@/utils/SettingsNavigationUtils"
import { useCoreStore } from "@/stores/core"
import { View } from "react-native"
import { ExpoAvRoutePickerView } from 'expo-av-route-picker-view';

export default function BtClassicPairingScreen() {
  const {pushPrevious, goBack} = useNavigationHistory()
  const btcConnected = useGlassesStore((state) => state.btcConnected)
  const otherBtConnected = useCoreStore((state) => state.otherBtConnected)
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
        showCloseButton={false}
        endButtonText={translate("onboarding:openSettings")}
        endButtonFn={handleOpenSettings}
        showSkipButton={false}
      />

      {!otherBtConnected && (
        <View className="absolute bottom-16 w-full">
          <Button text="TX: show music picker" preset="secondary" onPress={() => {

          }} />
        </View>
      )}
      <ExpoAvRoutePickerView />
    </Screen>
  )
}
