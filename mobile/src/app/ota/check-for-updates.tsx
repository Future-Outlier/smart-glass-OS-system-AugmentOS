import {useLocalSearchParams, useFocusEffect} from "expo-router"
import {useState, useEffect, useCallback, useRef} from "react"
import {View, TextInput, TouchableOpacity, BackHandler} from "react-native"
import {ViewStyle, TextStyle} from "react-native"
import {ScrollView} from "react-native"

import {WifiIcon} from "@/components/icons/WifiIcon"
import {Screen, Header, Checkbox, Button, Text, Icon} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {useGlassesStore} from "@/stores/glasses"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/contexts/ThemeContext"
import WifiCredentialsService from "@/utils/wifi/WifiCredentialsService"
import { MentraLogoStandalone } from "@/components/brands/MentraLogoStandalone"

export default function WifiPasswordScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const initialSsid = (params.ssid as string) || ""
  const returnTo = params.returnTo as string | undefined
  const nextRoute = params.nextRoute as string | undefined

  const {theme, themed} = useAppTheme()
  const {push, goBack, replace} = useNavigationHistory()
  const glassesConnected = useGlassesStore(state => state.connected)
  const [ssid, setSsid] = useState(initialSsid)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(true)
  const [hasSavedPassword, setHasSavedPassword] = useState(false)

  return (
    <Screen preset="fixed">
      <Header leftIcon="chevron-left" onLeftPress={goBack} RightActionComponent={<MentraLogoStandalone />} />
      
      <View className="flex">
        <Icon name="wifi" size={24} />
      </View>

      <View className="flex-1 justify-center items-center">
        <Button preset="primary" text="Check for Updates" onPress={() => {}} />
      </View>
    </Screen>
  )
}