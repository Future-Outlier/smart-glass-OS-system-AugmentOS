import Constants from "expo-constants"
import {useState} from "react"
import {KeyboardAvoidingView, Platform, ScrollView, TextInput, TextStyle, View, ViewStyle} from "react-native"

import {Button, Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import restComms from "@/services/RestComms"
import {useAppletStatusStore} from "@/stores/applets"
import {useGlassesStore} from "@/stores/glasses"
import {SETTINGS, useSetting} from "@/stores/settings"
import {$styles, ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"

export default function FeedbackPage() {
  const [feedbackText, setFeedbackText] = useState("")
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()
  const apps = useAppletStatusStore(state => state.apps)
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const glassesConnected = useGlassesStore(state => state.connected)
  const glassesModelName = useGlassesStore(state => state.modelName)

  const handleSubmitFeedback = async (feedbackBody: string) => {
    console.log("Feedback submitted:", feedbackBody)

    // Collect diagnostic information
    const customBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL_OVERRIDE
    const isBetaBuild = !!customBackendUrl
    const osVersion = `${Platform.OS} ${Platform.Version}`
    const deviceName = Constants.deviceName || "deviceName"
    const appVersion = process.env.EXPO_PUBLIC_MENTRAOS_VERSION || "version"
    const buildCommit = process.env.EXPO_PUBLIC_BUILD_COMMIT || "commit"
    const buildBranch = process.env.EXPO_PUBLIC_BUILD_BRANCH || "branch"
    const buildTime = process.env.EXPO_PUBLIC_BUILD_TIME || "time"
    const buildUser = process.env.EXPO_PUBLIC_BUILD_USER || "user"

    // Glasses info
    const connectedGlassesModel = glassesConnected ? glassesModelName : "Not connected"

    // Running apps
    const runningApps = apps.filter(app => app.running).map(app => app.packageName)
    const runningAppsText = runningApps.length > 0 ? runningApps.join(", ") : "None"

    // Build additional info section
    const additionalInfo = [
      `Beta Build: ${isBetaBuild ? "Yes" : "No"}`,
      isBetaBuild ? `Backend URL: ${customBackendUrl}` : null,
      `App Version: ${appVersion}`,
      `Device: ${deviceName}`,
      `OS: ${osVersion}`,
      `Platform: ${Platform.OS}`,
      `Connected Glasses: ${connectedGlassesModel}`,
      `Default Wearable: ${defaultWearable}`,
      `Running Apps: ${runningAppsText}`,
      `Build Commit: ${buildCommit}`,
      `Build Branch: ${buildBranch}`,
      `Build Time: ${buildTime}`,
      `Build User: ${buildUser}`,
    ]
      .filter(Boolean)
      .join("\n")

    // Combine feedback with diagnostic info
    const fullFeedback = `FEEDBACK:\n${feedbackBody}\n\nADDITIONAL INFO:\n${additionalInfo}`
    console.log("Full Feedback submitted:", fullFeedback)
    const res = await restComms.sendFeedback(fullFeedback)
    if (res.is_error()) {
      console.error("Error sending feedback:", res.error)
      showAlert(translate("common:error"), translate("feedback:errorSendingFeedback"), [
        {
          text: translate("common:ok"),
          onPress: () => {
            goBack()
          },
        },
      ])
      return
    }
    await restComms.sendFeedback(fullFeedback)

    showAlert(translate("feedback:thankYou"), translate("feedback:feedbackReceived"), [
      {
        text: translate("common:ok"),
        onPress: () => {
          setFeedbackText("")
          goBack()
        },
      },
    ])
  }

  return (
    <Screen preset="fixed" style={themed($styles.screen)}>
      <Header title={translate("feedback:giveFeedback")} leftIcon="chevron-left" onLeftPress={goBack} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
        <ScrollView contentContainerStyle={themed($scrollContainer)} keyboardShouldPersistTaps="handled">
          <View style={themed($container)}>
            <TextInput
              style={themed($textInput)}
              multiline
              numberOfLines={10}
              placeholder={translate("feedback:shareYourThoughts")}
              placeholderTextColor={theme.colors.textDim}
              value={feedbackText}
              onChangeText={setFeedbackText}
              textAlignVertical="top"
            />

            <Button
              tx="feedback:submitFeedback"
              onPress={() => handleSubmitFeedback(feedbackText)}
              disabled={!feedbackText.trim()}
              preset="primary"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  gap: spacing.s6,
})

const $scrollContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexGrow: 1,
  paddingVertical: spacing.s4,
})

const $textInput: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.s3,
  padding: spacing.s4,
  fontSize: 16,
  color: colors.text,
  minHeight: 200,
  maxHeight: 400,
})
