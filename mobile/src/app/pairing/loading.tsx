import {useRoute} from "@react-navigation/native"
import CoreModule from "core"
import {useEffect, useRef, useState} from "react"
import {View} from "react-native"

import {Button} from "@/components/ignite"
import {Header} from "@/components/ignite/Header"
import {Screen} from "@/components/ignite/Screen"
import GlassesPairingLoader from "@/components/glasses/GlassesPairingLoader"
import GlassesTroubleshootingModal from "@/components/glasses/GlassesTroubleshootingModal"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

export default function GlassesPairingLoadingScreen() {
  const {replace, goBack} = useNavigationHistory()
  const route = useRoute()
  const {deviceModel, deviceName} = route.params as {deviceModel: string; deviceName?: string}
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureErrorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAlertShownRef = useRef(false)
  const glassesReady = useGlassesStore((state) => state.ready)

  focusEffectPreventBack()

  const handlePairFailure = (error: string) => {
    CoreModule.forget()
    replace("/pairing/failure", {error: error, deviceModel: deviceModel})
  }

  useEffect(() => {
    GlobalEventEmitter.on("pair_failure", handlePairFailure)
    return () => {
      GlobalEventEmitter.off("pair_failure", handlePairFailure)
    }
  }, [])

  useEffect(() => {
    hasAlertShownRef.current = false

    timerRef.current = setTimeout(() => {
      if (!isFullyBooted && !hasAlertShownRef.current) {
        hasAlertShownRef.current = true
      }
    }, 30000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    }
  }, [])

  useEffect(() => {
    if (!glassesReady) return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (failureErrorRef.current) clearTimeout(failureErrorRef.current)
    setTimeout(() => {
      replace("/pairing/success", {deviceModel: deviceModel})
    }, 1000)
  }, [glassesReady, replace, deviceModel])

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <Header leftIcon="chevron-left" onLeftPress={goBack} />
      <View className="flex-1 pb-6">
        <View className="flex-1 justify-center">
          <GlassesPairingLoader deviceModel={deviceModel} deviceName={deviceName} onCancel={goBack} />
        </View>
        <Button
          preset="secondary"
          tx="pairing:needMoreHelp"
          onPress={() => setShowTroubleshootingModal(true)}
          className="w-full"
        />
      </View>
      <GlassesTroubleshootingModal
        isVisible={showTroubleshootingModal}
        onClose={() => setShowTroubleshootingModal(false)}
        deviceModel={deviceModel}
      />
    </Screen>
  )
}
