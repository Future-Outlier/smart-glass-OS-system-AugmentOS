import {Screen} from "@/components/ignite"
import {SplashVideo} from "@/components/splash/SplashVideo"
import {SETTINGS, useSetting} from "@/stores/settings"
import {Text} from "@/components/ignite"
import {View} from "react-native"

export default function AuthCallback() {
  const [superMode] = useSetting(SETTINGS.super_mode.key)
  if (superMode) {
    return (
      <Screen preset="fixed">
        <View className="flex-1 justify-center items-center">
          <View className="h-32 w-32 items-center">
            <SplashVideo />
            <Text className="text-chart-4">Auth Callback</Text>
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed">
      <SplashVideo />
    </Screen>
  )
}
