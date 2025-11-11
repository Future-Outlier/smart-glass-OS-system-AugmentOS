import {Button, Header, Icon, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {$styles, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import WifiCredentialsService from "@/utils/wifi/WifiCredentialsService"
import CoreModule from "core"
import {useLocalSearchParams, router} from "expo-router"
import {useEffect, useRef, useState, useCallback} from "react"
import {ActivityIndicator, TextStyle, View, ViewStyle} from "react-native"
import {Text} from "@/components/ignite"
import {useGlassesStore} from "@/stores/glasses"

export default function WifiConnectingScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const ssid = params.ssid as string
  const password = (params.password as string) || ""
  const rememberPassword = (params.rememberPassword as string) === "true"
  const returnTo = params.returnTo as string | undefined

  const {theme, themed} = useAppTheme()

  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "success" | "failed">("connecting")
  const [errorMessage, setErrorMessage] = useState("")
  const connectionTimeoutRef = useRef<number | null>(null)
  const failureGracePeriodRef = useRef<number | null>(null)
  const {goBack, navigate} = useNavigationHistory()
  const wifiConnected = useGlassesStore(state => state.wifiConnected)
  const wifiSsid = useGlassesStore(state => state.wifiSsid)

  useEffect(() => {
    // Start connection attempt
    attemptConnection()

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
      if (failureGracePeriodRef.current) {
        clearTimeout(failureGracePeriodRef.current)
        failureGracePeriodRef.current = null
      }
    }
  }, [ssid])

  useEffect(() => {
    console.log("WiFi connection status changed:", wifiConnected, wifiSsid)

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }

    if (wifiConnected && wifiSsid === ssid) {
      // Clear any failure grace period if it exists
      if (failureGracePeriodRef.current) {
        clearTimeout(failureGracePeriodRef.current)
        failureGracePeriodRef.current = null
      }

      // Save credentials ONLY on successful connection if checkbox was checked
      // This ensures we never save wrong passwords
      if (password && rememberPassword) {
        WifiCredentialsService.saveCredentials(ssid, password, true)
        WifiCredentialsService.updateLastConnected(ssid)
      }

      setConnectionStatus("success")
      // Don't show banner anymore since we have a dedicated success screen
      // User will manually dismiss with Done button
    } else if (!wifiConnected && connectionStatus === "connecting") {
      // Set up 5-second grace period before showing failure
      failureGracePeriodRef.current = setTimeout(() => {
        console.log("#$%^& Failed to connect to the network. Please check your password and try again.")
        setConnectionStatus("failed")
        setErrorMessage("Failed to connect to the network. Please check your password and try again.")
        failureGracePeriodRef.current = null
      }, 10000)
    }
  }, [wifiConnected, wifiSsid])

  const attemptConnection = async () => {
    try {
      console.log("Attempting to send wifi credentials to Core", ssid, password)
      await CoreModule.sendWifiCredentials(ssid, password)

      // Set timeout for connection attempt (20 seconds)
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionStatus === "connecting") {
          setConnectionStatus("failed")
          setErrorMessage("Connection timed out. Please try again.")
        }
      }, 20000)
    } catch (error) {
      console.error("Error sending WiFi credentials:", error)
      setConnectionStatus("failed")
      setErrorMessage("Failed to send credentials to glasses. Please try again.")
    }
  }

  const handleTryAgain = () => {
    setConnectionStatus("connecting")
    setErrorMessage("")
    attemptConnection()
  }

  const handleSuccess = useCallback(() => {
    if (returnTo && typeof returnTo === "string") {
      router.replace(decodeURIComponent(returnTo))
    } else {
      navigate("/")
    }
  }, [returnTo, navigate])

  const handleCancel = useCallback(() => {
    if (returnTo && typeof returnTo === "string") {
      router.replace(decodeURIComponent(returnTo))
    } else {
      goBack()
    }
  }, [returnTo, goBack])

  const handleHeaderBack = useCallback(() => {
    if (returnTo && typeof returnTo === "string") {
      router.replace(decodeURIComponent(returnTo))
    } else {
      goBack()
    }
  }, [returnTo, goBack])

  const renderContent = () => {
    switch (connectionStatus) {
      case "connecting":
        return (
          <>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={themed($statusText)}>Connecting to {ssid}...</Text>
            <Text style={themed($subText)}>This may take up to 20 seconds</Text>
          </>
        )

      case "success":
        return (
          <View style={themed($successContainer)}>
            <View style={themed($successContent)}>
              <View style={themed($successIconContainer)}>
                <Ionicons name="checkmark-circle" size={80} color="#0066FF" />
              </View>

              <Text style={themed($successTitle)}>Network added!</Text>

              <Text style={themed($successDescription)}>Your {deviceModel} will automatically update when it is:</Text>

              <View style={themed($conditionsList)}>
                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <Icon name="power-settings-new" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Powered on</Text>
                </View>

                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <Icon name="bolt" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Charging</Text>
                </View>

                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <Icon name="wifi" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Connected to a saved Wi-Fi network</Text>
                </View>
              </View>
            </View>

            <View style={themed($successButtonContainer)}>
              <Button onPress={handleSuccess}>
                <Text>Done</Text>
              </Button>
            </View>
          </View>
        )

      case "failed":
        return (
          <View style={themed($failureContainer)}>
            <View style={themed($failureContent)}>
              <View style={themed($failureIconContainer)}>
                <Icon name="x" size={80} color={theme.colors.error} />
              </View>

              <Text style={themed($failureTitle)}>Connection Failed</Text>

              <Text style={themed($failureDescription)}>{errorMessage}</Text>

              <View style={themed($failureTipsList)}>
                <View style={themed($failureTipItem)}>
                  <View style={themed($failureTipIcon)}>
                    <Icon name="lock" size={24} color={theme.colors.textDim} />
                  </View>
                  <Text style={themed($failureTipText)}>Make sure the password was entered correctly</Text>
                </View>

                <View style={themed($failureTipItem)}>
                  <View style={themed($failureTipIcon)}>
                    <Icon name="wifi" size={24} color={theme.colors.textDim} />
                  </View>
                  <Text style={themed($failureTipText)}>
                    Mentra Live Beta can only connect to pure 2.4GHz WiFi networks (not 5GHz or dual-band 2.4/5GHz)
                  </Text>
                </View>
              </View>
            </View>

            <View style={themed($failureButtonsContainer)}>
              <Button onPress={handleTryAgain}>
                <Text>Try Again</Text>
              </Button>
              <View style={{height: theme.spacing.s3}} />
              <Button onPress={handleCancel} preset="alternate">
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        )
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($styles.screen)}>
      {connectionStatus === "connecting" && (
        <Header title="Connecting" leftIcon="chevron-left" onLeftPress={handleHeaderBack} />
      )}
      <View style={themed($content)}>{renderContent()}</View>
    </Screen>
  )
}

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.s6,
  justifyContent: "center",
  alignItems: "center",
})

const $statusText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "500",
  color: colors.text,
  marginTop: spacing.s6,
  textAlign: "center",
})

const $subText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: spacing.s2,
  textAlign: "center",
})

const $successContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "space-between",
})

const $successContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $successIconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.s12,
  marginBottom: spacing.s6,
})

const $successTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "600",
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.s6,
})

const $successDescription: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.s8,
  paddingHorizontal: spacing.s6,
})

const $conditionsList: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.s8,
})

const $conditionItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.s6,
})

const $conditionIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.s4,
  width: 32,
})

const $conditionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  flex: 1,
})

const $successButtonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s6,
})

const $failureContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "space-between",
})

const $failureContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $failureIconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.s12,
  marginBottom: spacing.s6,
})

const $failureTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "600",
  color: colors.error,
  textAlign: "center",
  marginBottom: spacing.s6,
})

const $failureDescription: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.s8,
  paddingHorizontal: spacing.s8,
})

const $failureButtonsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  //marginHorizontal: spacing.s6,
  marginBottom: spacing.s6,
})

const $failureTipsList: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.s8,
  marginTop: spacing.s4,
})

const $failureTipItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.s6,
})

const $failureTipIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.s4,
  width: 32,
})

const $failureTipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
  flex: 1,
})
