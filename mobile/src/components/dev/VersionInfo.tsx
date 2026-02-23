import * as Clipboard from "expo-clipboard"
import { useEffect, useRef, useState } from "react"
import { TouchableOpacity, View } from "react-native"
import Toast from "react-native-toast-message"

import { Text } from "@/components/ignite"
import { translate } from "@/i18n"
import udp from "@/services/UdpManager"
import { SETTINGS, useSetting } from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import mentraAuth from "@/utils/auth/authClient"

export const VersionInfo = () => {
  const [devMode, setDevMode] = useSetting(SETTINGS.dev_mode.key)
  const [superMode, setSuperMode] = useSetting(SETTINGS.super_mode.key)
  const [storeUrl] = useSetting(SETTINGS.store_url.key)
  const [backendUrl] = useSetting(SETTINGS.backend_url.key)
  const [audioTransport, setAudioTransport] = useState("websocket")

  useEffect(() => {
    if (!devMode) return

    const updateAudioTransport = () => {
      if (udp.enabledAndReady()) {
        const endpoint = udp.getEndpoint()
        setAudioTransport(endpoint ? `udp @ ${endpoint}` : "udp")
      } else {
        setAudioTransport("websocket")
      }
    }

    updateAudioTransport()
    const interval = setInterval(updateAudioTransport, 2000)
    return () => clearInterval(interval)
  }, [devMode])

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePressIn = () => {
    longPressTimer.current = setTimeout(() => {
      setSuperMode(true)
      showAlert("Super Mode", "Super mode enabled! 🚀", [
        { text: translate("common:ok") },
      ])
      Toast.show({
        type: "success",
        text1: "Super Mode Activated",
        position: "top",
        visibilityTime: 2000,
      })
    }, 10000)
  }

  const handlePressOut = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleQuickPress = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - lastPressTime.current
    const maxTimeDiff = 2000
    const maxPressCount = 10
    const showAlertAtPressCount = 5

    if (timeDiff > maxTimeDiff) {
      pressCount.current = 1
    } else {
      pressCount.current += 1
    }

    lastPressTime.current = currentTime

    if (pressTimeout.current) {
      clearTimeout(pressTimeout.current)
    }

    if (pressCount.current === maxPressCount) {
      showAlert("Developer Mode", "Developer mode enabled!", [
        { text: translate("common:ok") },
      ])
      setDevMode(true)
      pressCount.current = 0
    } else if (pressCount.current >= showAlertAtPressCount) {
      const remaining = maxPressCount - pressCount.current
      Toast.show({
        type: "info",
        text1: "Developer Mode",
        text2: `${remaining} more taps to enable developer mode`,
        position: "bottom",
        topOffset: 80,
        visibilityTime: 1000,
      })
    }

    pressTimeout.current = setTimeout(() => {
      pressCount.current = 0
    }, maxTimeDiff)
  }

  const handlePress = async () => {
    const res = await mentraAuth.getUser()
    let user = null
    if (res.is_ok()) {
      user = res.value
    }

    const info = [
      `version: ${process.env.EXPO_PUBLIC_MENTRAOS_VERSION}`,
      `branch: ${process.env.EXPO_PUBLIC_BUILD_BRANCH}`,
      `time: ${process.env.EXPO_PUBLIC_BUILD_TIME}`,
      `commit: ${process.env.EXPO_PUBLIC_BUILD_COMMIT}`,
      `store_url: ${storeUrl}`,
      `backend_url: ${backendUrl}`,
      `audio: ${audioTransport}`,
      ...(superMode ? [`super_mode: enabled`] : []),
    ]

    if (user) {
      info.push(`id: ${user.id}`)
      info.push(`email: ${user.email}`)
    }

    await Clipboard.setStringAsync(info.join("\n"))
    Toast.show({
      type: "info",
      text1: "Version info copied to clipboard",
      position: "bottom",
      topOffset: 80,
      visibilityTime: 1000,
    })
  }

  if (devMode) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="items-center w-full py-2 rounded-2xl mt-16 mb-2"
      >
        <Text className="text-[13px] text-neutral-400">
          v{process.env.EXPO_PUBLIC_MENTRAOS_VERSION} ({process.env.EXPO_PUBLIC_BUILD_BRANCH})
        </Text>
        <Text className="text-[13px] text-neutral-400">
          {process.env.EXPO_PUBLIC_BUILD_TIME} @ {process.env.EXPO_PUBLIC_BUILD_COMMIT}
        </Text>
        <Text className="text-[13px] text-neutral-400">
          {storeUrl} | {backendUrl} | {audioTransport}
        </Text>
        {superMode && (
          <Text className="text-[13px] text-yellow-400 mt-1">🚀 Super Mode</Text>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      onPress={handleQuickPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="items-center w-full py-2 rounded-2xl mt-16 mb-2"
    >
      <Text className="text-[13px] text-neutral-400">
        v{process.env.EXPO_PUBLIC_MENTRAOS_VERSION}
      </Text>
      {superMode && (
        <Text className="text-[13px] text-yellow-400 mt-1">🚀 Super Mode</Text>
      )}
    </TouchableOpacity>
  )
}