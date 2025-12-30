import {View, ActivityIndicator} from "react-native"

import {Screen, Header, Button, Text, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useGlassesStore} from "@/stores/glasses"
import {useAppTheme} from "@/contexts/ThemeContext"
import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"

export default function OtaCheckForUpdatesScreen() {

  const {theme} = useAppTheme()
  const {pushPrevious, setPreventBack} = useNavigationHistory()
  const glassesConnected = useGlassesStore(state => state.connected)
  
  const handleSkip = () => {
    setPreventBack(false)
    pushPrevious()
  }

  focusEffectPreventBack()

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <Header RightActionComponent={<MentraLogoStandalone />} />

      <View className="flex items-center justify-center">
        <Icon name="world-download" size={48} color={theme.colors.primary} />
        <View className="h-6" />
        <Text tx="ota:checkingForUpdates" className="font-semibold text-lg" />
        <View className="h-2" />
        <Text tx="ota:checkingForUpdatesMessage" className="text-sm text-center" />
      </View>

      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.secondary_foreground} />
      </View>

      <View className="justify-center items-center">
        <Button preset="primary" tx="common:skip" flexContainer onPress={handleSkip} />
      </View>
    </Screen>
  )
}
