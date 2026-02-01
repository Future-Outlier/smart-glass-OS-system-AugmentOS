import {useVideoPlayer, VideoView} from "expo-video"
import {useEffect, useState} from "react"
import {StyleSheet, View, useColorScheme} from "react-native"

// Videos for light and dark themes
const LIGHT_VIDEO = require("@assets/splash/loading_animation_light.mp4")
const DARK_VIDEO = require("@assets/splash/loading_animation_dark.mp4")

interface SplashVideoProps {
  onFinished?: () => void
  loop?: boolean
}

export function SplashVideo({onFinished, loop = true}: SplashVideoProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const [isReady, setIsReady] = useState(false)

  // Select video based on theme
  const videoSource = isDark ? DARK_VIDEO : LIGHT_VIDEO

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = loop
    p.play()
    setIsReady(true)
  })

  useEffect(() => {
    if (!loop && onFinished) {
      const subscription = player.addListener("playToEnd", () => {
        onFinished()
      })
      return () => subscription.remove()
    }
  }, [player, loop, onFinished])

  // Background color based on theme to match the video
  const backgroundColor = isDark ? "#2D2C2F" : "#fffaf0"

  return (
    <View style={[styles.container, {backgroundColor}]}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: 150,
    height: 150,
  },
})
