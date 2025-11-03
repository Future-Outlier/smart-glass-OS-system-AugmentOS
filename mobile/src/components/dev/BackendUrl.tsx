import {PillButton, Text} from "@/components/ignite"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n"
import {useState} from "react"
import {TextInput, View, ViewStyle, TextStyle} from "react-native"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function BackendUrl() {
  const {theme, themed} = useAppTheme()
  const {replace} = useNavigationHistory()
  const [customUrlInput, setCustomUrlInput] = useState("")
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [backendUrl, setBackendUrl] = useSetting(SETTINGS_KEYS.backend_url)

  // Triple-tap detection for Asia East button
  const [asiaButtonTapCount, setAsiaButtonTapCount] = useState(0)
  const [asiaButtonLastTapTime, setAsiaButtonLastTapTime] = useState(0)

  const handleSaveUrl = async () => {
    const urlToTest = customUrlInput.trim().replace(/\/+$/, "")

    // Basic validation
    if (!urlToTest) {
      showAlert("Empty URL", "Please enter a URL or reset to default.", [{text: "OK"}])
      return
    }

    if (!urlToTest.startsWith("http://") && !urlToTest.startsWith("https://")) {
      showAlert("Invalid URL", "Please enter a valid URL starting with http:// or https://", [{text: "OK"}])
      return
    }

    setIsSavingUrl(true)

    try {
      // Test the URL by fetching the version endpoint
      const testUrl = `${urlToTest}/apps/version`
      console.log(`Testing URL: ${testUrl}`)

      // Create an AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(testUrl, {
          method: "GET",
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          console.log("URL Test Successful:", data)

          await setBackendUrl(urlToTest)

          await showAlert(
            "Success",
            "Custom backend URL saved and verified. It will be used on the next connection attempt or app restart.",
            [
              {
                text: translate("common:ok"),
                onPress: () => {
                  replace("/init")
                },
              },
            ],
          )
        } else {
          console.error(`URL Test Failed: Status ${response.status}`)
          showAlert(
            "Verification Failed",
            `The server responded, but with status ${response.status}. Please check the URL and server status.`,
            [{text: "OK"}],
          )
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId)
        throw fetchError
      }
    } catch (error: unknown) {
      console.error("URL Test Failed:", error instanceof Error ? error.message : "Unknown error")

      let errorMessage = "Could not connect to the specified URL. Please check the URL and your network connection."

      if (error instanceof Error && error.name === "AbortError") {
        errorMessage = "Connection timed out. Please check the URL and server status."
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Network error occurred. Please check your internet connection and the URL."
      }

      showAlert("Verification Failed", errorMessage, [{text: "OK"}])
    } finally {
      setIsSavingUrl(false)
    }
  }

  const handleResetUrl = async () => {
    setBackendUrl(null)
    setCustomUrlInput("")
    showAlert("Success", "Reset backend URL to default.", [
      {
        text: "OK",
        onPress: () => {
          replace("/init")
        },
      },
    ])
  }

  const handleAsiaButtonPress = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - asiaButtonLastTapTime

    if (timeDiff > 2000) {
      setAsiaButtonTapCount(1)
    } else {
      setAsiaButtonTapCount(prev => prev + 1)
    }

    setAsiaButtonLastTapTime(currentTime)

    if (asiaButtonTapCount + 1 >= 3) {
      setCustomUrlInput("https://devold.augmentos.org:443")
    } else {
      setCustomUrlInput("https://asiaeastapi.mentra.glass:443")
    }
  }

  return (
    <View style={themed($container)}>
      <View style={themed($textContainer)}>
        <Text style={themed($label)}>Custom Backend URL</Text>
        <Text style={themed($subtitle)}>
          Override the default backend server URL. Leave blank to use default.
          {backendUrl && `\nCurrently using: ${backendUrl}`}
        </Text>
        <TextInput
          style={themed($urlInput)}
          placeholder="e.g., http://192.168.1.100:7002"
          placeholderTextColor={theme.colors.textDim}
          value={customUrlInput}
          onChangeText={setCustomUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!isSavingUrl}
        />
        <View style={themed($buttonRow)}>
          <PillButton
            text={isSavingUrl ? "Testing..." : "Save & Test URL"}
            variant="primary"
            onPress={handleSaveUrl}
            disabled={isSavingUrl}
            buttonStyle={themed($saveButton)}
          />
          <PillButton
            tx="common:reset"
            variant="icon"
            onPress={handleResetUrl}
            disabled={isSavingUrl}
            buttonStyle={themed($resetButton)}
          />
        </View>
        <View style={themed($buttonColumn)}>
          <PillButton
            tx="developer:global"
            variant="icon"
            onPress={() => setCustomUrlInput("https://api.mentra.glass:443")}
            buttonStyle={themed($button)}
          />
          <PillButton
            tx="developer:dev"
            variant="icon"
            onPress={() => setCustomUrlInput("https://devapi.mentra.glass:443")}
            buttonStyle={themed($button)}
          />
        </View>
        <View style={themed($buttonColumn)}>
          <PillButton
            tx="developer:debug"
            variant="icon"
            onPress={() => setCustomUrlInput("https://debug.augmentos.cloud:443")}
            buttonStyle={themed($button)}
          />
          <PillButton
            tx="developer:usCentral"
            variant="icon"
            onPress={() => setCustomUrlInput("https://uscentralapi.mentra.glass:443")}
            buttonStyle={themed($button)}
          />
        </View>
        <View style={themed($buttonColumn)}>
          <PillButton
            tx="developer:france"
            variant="icon"
            onPress={() => setCustomUrlInput("https://franceapi.mentra.glass:443")}
            buttonStyle={themed($button)}
          />
          <PillButton
            tx="developer:asiaEast"
            variant="icon"
            onPress={handleAsiaButtonPress}
            buttonStyle={themed($button)}
          />
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
})

const $textContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  flexWrap: "wrap",
  fontSize: 16,
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  flexWrap: "wrap",
  fontSize: 12,
  marginTop: 5,
  color: colors.textDim,
})

const $urlInput: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderColor: colors.primary,
  borderRadius: spacing.sm,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  marginTop: 10,
  marginBottom: 10,
  color: colors.text,
})

const $buttonRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 10,
})

const $saveButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  marginRight: 10,
})

const $resetButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $button: ThemedStyle<ViewStyle> = () => ({
  flexShrink: 1,
})

const $buttonColumn: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 12,
  justifyContent: "space-between",
  marginTop: 12,
})
