import {useEffect, useRef, useState} from "react"
import {TouchableOpacity, View} from "react-native"

import {Icon, Text} from "@/components/ignite"
import {translate} from "@/i18n"
import {WebSocketStatus} from "@/services/WebSocketManager"
import {useRefreshApplets} from "@/stores/applets"
import {useConnectionStore} from "@/stores/connection"
import {BackgroundTimer} from "@/utils/timers"
import {useAppTheme} from "@/contexts/ThemeContext"
import {SETTINGS, useSetting} from "@/stores/settings"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useCoreStore} from "@/stores/core"

type DisplayStatus = "connected" | "warning" | "disconnected"

const STATUS_CONFIG: Record<DisplayStatus, {icon: string; label: () => string; bgClass: string; iconColor: string}> = {
  connected: {
    icon: "wifi",
    label: () => translate("connection:connected"),
    bgClass: "bg-green-500",
    iconColor: "#fff",
  },
  warning: {
    icon: "wifi",
    label: () => translate("connection:connecting"),
    bgClass: "bg-orange-500",
    iconColor: "#fff",
  },
  disconnected: {
    icon: "wifi-off",
    label: () => translate("connection:disconnected"),
    bgClass: "bg-destructive",
    iconColor: "#fff",
  },
}

export default function CoreStatusBar() {
  const searching = useCoreStore((state) => state.searching)
  const micRanking = useCoreStore((state) => state.micRanking)
  const currentMic = useCoreStore((state) => state.currentMic)
  const systemMicUnavailable = useCoreStore((state) => state.systemMicUnavailable)

  const {theme} = useAppTheme()

  return (
    <View className="flex-row flex-wrap bg-primary-foreground p-2 rounded-xl items-center self-center align-middle justify-center gap-2">
      <View
        className={`flex-row items-center self-center align-middle justify-center py-1 px-2 rounded-full bg-chart-4`}>
        <Icon name="bluetooth" size={14} color={theme.colors.secondary_foreground} />
        <Text className="text-secondary-foreground text-sm font-medium ml-2">
          {searching ? "Searching" : "Not searching"}
        </Text>
      </View>
      <View
        className={`flex-row items-center self-center align-middle justify-center py-1 px-2 rounded-full bg-chart-3`}>
        <Icon name="microphone" size={14} color={theme.colors.secondary_foreground} />
        <Text className="text-secondary-foreground text-sm font-medium ml-2">{currentMic || "None"}</Text>
      </View>
      <View
        className={`flex-row items-center self-center align-middle justify-center py-1 px-2 rounded-full bg-primary`}>
        <Icon name="microphone" size={14} color={theme.colors.secondary_foreground} />
        <Text className="text-secondary-foreground text-sm font-medium ml-2">{micRanking.join(", ")}</Text>
      </View>
      {/* system mic unavailable */}
      {systemMicUnavailable && (
        <View
          className={`flex-row items-center self-center align-middle justify-center py-1 px-2 rounded-full bg-destructive`}>
          <Icon name="unplug" size={14} color={theme.colors.secondary_foreground} />
          <Text text="System mic is unavailable!" className="text-secondary-foreground text-sm font-medium ml-2" />
        </View>
      )}
    </View>
  )
}
