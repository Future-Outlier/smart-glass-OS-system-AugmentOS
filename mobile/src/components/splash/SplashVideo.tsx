import {View} from "react-native"
import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"

// TODO: Replace with animated SVG from designer
// Videos for light and dark themes (keeping for future use)
// const LIGHT_VIDEO = require("@assets/splash/loading_animation_light.mp4")
// const DARK_VIDEO = require("@assets/splash/loading_animation_dark.mp4")

// interface SplashVideoProps {
//   onFinished?: () => void
//   loop?: boolean
// }

export function SplashVideo() {
  return (
    <View className="flex-1 justify-center items-center bg-background">
      <MentraLogoStandalone width={100} height={48} />
    </View>
  )
}
