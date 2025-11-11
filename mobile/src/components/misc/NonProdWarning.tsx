// SensingDisabledWarning.tsx
import {useEffect, useState} from "react"
import {TouchableOpacity, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function NonProdWarning() {
  const {theme, themed} = useAppTheme()
  const [isProdBackend, setIsProdBackend] = useState(true)
  const {push} = useNavigationHistory()
  const [backendUrl, _setBackendUrl] = useSetting(SETTINGS_KEYS.backend_url)

  const checkNonProdBackend = async () => {
    let isProd = false
    if (
      backendUrl.includes("prod.augmentos.cloud") ||
      backendUrl.includes("global.augmentos.cloud") ||
      backendUrl.includes("api.mentra.glass")
    ) {
      isProd = true
    }

    if (backendUrl.includes("devapi")) {
      isProd = false
    }

    setIsProdBackend(isProd)
  }

  useEffect(() => {
    checkNonProdBackend()
  }, [backendUrl])

  if (isProdBackend) {
    return null
  }

  // return (
  //   <View style={[styles.sensingWarningContainer, {backgroundColor: "#FFF3E0", borderColor: "#FFB74D"}]}>
  //     <View style={styles.warningContent}>
  //       <Icon name="alert" size={22} color="#FF9800" />
  //       <Text style={themed($warningText)} tx="warning:nonProdBackend" />
  //     </View>
  //     <TouchableOpacity
  //       style={styles.settingsButton}
  //       onPress={() => {
  //         push("/settings/developer")
  //       }}>
  //       <Text style={styles.settingsButtonTextBlue}>Settings</Text>
  //     </TouchableOpacity>
  //   </View>
  // )

  const nonProdWarning = () => {
    showAlert(translate("warning:nonProdBackend"), "", [
      {text: translate("common:ok"), onPress: () => {}},
      {
        text: translate("settings:developerSettings"),
        onPress: () => {
          push("/settings/developer")
        },
      },
    ])
  }

  return (
    <TouchableOpacity style={themed($settingsButton)} onPress={nonProdWarning}>
      <MaterialCommunityIcons name="alert" size={theme.spacing.s6} color={theme.colors.error} />
    </TouchableOpacity>
  )
}

const $settingsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.s3,
})
