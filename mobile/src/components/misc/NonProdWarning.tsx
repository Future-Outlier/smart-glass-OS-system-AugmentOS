// SensingDisabledWarning.tsx
import React, {useCallback, useState} from "react"
import {View, StyleSheet, TouchableOpacity, TextStyle} from "react-native"
import {Text} from "@/components/ignite"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {useNavigation} from "@react-navigation/native"
import {NavigationProps} from "./types"
import {router, useFocusEffect} from "expo-router"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {SETTINGS_KEYS} from "@/consts"
import {loadSetting} from "@/utils/SettingsHelper"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function NonProdWarning() {
  const {theme, themed} = useAppTheme()
  const [isProdBackend, setIsProdBackend] = useState(true)
  const {push} = useNavigationHistory()

  const checkNonProdBackend = async () => {
    const url = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, "prod.augmentos.cloud")

    let isProd = false
    if (
      url.includes("prod.augmentos.cloud") ||
      url.includes("global.augmentos.cloud") ||
      url.includes("api.mentra.glass")
    ) {
      isProd = true
    }

    if (url.includes("devapi")) {
      isProd = false
    }

    setIsProdBackend(isProd)
  }

  useFocusEffect(
    useCallback(() => {
      checkNonProdBackend()
      return () => {}
    }, []),
  )

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
      <MaterialCommunityIcons name="alert" size={theme.spacing.lg} color={theme.colors.error} />
    </TouchableOpacity>
  )
}

const $settingsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.sm,
})

const $warningText: ThemedStyle<TextStyle> = ({colors}) => ({
  marginLeft: 10,
  fontSize: 14,
  fontWeight: "500",
  color: colors.error,
  flex: 1,
})

const styles = StyleSheet.create({
  sensingWarningContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12, // Match ConnectedDeviceInfo
    borderWidth: 1, // Restore border for the warning
    marginBottom: 16,
    marginTop: 16, // Added spacing above the warning
    marginHorizontal: 0,
    width: "100%",
  },

  settingsButtonTextBlue: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  warningContent: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
  },
})
