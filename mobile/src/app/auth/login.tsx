// eslint-disable-next-line import/no-unresolved
import LogoSvg from "@assets/logo/logo.svg"
import {FontAwesome} from "@expo/vector-icons"
import {useLocalSearchParams} from "expo-router"
import * as WebBrowser from "expo-web-browser"
import {useEffect, useRef, useState} from "react"
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Modal,
  Platform,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"

import {Button, Screen, Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import mentraAuth from "@/utils/auth/authClient"
import {mapAuthError} from "@/utils/auth/authErrors"
import {useSafeAreaInsetsStyle} from "@/utils/useSafeAreaInsetsStyle"

import AppleIcon from "assets/icons/component/AppleIcon"
import GoogleIcon from "assets/icons/component/GoogleIcon"

export default function LoginScreen() {
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [backPressCount, setBackPressCount] = useState(0)
  const {push} = useNavigationHistory()
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  const {authError} = useLocalSearchParams<{authError?: string}>()

  const {theme, themed} = useAppTheme()
  const $bottomContainerInsets = useSafeAreaInsetsStyle(["bottom"])

  const authOverlayOpacity = useRef(new Animated.Value(0)).current

  // Handle auth errors passed via URL params (e.g., from expired reset links)
  useEffect(() => {
    if (authError) {
      const errorMessage = mapAuthError(authError)
      showAlert(translate("common:error"), errorMessage, [{text: translate("common:ok")}])
    }
  }, [authError])

  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: any) => {
      console.log("App state changed to:", nextAppState)
      if (nextAppState === "active" && isAuthLoading) {
        console.log("App became active, hiding auth overlay")
        setIsAuthLoading(false)
        authOverlayOpacity.setValue(0)
      }
    }

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, [])

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true)

    Animated.timing(authOverlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    setTimeout(() => {
      console.log("Auth flow failsafe timeout - hiding loading overlay")
      setIsAuthLoading(false)
      authOverlayOpacity.setValue(0)
    }, 5000)

    const res = await mentraAuth.googleSignIn()

    if (res.is_error()) {
      setIsAuthLoading(false)
      authOverlayOpacity.setValue(0)
      return
    }
    const url = res.value

    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)

    setIsAuthLoading(false)
    authOverlayOpacity.setValue(0)
  }

  const handleAppleSignIn = async () => {
    setIsAuthLoading(true)

    Animated.timing(authOverlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    const res = await mentraAuth.appleSignIn()
    if (res.is_error()) {
      console.error("Apple sign in failed:", res.error)
      setIsAuthLoading(false)
      authOverlayOpacity.setValue(0)
      return
    }
    const url = res.value

    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)

    setIsAuthLoading(false)
    authOverlayOpacity.setValue(0)
  }

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (backPressCount === 0) {
        setBackPressCount(1)
        setTimeout(() => setBackPressCount(0), 2000)
        return true
      } else {
        BackHandler.exitApp()
        return true
      }
    })

    return () => backHandler.remove()
  }, [backPressCount])

  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={themed($container)}>
      <View style={themed($card)}>
        {/* Auth Loading Overlay */}
        {isAuthLoading && (
          <Animated.View style={[themed($authLoadingOverlay), {opacity: authOverlayOpacity}]}>
            <View style={themed($authLoadingContent)}>
              <View style={themed($authLoadingLogoContainer)}>
                <LogoSvg width={108} height={58} />
              </View>
              <ActivityIndicator size="large" color={theme.colors.tint} style={themed($authLoadingIndicator)} />
              <Text tx="login:connectingToServer" style={themed($authLoadingText)} />
            </View>
          </Animated.View>
        )}

        <View style={themed($logoContainer)}>
          <LogoSvg width={108} height={58} />
        </View>
        <Text preset="heading" tx="login:title" style={themed($title)} />
        <Text preset="subheading" tx="login:subtitle" style={themed($subtitle)} />

        <View style={themed($content)}>
          <View style={themed($signInOptions)}>
            <Button
              flexContainer
              tx="login:signUpWithEmail"
              style={themed($primaryButton)}
              pressedStyle={themed($pressedButton)}
              textStyle={themed($emailButtonText)}
              onPress={() => push("/auth/signup")}
              LeftAccessory={() => <FontAwesome name="envelope" size={16} color={theme.colors.textAlt} />}
            />
            {!isChina && (
              <TouchableOpacity style={[themed($socialButton), themed($googleButton)]} onPress={handleGoogleSignIn}>
                <View style={[themed($socialIconContainer), {position: "absolute", left: 12}]}>
                  <GoogleIcon />
                </View>
                <Text style={themed($socialButtonText)} tx="login:continueWithGoogle" />
              </TouchableOpacity>
            )}

            {Platform.OS === "ios" && !isChina && (
              <TouchableOpacity style={[themed($socialButton), themed($appleButton)]} onPress={handleAppleSignIn}>
                <View style={[themed($socialIconContainer), {position: "absolute", left: 12}]}>
                  <AppleIcon color={theme.colors.text} />
                </View>
                <Text style={[themed($socialButtonText), themed($appleButtonText)]} tx="login:continueWithApple" />
              </TouchableOpacity>
            )}

            {/* Already have an account? Log in */}
            <View style={themed($loginLinkContainer)}>
              <Text style={themed($loginLinkText)}>{translate("login:alreadyHaveAccount")}</Text>
              <TouchableOpacity onPress={() => push("/auth/email-login")}>
                <Text style={themed($loginLink)}>{translate("login:logIn")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={$bottomContainerInsets}>
          <Text tx="login:termsText" size="xs" style={themed($termsText)} />
        </View>
      </View>

      {/* Loading Modal */}
      <Modal visible={isAuthLoading} transparent={true} animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
          }}>
          <View
            style={{
              backgroundColor: theme.colors.background,
              padding: theme.spacing.s8,
              borderRadius: theme.spacing.s4,
              alignItems: "center",
              minWidth: 200,
            }}>
            <ActivityIndicator size="large" color={theme.colors.tint} style={{marginBottom: theme.spacing.s4}} />
            <Text preset="bold" style={{color: theme.colors.text}}>
              {translate("login:connectingToServer")}
            </Text>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

// Themed Styles
const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $card: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  padding: spacing.s4,
})

const $authLoadingOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: colors.background + "E6",
  zIndex: 10,
  justifyContent: "center",
  alignItems: "center",
})

const $authLoadingContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  padding: spacing.s4,
})

const $authLoadingLogoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  justifyContent: "center",
  marginBottom: spacing.s6,
})

const $logoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  justifyContent: "center",
  marginBottom: spacing.s4,
})

const $authLoadingIndicator: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s3,
})

const $authLoadingText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  textAlign: "center",
})

const $title: ThemedStyle<TextStyle> = ({spacing, colors}) => ({
  fontSize: 46,
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.s2,
  paddingTop: spacing.s8,
  paddingBottom: spacing.s4,
})

const $subtitle: ThemedStyle<TextStyle> = ({spacing, colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.s4,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s4,
})

const $signInOptions: ThemedStyle<ViewStyle> = ({spacing}) => ({
  gap: spacing.s4,
})

const $socialButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  height: 44,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.s6,
  paddingHorizontal: spacing.s3,
  backgroundColor: colors.background,
  shadowOffset: {
    width: 0,
    height: 1,
  },
  shadowOpacity: 0.1,
  shadowRadius: 1,
  elevation: 1,
})

const $googleButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $appleButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
  borderColor: colors.border,
})

const $socialIconContainer: ThemedStyle<ViewStyle> = () => ({
  width: 24,
  height: 24,
  justifyContent: "center",
  alignItems: "center",
})

const $socialButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.text,
  flex: 1,
  textAlign: "center",
})

const $appleButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({})

const $pressedButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
  opacity: 0.9,
})

const $emailButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textAlt,
  fontSize: 16,
})

const $termsText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 11,
  color: colors.textDim,
  textAlign: "center",
  marginTop: 8,
})

const $loginLinkContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.s1,
  marginTop: spacing.s2,
})

const $loginLinkText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
})

const $loginLink: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.tint,
  fontWeight: "600",
})
