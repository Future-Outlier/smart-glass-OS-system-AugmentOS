// eslint-disable-next-line import/no-unresolved
import LogoSvg from "@assets/logo/logo.svg"
import {FontAwesome} from "@expo/vector-icons"
import {useLocalSearchParams} from "expo-router"
import * as WebBrowser from "expo-web-browser"
import {useEffect, useState} from "react"
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import {Pressable} from "react-native-gesture-handler"

import {Button, Screen, Text} from "@/components/ignite"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import {spacing} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import mentraAuth from "@/utils/auth/authClient"
import {mapAuthError} from "@/utils/auth/authErrors"
import {useSafeAreaInsetsStyle} from "@/utils/useSafeAreaInsetsStyle"

import AppleIcon from "assets/icons/component/AppleIcon"
import GoogleIcon from "assets/icons/component/GoogleIcon"

export default function LoginScreen() {
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isFormLoading, setIsFormLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [formAction, setFormAction] = useState<"signin" | null>(null)
  const [backPressCount, setBackPressCount] = useState(0)
  const {push, replace} = useNavigationHistory()
  const [isChina] = useSetting(SETTINGS.china_deployment.key)
  const {authError} = useLocalSearchParams<{authError?: string}>()

  const {theme} = useAppTheme()
  const $bottomContainerInsets = useSafeAreaInsetsStyle(["bottom"])

  const [showPassword, setShowPassword] = useState(false)
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  useEffect(() => {
    if (authError) {
      const errorMessage = mapAuthError(authError)
      showAlert(translate("common:error"), errorMessage, [{text: translate("common:ok")}])
    }
  }, [authError])

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log("App state changed to:", nextAppState)
      if (nextAppState === "active" && isAuthLoading) {
        console.log("App became active, hiding auth overlay")
        setIsAuthLoading(false)
      }
    }

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, [isAuthLoading])

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true)

    setTimeout(() => {
      console.log("Auth flow failsafe timeout - hiding loading overlay")
      setIsAuthLoading(false)
    }, 5000)

    const res = await mentraAuth.googleSignIn()

    if (res.is_error()) {
      setIsAuthLoading(false)
      return
    }
    const url = res.value

    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)

    setIsAuthLoading(false)
  }

  const handleAppleSignIn = async () => {
    setIsAuthLoading(true)

    const res = await mentraAuth.appleSignIn()
    if (res.is_error()) {
      console.error("Apple sign in failed:", res.error)
      setIsAuthLoading(false)
      return
    }
    const url = res.value

    console.log("Opening browser with:", url)
    await WebBrowser.openBrowserAsync(url)

    setIsAuthLoading(false)
  }

  const validateInputs = (): boolean => {
    if (!email.trim()) {
      showAlert(translate("common:error"), translate("login:errors.emailRequired"), [{text: translate("common:ok")}])
      return false
    }
    if (!email.includes("@") || !email.includes(".")) {
      showAlert(translate("common:error"), translate("login:invalidEmail"), [{text: translate("common:ok")}])
      return false
    }
    if (!password) {
      showAlert(translate("common:error"), translate("login:errors.passwordRequired"), [{text: translate("common:ok")}])
      return false
    }
    return true
  }

  const handleEmailSignIn = async (emailInput: string, passwordInput: string) => {
    Keyboard.dismiss()

    if (!validateInputs()) {
      return
    }

    setIsFormLoading(true)
    setFormAction("signin")

    const res = await mentraAuth.signInWithPassword({email: emailInput, password: passwordInput})
    if (res.is_error()) {
      console.error("Error during sign-in:", res.error)
      showAlert(translate("common:error"), mapAuthError(res.error), [{text: translate("common:ok")}])
      setIsFormLoading(false)
      setFormAction(null)
      return
    }

    setIsFormLoading(false)
    setFormAction(null)
    replace("/")
  }

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isSigningUp) {
        setIsSigningUp(false)
        return true
      }

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
  }, [backPressCount, isSigningUp])

  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={{flex: 1}}>
      <View className="flex-1 justify-center p-4">
        {/* Auth Loading Overlay */}
        {isAuthLoading && (
          <View className="absolute inset-0 z-10 items-center justify-center bg-black/90">
            <View className="items-center p-4">
              <View className="mb-6 items-center justify-center">
                <LogoSvg width={108} height={58} />
              </View>
              <ActivityIndicator size="large" color={theme.colors.tint} className="mb-3" />
              <Text tx="login:connectingToServer" className="text-center text-white" />
            </View>
          </View>
        )}

        <View>
          <View className="mb-4 items-center justify-center">
            <LogoSvg width={108} height={58} />
          </View>
          <Text preset="heading" tx="login:title" className="mb-2 pt-8 pb-4 text-center text-5xl" />
          <Text preset="subheading" tx="login:subtitle" className="mb-4 text-center text-base" />
        </View>

        <View className="mb-4">
          {isSigningUp ? (
            <View className="w-full">
              <View className="mb-3">
                <Text tx="login:email" className="mb-2 text-sm font-medium" />
                <View className="h-12 flex-row items-center rounded-lg border border-gray-300 bg-transparent px-3 dark:border-gray-600">
                  <FontAwesome name="envelope" size={16} color={theme.colors.textDim} />
                  <Spacer width={spacing.s3} />
                  <TextInput
                    hitSlop={{top: 16, bottom: 16}}
                    className="flex-1 text-base text-black dark:text-white"
                    placeholder={translate("login:emailPlaceholder")}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={theme.colors.textDim}
                  />
                </View>
              </View>

              <View className="mb-3">
                <Text tx="login:password" className="mb-2 text-sm font-medium" />
                <View className="h-12 flex-row items-center rounded-lg border border-gray-300 bg-transparent px-3 dark:border-gray-600">
                  <FontAwesome name="lock" size={16} color={theme.colors.textDim} />
                  <Spacer width={spacing.s3} />
                  <TextInput
                    hitSlop={{top: 16, bottom: 16}}
                    className="flex-1 text-base text-black dark:text-white"
                    placeholder={translate("login:passwordPlaceholder")}
                    value={password}
                    autoCapitalize="none"
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    placeholderTextColor={theme.colors.textDim}
                  />
                  <TouchableOpacity
                    hitSlop={{top: 16, bottom: 16, left: 16, right: 16}}
                    onPress={togglePasswordVisibility}>
                    <FontAwesome name={showPassword ? "eye" : "eye-slash"} size={18} color={theme.colors.textDim} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity onPress={() => push("/auth/forgot-password")} className="mt-2 self-end">
                <Text tx="login:forgotPassword" className="text-sm text-blue-500 underline" />
              </TouchableOpacity>

              <Spacer height={spacing.s3} />

              <Button
                tx="login:login"
                className="rounded-full"
                onPress={() => handleEmailSignIn(email, password)}
                disabled={isFormLoading}
                {...(isFormLoading &&
                  formAction === "signin" && {
                    LeftAccessory: () => (
                      <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginRight: 8}} />
                    ),
                  })}
              />

              <Spacer height={spacing.s4} />

              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-sm text-gray-500">{translate("login:signup.newToMentra")}</Text>
                <TouchableOpacity onPress={() => push("/auth/signup")}>
                  <Text className="text-sm font-semibold text-blue-500">{translate("login:signup.createAccount")}</Text>
                </TouchableOpacity>
              </View>

              <Spacer height={spacing.s3} />

              <Pressable onPress={() => setIsSigningUp(false)}>
                <View className="flex-row items-center justify-center">
                  <FontAwesome name="arrow-left" size={16} color={theme.colors.textDim} />
                  <Text className="ml-2 text-gray-500">Back</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View className="gap-4">
              <Button
                flexContainer
                tx="login:continueWithEmail"
                className="rounded-full"
                onPress={() => setIsSigningUp(true)}
                LeftAccessory={() => <FontAwesome name="envelope" size={16} color={theme.colors.textAlt} />}
              />

              {!isChina && (
                <TouchableOpacity
                  className="h-11 flex-row items-center rounded-full border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-800"
                  onPress={handleGoogleSignIn}>
                  <View className="absolute left-3 h-6 w-6 items-center justify-center">
                    <GoogleIcon />
                  </View>
                  <Text className="flex-1 text-center text-base" tx="login:continueWithGoogle" />
                </TouchableOpacity>
              )}

              {Platform.OS === "ios" && !isChina && (
                <TouchableOpacity
                  className="h-11 flex-row items-center rounded-full border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-800"
                  onPress={handleAppleSignIn}>
                  <View className="absolute left-3 h-6 w-6 items-center justify-center">
                    <AppleIcon color={theme.colors.text} />
                  </View>
                  <Text className="flex-1 text-center text-base" tx="login:continueWithApple" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={$bottomContainerInsets}>
          <Text tx="login:termsText" size="xs" className="mt-2 text-center text-xs text-gray-400" />
        </View>
      </View>

      {/* Loading Modal */}
      <Modal visible={isFormLoading} transparent={true} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/70">
          <View className="min-w-[200px] items-center rounded-lg bg-white p-8 dark:bg-gray-800">
            <ActivityIndicator size="large" color={theme.colors.tint} className="mb-4" />
            <Text preset="bold">{translate("login:connectingToServer")}</Text>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
