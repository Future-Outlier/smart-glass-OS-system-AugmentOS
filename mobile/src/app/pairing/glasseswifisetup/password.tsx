import {useState, useEffect, useCallback} from "react"
import {View, TextInput, TouchableOpacity, BackHandler} from "react-native"
import {useLocalSearchParams, useFocusEffect, router} from "expo-router"
import {Screen, Icon, Header, Checkbox, Button, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import WifiCredentialsService from "@/utils/wifi/WifiCredentialsService"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {ScrollView} from "react-native"
import Toast from "react-native-toast-message"

export default function WifiPasswordScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const initialSsid = (params.ssid as string) || ""
  const returnTo = params.returnTo as string | undefined

  const {theme, themed} = useAppTheme()
  const {push, goBack} = useNavigationHistory()
  const [ssid, setSsid] = useState(initialSsid)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(true)
  const [hasSavedPassword, setHasSavedPassword] = useState(false)

  const handleGoBack = useCallback(() => {
    if (returnTo && typeof returnTo === "string") {
      router.replace(decodeURIComponent(returnTo))
    } else {
      goBack()
    }
    return true // Prevent default back behavior
  }, [returnTo])

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleGoBack)
      return () => backHandler.remove()
    }, [handleGoBack]),
  )

  // Load saved password when component mounts
  useEffect(() => {
    if (initialSsid) {
      const savedPassword = WifiCredentialsService.getPassword(initialSsid)
      if (savedPassword) {
        setPassword(savedPassword)
        setHasSavedPassword(true)
        setRememberPassword(true) // Check the box if there's a saved password
      }
    }
  }, [initialSsid])

  // Handle checkbox state changes - immediately remove saved password when unchecked
  useEffect(() => {
    console.log("321321 rememberPassword", rememberPassword)
    console.log("321321 initialSsid", initialSsid)
    if (!rememberPassword && initialSsid) {
      // Remove saved credentials immediately when checkbox is unchecked
      WifiCredentialsService.removeCredentials(initialSsid)
      setHasSavedPassword(false)
      console.log("$%^&*()_321321 removed credentials")
    }
  }, [rememberPassword, initialSsid])

  const handleConnect = async () => {
    if (!ssid) {
      Toast.show({
        type: "error",
        text1: "Please enter a network name",
      })
      return
    }

    // Don't save credentials here - only save after successful connection
    // If user unchecked "Remember Password", remove any existing saved credentials
    if (!rememberPassword) {
      await WifiCredentialsService.removeCredentials(ssid)
    }

    // Navigate to connecting screen with credentials
    push("/pairing/glasseswifisetup/connecting", {
      deviceModel,
      ssid,
      password,
      rememberPassword: rememberPassword.toString(),
      returnTo,
    })
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Header title="Enter Glasses WiFi Details" leftIcon="caretLeft" onLeftPress={handleGoBack} />
      <ScrollView
        style={{marginBottom: 20, marginTop: 10, marginRight: -theme.spacing.s4, paddingRight: theme.spacing.s4}}>
        <View style={themed($content)}>
          <View style={themed($inputContainer)}>
            <Text style={themed($label)}>Network Name (SSID)</Text>
            <TextInput
              style={themed($input)}
              value={ssid}
              onChangeText={setSsid}
              placeholder="Enter network name"
              placeholderTextColor={theme.colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!initialSsid} // Only editable if manually entering
            />
          </View>

          <View style={themed($inputContainer)}>
            <Text style={themed($label)}>Password</Text>
            <View style={themed($passwordContainer)}>
              <TextInput
                style={themed($passwordInput)}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={themed($eyeButton)}>
                <Icon icon={showPassword ? "view" : "hidden"} size={20} color={theme.colors.textDim} />
              </TouchableOpacity>
            </View>
            {hasSavedPassword && (
              <Text style={themed($savedPasswordText)}>✓ Password loaded from saved credentials</Text>
            )}
          </View>

          <View style={themed($checkboxContainer)}>
            <Checkbox value={rememberPassword} onValueChange={setRememberPassword} />
            <View style={themed($checkboxContent)}>
              <Text style={themed($checkboxLabel)}>Remember Password</Text>
              <Text style={themed($checkboxDescription)}>Save this password for future connections</Text>
            </View>
          </View>

          <View style={themed($buttonContainer)}>
            <Button
              text="Connect"
              style={themed($primaryButton)}
              pressedStyle={themed($pressedButton)}
              textStyle={themed($buttonText)}
              onPress={handleConnect}
            />

            <Button
              text="Cancel"
              style={themed($secondaryButton)}
              pressedStyle={themed($pressedSecondaryButton)}
              onPress={handleGoBack}
              preset="reversed"
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingHorizontal: spacing.s6,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.s6,
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginBottom: spacing.s2,
})

const $input: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  height: 50,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.s2,
  padding: spacing.s3,
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
})

const $passwordContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  position: "relative",
})

const $passwordInput: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  flex: 1,
  height: 50,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.s2,
  padding: spacing.s3,
  paddingRight: 50,
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
})

const $eyeButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "absolute",
  right: spacing.s3,
  height: 50,
  width: 40,
  justifyContent: "center",
  alignItems: "center",
})

const $savedPasswordText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.tint,
  marginTop: spacing.s2,
  fontStyle: "italic",
})

const $checkboxContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: spacing.s6,
  paddingVertical: spacing.s3,
})

const $checkboxContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginLeft: spacing.s3,
})

const $checkboxLabel: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginBottom: spacing.s2,
})

const $checkboxDescription: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.s8,
  gap: spacing.s3,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({})

const $secondaryButton: ThemedStyle<ViewStyle> = () => ({})

const $pressedButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.buttonPressed,
  opacity: 0.9,
})

const $pressedSecondaryButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral200,
  opacity: 0.9,
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textAlt,
  fontSize: 16,
  fontWeight: "bold",
})
