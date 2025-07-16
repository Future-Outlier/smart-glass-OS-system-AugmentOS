import React, {useState, useEffect, useRef} from "react"
import {View, Text, ActivityIndicator} from "react-native"
import {useLocalSearchParams, router} from "expo-router"
import {Screen, Header} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import ActionButton from "@/components/ui/ActionButton"
import WifiCredentialsService from "@/utils/WifiCredentialsService"
import { useNavigationHistory } from "@/contexts/NavigationHistoryContext"

export default function WifiConnectingScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const ssid = params.ssid as string
  const password = (params.password as string) || ""
  const rememberPassword = (params.rememberPassword as string) === "true"

  const {theme, themed} = useAppTheme()

  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "success" | "failed">("connecting")
  const [errorMessage, setErrorMessage] = useState("")
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const failureGracePeriodRef = useRef<NodeJS.Timeout | null>(null)
  const {push, goBack} = useNavigationHistory()

  useEffect(() => {
    // Start connection attempt
    attemptConnection()

    const handleWifiStatusChange = (data: {connected: boolean; ssid?: string}) => {
      console.log("WiFi connection status changed:", data)

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }

      if (data.connected && data.ssid === ssid) {
        // Clear any failure grace period if it exists
        if (failureGracePeriodRef.current) {
          clearTimeout(failureGracePeriodRef.current)
          failureGracePeriodRef.current = null
        }
        
        // Save credentials on successful connection only if checkbox was checked
        if (password && rememberPassword) {
          WifiCredentialsService.saveCredentials(ssid, password, true)
          WifiCredentialsService.updateLastConnected(ssid)
        }
        
        setConnectionStatus("success")
        GlobalEventEmitter.emit("SHOW_BANNER", {
          message: `Successfully connected to ${data.ssid}`,
          type: "success",
        })
        
        // Navigate back to home after short delay
        setTimeout(() => {
          router.navigate("/")
        }, 1500)
      } else if (!data.connected && connectionStatus === "connecting") {

        // Set up 5-second grace period before showing failure
        failureGracePeriodRef.current = setTimeout(() => {
          console.log("#$%^& Failed to connect to the network. Please check your password and try again.")
          setConnectionStatus("failed")
          setErrorMessage("Failed to connect to the network. Please check your password and try again.")
          failureGracePeriodRef.current = null
        }, 10000)
      }
    }

    GlobalEventEmitter.on("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
      if (failureGracePeriodRef.current) {
        clearTimeout(failureGracePeriodRef.current)
        failureGracePeriodRef.current = null
      }
      GlobalEventEmitter.removeListener("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)
    }
  }, [ssid])

  const attemptConnection = async () => {
    try {
      console.log("Attempting to send wifi credentials to Core", ssid, password)
      await coreCommunicator.sendWifiCredentials(ssid, password)
      
      // Set timeout for connection attempt (20 seconds)
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionStatus === "connecting") {
          console.log("321321 Connection timed out. Please try again.")
          setConnectionStatus("failed")
          setErrorMessage("#@32 Connection timed out. Please try again.")
          GlobalEventEmitter.emit("SHOW_BANNER", {
            message: "WiFi connection timed out",
            type: "error",
          })
        }
      }, 20000)
    } catch (error) {
      console.log("^&*()__+ Error sending WiFi credentials:", error)
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

  const handleCancel = () => {
    goBack()
  }

  const handleHeaderBack = () => {
    if (connectionStatus === "connecting") {
      // If still connecting, ask for confirmation
      goBack()
    } else {
      goBack()
    }
  }

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
          <>
            <Text style={themed($successIcon)}>✓</Text>
            <Text style={themed($successText)}>Successfully connected!</Text>
            <Text style={themed($subText)}>Returning to home...</Text>
          </>
        )

      case "failed":
        return (
          <>
            <Text style={themed($errorIcon)}>✗</Text>
            <Text style={themed($errorText)}>Connection Failed</Text>
            <Text style={themed($errorMessage)}>{errorMessage}</Text>
            <View style={themed($buttonContainer)}>
              <ActionButton label="Try Again" onPress={handleTryAgain} />
              <ActionButton label="Cancel" onPress={handleCancel} variant="secondary" />
            </View>
          </>
        )
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Header title="Connecting" leftIcon="caretLeft" onLeftPress={handleHeaderBack} />
      <View style={themed($content)}>{renderContent()}</View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
  justifyContent: "center",
  alignItems: "center",
})

const $statusText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "500",
  color: colors.text,
  marginTop: spacing.lg,
  textAlign: "center",
})

const $subText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: spacing.xs,
  textAlign: "center",
})

const $successIcon: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 60,
  color: colors.tint,
  marginBottom: spacing.md,
})

const $successText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "bold",
  color: colors.tint,
  marginBottom: spacing.xs,
  textAlign: "center",
})

const $errorIcon: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 60,
  color: colors.error,
  marginBottom: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "bold",
  color: colors.error,
  marginBottom: spacing.xs,
  textAlign: "center",
})

const $errorMessage: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.text,
  marginBottom: spacing.xl,
  textAlign: "center",
  paddingHorizontal: spacing.lg,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  gap: spacing.sm,
  width: "100%",
  maxWidth: 300,
})