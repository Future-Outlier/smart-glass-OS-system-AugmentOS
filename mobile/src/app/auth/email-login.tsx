import {FontAwesome} from "@expo/vector-icons"
import * as WebBrowser from "expo-web-browser"
import {useState} from "react"
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"

import {Button, Header, Screen, Text} from "@/components/ignite"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {SETTINGS, useSetting} from "@/stores/settings"
import {spacing, ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import mentraAuth from "@/utils/auth/authClient"
import {mapAuthError} from "@/utils/auth/authErrors"

import AppleIcon from "assets/icons/component/AppleIcon"
import GoogleIcon from "assets/icons/component/GoogleIcon"

export default function EmailLoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  const {goBack, replace, push} = useNavigationHistory()
  const {theme, themed} = useAppTheme()
  const [isChina] = useSetting(SETTINGS.china_deployment.key)

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

  const handleEmailSignIn = async () => {
    Keyboard.dismiss()

    if (!validateInputs()) {
      return
    }

    setIsLoading(true)

    const res = await mentraAuth.signInWithPassword({email, password})
    if (res.is_error()) {
      console.error("Error during sign-in:", res.error)
      showAlert(translate("common:error"), mapAuthError(res.error), [{text: translate("common:ok")}])
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    replace("/")
  }

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true)

    setTimeout(() => {
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

  return (
    <Screen preset="fixed" style={themed($container)}>
      <Header title={translate("login:logIn")} leftIcon="chevron-left" onLeftPress={goBack} />
      <ScrollView
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={themed($card)}>
          <Text preset="heading" style={themed($heading)}>
            {translate("login:loginToMentra")}
          </Text>

          <View style={themed($form)}>
            <View style={themed($inputGroup)}>
              <Text tx="login:email" style={themed($inputLabel)} />
              <View style={themed($enhancedInputContainer)}>
                <TextInput
                  hitSlop={{top: 16, bottom: 16}}
                  style={themed($enhancedInput)}
                  placeholder={translate("login:emailPlaceholder")}
                  value={email}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  onChangeText={setEmail}
                  placeholderTextColor={theme.colors.textDim}
                  autoFocus={true}
                />
              </View>
            </View>

            <View style={themed($inputGroup)}>
              <Text tx="login:password" style={themed($inputLabel)} />
              <View style={themed($enhancedInputContainer)}>
                <TextInput
                  hitSlop={{top: 16, bottom: 16}}
                  style={themed($enhancedInput)}
                  placeholder={translate("login:passwordPlaceholder")}
                  value={password}
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor={theme.colors.textDim}
                  onSubmitEditing={handleEmailSignIn}
                  returnKeyType="go"
                />
                <TouchableOpacity
                  hitSlop={{top: 16, bottom: 16, left: 16, right: 16}}
                  onPress={() => setShowPassword(!showPassword)}>
                  <FontAwesome name={showPassword ? "eye" : "eye-slash"} size={18} color={theme.colors.textDim} />
                </TouchableOpacity>
              </View>
            </View>

            <Spacer height={spacing.s2} />

            <Button
              tx="login:logIn"
              style={themed($primaryButton)}
              pressedStyle={themed($pressedButton)}
              textStyle={themed($buttonText)}
              onPress={handleEmailSignIn}
              disabled={isLoading}
              LeftAccessory={() => (
                <FontAwesome name="envelope" size={16} color={theme.colors.textAlt} style={{marginRight: 8}} />
              )}
            />

            <Text style={themed($termsText)}>{translate("login:termsTextSignIn")}</Text>

            <TouchableOpacity onPress={() => push("/auth/forgot-password")} style={themed($forgotPasswordContainer)}>
              <Text tx="login:forgotPassword" style={themed($forgotPasswordText)} />
            </TouchableOpacity>

            <View style={themed($dividerContainer)}>
              <View style={themed($dividerLine)} />
              <Text style={themed($dividerText)}>OR</Text>
              <View style={themed($dividerLine)} />
            </View>

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
          </View>
        </View>
      </ScrollView>

      {/* Loading Modal */}
      <Modal visible={isLoading || isAuthLoading} transparent={true} animationType="fade">
        <View style={themed($modalOverlay)}>
          <View style={themed($modalContent)}>
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

const $scrollContent: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 1,
})

const $card: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.s4,
})

const $heading: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "bold",
  color: colors.text,
  marginBottom: spacing.s4,
})

const $form: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $inputGroup: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s3,
})

const $inputLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "500",
  color: colors.text,
  marginBottom: 8,
})

const $enhancedInputContainer: ThemedStyle<ViewStyle> = ({colors, spacing, isDark}) => ({
  flexDirection: "row",
  alignItems: "center",
  height: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: spacing.s3,
  backgroundColor: isDark ? colors.palette.transparent : colors.background,
  ...(isDark
    ? {
        shadowOffset: {
          width: 0,
          height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      }
    : {}),
})

const $enhancedInput: ThemedStyle<TextStyle> = ({colors}) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({})

const $pressedButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
  opacity: 0.9,
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textAlt,
  fontSize: 16,
  fontWeight: "500",
})

const $termsText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  textAlign: "center",
  marginTop: spacing.s3,
})

const $forgotPasswordContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignSelf: "center",
  marginTop: spacing.s4,
})

const $forgotPasswordText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.tint,
  textDecorationLine: "underline",
})

const $dividerContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginVertical: spacing.s6,
})

const $dividerLine: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  height: 1,
  backgroundColor: colors.border,
})

const $dividerText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  marginHorizontal: spacing.s3,
  fontSize: 14,
  color: colors.textDim,
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
  marginBottom: spacing.s3,
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

const $modalOverlay: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  justifyContent: "center",
  alignItems: "center",
})

const $modalContent: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  padding: spacing.s8,
  borderRadius: spacing.s4,
  alignItems: "center",
  minWidth: 200,
})
