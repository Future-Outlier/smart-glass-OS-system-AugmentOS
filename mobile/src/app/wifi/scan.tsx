import CoreModule from "core"
import {useLocalSearchParams} from "expo-router"
import {useEffect, useRef, useState} from "react"
import {ActivityIndicator, ScrollView, TouchableOpacity, View} from "react-native"
import Toast from "react-native-toast-message"

import {WifiIcon} from "@/components/icons/WifiIcon"
import {WifiLockedIcon} from "@/components/icons/WifiLockedIcon"
import {WifiUnlockedIcon} from "@/components/icons/WifiUnlockedIcon"
import {Button, Header, Screen, Text} from "@/components/ignite"
import {Badge} from "@/components/ui/Badge"
import {Group} from "@/components/ui"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useGlassesStore} from "@/stores/glasses"
import showAlert from "@/utils/AlertUtils"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import WifiCredentialsService from "@/utils/wifi/WifiCredentialsService"
import {translate} from "@/i18n"

interface NetworkInfo {
  ssid: string
  requiresPassword: boolean
  signalStrength?: number
}

export default function WifiScanScreen() {
  const {deviceModel = "Glasses", returnTo, nextRoute} = useLocalSearchParams()
  const {theme} = useAppTheme()

  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [savedNetworks, setSavedNetworks] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(true)
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentScanSessionRef = useRef<number>(Date.now())
  const receivedResultsForSessionRef = useRef<boolean>(false)
  const wifiSsid = useGlassesStore((state) => state.wifiSsid)
  const wifiConnected = useGlassesStore((state) => state.wifiConnected)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const {push, goBack, replace, pushPrevious} = useNavigationHistory()
  
  focusEffectPreventBack()

  useEffect(() => {
    if (!glassesConnected) {
      console.log("CONNECTING: Glasses disconnected - navigating away")
      showAlert("Glasses Disconnected", "Please reconnect your glasses to set up WiFi.", [
        {
          text: "OK",
          onPress() {
            pushPrevious()
          },
        },
      ])
    }
  }, [glassesConnected])

  useEffect(() => {
    const loadSavedNetworks = () => {
      const savedCredentials = WifiCredentialsService.getAllCredentials()
      setSavedNetworks(savedCredentials.map((cred) => cred.ssid))
    }

    loadSavedNetworks()
    startScan()

    const handleWifiScanResults = (data: {networks: string[]; networksEnhanced?: any[]}) => {
      console.log("🎯 ========= SCAN.TSX RECEIVED WIFI RESULTS =========")
      console.log("🎯 Data received:", data)

      let processedNetworks: NetworkInfo[]
      if (data.networks && data.networks.length > 0) {
        console.log("🎯 Processing enhanced networks:", data.networks)
        processedNetworks = data.networks.map((network: any) => ({
          ssid: network.ssid || "",
          requiresPassword: network.requiresPassword !== false,
          signalStrength: network.signalStrength || -100,
        }))
        console.log("🎯 Enhanced networks count:", processedNetworks.length)
      }

      if (scanTimeoutRef.current) {
        console.log("🎯 Clearing scan timeout - results received")
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }

      setNetworks((prevNetworks) => {
        console.log("🎯 Current scan session ID:", currentScanSessionRef.current)
        console.log("🎯 Previous networks count:", prevNetworks.length)
        console.log("🎯 Is first result of this scan session?", !receivedResultsForSessionRef.current)

        let baseNetworks: NetworkInfo[]
        if (receivedResultsForSessionRef.current) {
          console.log("🎯 APPENDING: Adding to existing networks from current scan session")
          baseNetworks = prevNetworks
        } else {
          console.log("🎯 REPLACING: Starting fresh with new scan session results")
          baseNetworks = []
        }

        const existingMap = new Map<string, NetworkInfo>()
        baseNetworks.forEach((network) => existingMap.set(network.ssid, network))
        processedNetworks.forEach((network) => {
          if (network.ssid) {
            existingMap.set(network.ssid, network)
          }
        })
        const newNetworks = Array.from(existingMap.values())
        console.log("🎯 Final networks count:", newNetworks.length)
        return newNetworks
      })

      receivedResultsForSessionRef.current = true
      setIsScanning(false)
      console.log("🎯 ========= END SCAN.TSX WIFI RESULTS =========")
    }

    GlobalEventEmitter.on("wifi_scan_results", handleWifiScanResults)

    return () => {
      GlobalEventEmitter.removeListener("wifi_scan_results", handleWifiScanResults)
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
    }
  }, [])

  const startScan = async () => {
    console.log("🔄 ========= STARTING NEW WIFI SCAN =========")
    setIsScanning(true)
    currentScanSessionRef.current = Date.now()
    receivedResultsForSessionRef.current = false
    setNetworks([])

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    scanTimeoutRef.current = setTimeout(() => {
      console.log("⏱️ WIFI SCAN TIMEOUT - RETRYING...")
      CoreModule.requestWifiScan().catch((error) => {
        console.error("⏱️ RETRY FAILED:", error)
      })
      scanTimeoutRef.current = null
    }, 15000)

    try {
      await CoreModule.requestWifiScan()
      console.log("🔄 WiFi scan request sent successfully")
    } catch (error) {
      console.error("Error scanning for WiFi networks:", error)
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      setIsScanning(false)
      Toast.show({
        type: "error",
        text1: "Failed to scan for WiFi networks",
      })
    }
  }

  const handleNetworkSelect = (selectedNetwork: NetworkInfo) => {
    if (wifiConnected && wifiSsid === selectedNetwork.ssid) {
      Toast.show({
        type: "info",
        text1: `Already connected to ${selectedNetwork.ssid}`,
      })
      return
    }

    if (!selectedNetwork.requiresPassword) {
      console.log(`🔓 Open network selected: ${selectedNetwork.ssid} - connecting directly`)
      push("/wifi/connecting", {
        deviceModel,
        ssid: selectedNetwork.ssid,
        password: "",
        returnTo,
        nextRoute,
      })
    } else {
      console.log(`🔒 Secured network selected: ${selectedNetwork.ssid} - going to password screen`)
      push("/wifi/password", {
        deviceModel,
        ssid: selectedNetwork.ssid,
        requiresPassword: selectedNetwork.requiresPassword.toString(),
        returnTo,
        nextRoute,
      })
    }
  }

  const handleManualEntry = () => {
    push("/wifi/password", {
      deviceModel,
      ssid: "",
      returnTo,
      nextRoute,
    })
  }

  const handleSkip = () => {
    if (nextRoute && typeof nextRoute === "string") {
      replace(decodeURIComponent(nextRoute))
    }
  }

  const renderNetworkItem = (item: NetworkInfo) => {
    const isConnected = wifiConnected && wifiSsid === item.ssid
    const isSaved = savedNetworks.includes(item.ssid)

    return (
      <TouchableOpacity
        key={item.ssid}
        className={`flex-row justify-between items-center bg-primary-foreground py-4 px-4 rounded-xl ${isConnected ? "opacity-70" : ""}`}
        onPress={() => handleNetworkSelect(item)}>
        <View className="flex-1 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            {item.requiresPassword ? (
              <WifiLockedIcon size={20} color={theme.colors.text} />
            ) : (
              <WifiUnlockedIcon size={20} color={theme.colors.text} />
            )}
            <Text
              className={`text-base ml-2 flex-1 ${
                isConnected ? "text-text-dim" : isSaved ? "text-text font-medium" : "text-text"
              }`}>
              {item.ssid}
            </Text>
          </View>
          <View className="flex-row items-center ml-2">
            {isConnected && <Badge text={translate("common:connected")} />}
            {isSaved && !isConnected && <Badge text={translate("common:saved")} />}
          </View>
        </View>
        {!isConnected && (
          <Text className={`text-2xl ml-2 ${isSaved ? "text-tint text-lg" : "text-text-dim"}`}>
            {isSaved ? "🔑" : "›"}
          </Text>
        )}
      </TouchableOpacity>
    )
  }

  const showSkip = true

  return (
    <Screen preset="fixed">
      <Header title="Wi-Fi" leftIcon="chevron-left" onLeftPress={goBack} rightIcon="repeat" onRightPress={startScan} />

      <View className="flex-1">
        {/* Header */}
        <View className="pt-4 pb-6 items-center">
          <View className="mb-4">
            <WifiIcon size={48} color={theme.colors.primary} />
          </View>
          <Text className="text-2xl font-semibold text-text text-center mb-2" tx="wifi:addNetwork" />
          <Text className="text-sm text-text-dim text-center px-4 leading-5" tx="wifi:addNetworkDescription" />
        </View>

        {/* Content - flex-1 makes it take remaining space, flex-shrink allows it to shrink */}
        <View className="flex-1 flex-shrink min-h-0">
          {isScanning ? (
            <View className="flex-1 justify-center items-center py-12">
              <ActivityIndicator size="large" color={theme.colors.text} />
              <Text className="mt-4 text-base text-text-dim" tx="wifi:scanningForNetworks" />
            </View>
          ) : networks.length > 0 ? (
            <ScrollView className="flex-1" contentContainerClassName="pb-4">
              <Group title={translate("wifi:networks")}>{networks.map(renderNetworkItem)}</Group>
            </ScrollView>
          ) : (
            <View className="flex-1 justify-center items-center py-12">
              <Text className="text-base text-text-dim mb-6 text-center" tx="wifi:noNetworksFound" />
              <Button tx="common:tryAgain" onPress={startScan} />
            </View>
          )}
        </View>

        {/* Bottom buttons - fixed at bottom */}
        <View className="pb-6">
          <Button
            tx="wifi:enterNetworkManually"
            preset={showSkip ? "primary" : "secondary"}
            onPress={handleManualEntry}
          />
          {showSkip && <Button tx="common:skip" preset="secondary" onPress={handleSkip} className="mt-3" />}
        </View>
      </View>
    </Screen>
  )
}
