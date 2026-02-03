// eslint-disable-next-line import/no-unresolved
import LogoSvg from "@assets/logo/logo.svg"
import {useLocalSearchParams} from "expo-router"
import {StatusBar} from "expo-status-bar"
import * as WebBrowser from "expo-web-browser"
import {useEffect, useMemo, useState} from "react"
import {BackHandler, Platform, TouchableOpacity, View} from "react-native"
import {useSafeAreaInsets} from "react-native-safe-area-context"

import {Button, Icon, Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import showAlert from "@/utils/AlertUtils"
import mentraAuth from "@/utils/auth/authClient"
import {mapAuthError} from "@/utils/auth/authErrors"
import AppleIcon from "assets/icons/component/AppleIcon"
import GoogleIcon from "assets/icons/component/GoogleIcon"

export default function LoginScreen() {
  const [backPressCount, setBackPressCount] = useState(0)
  const {push} = useNavigationHistory()
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  const {authError} = useLocalSearchParams<{authError?: string}>()
  const {theme, themeContext} = useAppTheme()

  // Cache safe area insets on mount to prevent layout shifts when webview opens
  const insets = useSafeAreaInsets()
  const cachedInsets = useMemo(() => ({top: insets.top, bottom: insets.bottom}), [])

  // Handle auth errors passed via URL params (e.g., from expired reset links)
  useEffect(() => {
    if (authError) {
      const errorMessage = mapAuthError(authError)
      showAlert(translate("common:error"), errorMessage, [{text: translate("common:ok")}])
    }
  }, [authError])

  const handleGoogleSignIn = async () => {
    const res = await mentraAuth.googleSignIn()

    if (res.is_error()) {
      return
    }

    const url = res.value
    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)
  }

  const handleAppleSignIn = async () => {
    const res = await mentraAuth.appleSignIn()

    if (res.is_error()) {
      console.error("Apple sign in failed:", res.error)
      return
    }

    const url = res.value
    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)
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
    <View
      className="flex-1 bg-background"
      style={{paddingTop: cachedInsets.top, paddingBottom: cachedInsets.bottom, paddingHorizontal: theme.spacing.s6}}>
      <StatusBar style={themeContext === "dark" ? "light" : "dark"} />
      <View className="flex-1">
        <View className="flex-1 justify-center p-4">
          <View className="items-center justify-center mb-4">
            <LogoSvg width={100} height={100} />
          </View>

          <Text
            text="Mentra"
            className="text-[46px] text-primary-foreground text-secondary-foreground text-center mb-2 pt-8 pb-4"
          />

          <Text tx="login:subtitle" className="text-base text-secondary-foreground text-center text-xl mb-4">
            {translate("login:subtitle")}
          </Text>

          <View className="mb-4">
            <View className="gap-4">
              <Button
                preset="primary"
                text={translate("login:signUpWithEmail")}
                onPress={() => push("/auth/signup")}
                LeftAccessory={() => <Icon name="mail" size={20} color={theme.colors.background} />}
              />

              {!isChina && (
                <Button
                  preset="secondary"
                  text={translate("login:continueWithGoogle")}
                  onPress={handleGoogleSignIn}
                  LeftAccessory={() => <GoogleIcon />}
                />
              )}

              {Platform.OS === "ios" && !isChina && (
                <Button
                  preset="secondary"
                  text={translate("login:continueWithApple")}
                  onPress={handleAppleSignIn}
                  LeftAccessory={() => <AppleIcon color={theme.colors.foreground} />}
                />
              )}
            </View>
          </View>

          {/* Already have an account? Log in */}
          <View className="flex-row justify-center items-center gap-1 mt-2">
            <Text className="text-sm text-muted-foreground">{translate("login:alreadyHaveAccount")}</Text>
            <TouchableOpacity onPress={() => push("/auth/email-login")}>
              <Text className="text-sm text-secondary-foreground font-semibold">{translate("login:logIn")}</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-[11px] text-muted-foreground text-center mt-2">{translate("login:termsText")}</Text>
        </View>
      </View>
    </View>
  )
}
