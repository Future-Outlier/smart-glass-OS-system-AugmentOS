import {StyleSheet, View} from "react-native"
import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {useAppTheme} from "@/contexts/ThemeContext"

// TODO: Replace with animated SVG from designer
// Videos for light and dark themes (keeping for future use)
// const LIGHT_VIDEO = require("@assets/splash/loading_animation_light.mp4")
// const DARK_VIDEO = require("@assets/splash/loading_animation_dark.mp4")

interface SplashVideoProps {
  onFinished?: () => void
  loop?: boolean
}

export function SplashVideo({onFinished, loop = true}: SplashVideoProps) {
  const {theme} = useAppTheme()

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <MentraLogoStandalone width={100} height={48} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
})
