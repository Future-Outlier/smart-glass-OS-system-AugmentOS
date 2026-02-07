import {useVideoPlayer, VideoView} from "expo-video"
import {useEffect, useState} from "react"
import {View, TouchableOpacity} from "react-native"

import {Icon} from "@/components/ignite"
import {useAppTheme} from "@/contexts/ThemeContext"

interface LoadingCoverVideoProps {
  videoUrl: string
  onClose?: () => void
}

export function LoadingCoverVideo({videoUrl, onClose}: LoadingCoverVideoProps) {
  const {theme} = useAppTheme()
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false
    player.muted = false
  })

  useEffect(() => {
    if (!player) return

    const statusSubscription = player.addListener("statusChange", (status) => {
      console.log("LoadingCoverVideo: status changed:", status)
      if (status === "readyToPlay") {
        setIsReady(true)
        player.play()
      } else if (status === "error") {
        console.log("LoadingCoverVideo: error loading video")
        setHasError(true)
      }
    })

    const endSubscription = player.addListener("playToEnd", () => {
      console.log("LoadingCoverVideo: video finished playing")
      setDismissed(true)
      onClose?.()
    })

    return () => {
      statusSubscription.remove()
      endSubscription.remove()
    }
  }, [player, onClose])

  const handleClose = () => {
    console.log("LoadingCoverVideo: user dismissed")
    setDismissed(true)
    onClose?.()
  }

  // If error or dismissed, render nothing
  if (hasError || dismissed) {
    return null
  }

  // If not ready yet, render nothing (preloading in background)
  if (!isReady) {
    return null
  }

  // Ready - show fullscreen video overlay
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "black",
        zIndex: 1000,
      }}>
      <VideoView player={player} style={{flex: 1}} contentFit="contain" nativeControls={false} />
      <TouchableOpacity style={{position: "absolute", top: 60, right: 20}} onPress={handleClose}>
        <View style={{borderRadius: 20, padding: 8, opacity: 0.8, backgroundColor: theme.colors.background}}>
          <Icon name="close" size={24} color={theme.colors.text} />
        </View>
      </TouchableOpacity>
    </View>
  )
}
