import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useVideoPlayer, VideoView, VideoSource} from "expo-video"
import {useState, useCallback, useEffect} from "react"
import {Text, TouchableOpacity, View} from "react-native"

const videoFiles = [
  // require("./start.mp4"),
  // require("../../../../assets/onboarding/live/ONB1_StartOnboarding.mp4"),
  // require("@/assets/onboarding/live/ONB1_PowerButton.mp4"),
  // require("@/assets/onboarding/live/ONB2_Pairing Successful.mp4"),
  // require("@/assets/onboarding/live/ONB4_ActionButtonClick.mp4"),
  // require("@/assets/onboarding/live/ONB5_ActionButtonRecord.mp4"),
  // require("@/assets/onboarding/live/ONB6_TransitionTrackpad.mp4"),
  // require("@/assets/onboarding/live/ONB7_TrackpadTap.mp4"),
  // require("@/assets/onboarding/live/ONB8_TransitionTrackpad2.mp4"),
  // require("@/assets/onboarding/live/ONB8_TrackpadSlide.mp4"),
  // require("@/assets/onboarding/live/ONB9_TrackpadPause.mp4"),
  // require("@/assets/onboarding/live/ONB10_Cord.mp4"),
  // require("@/assets/onboarding/live/ONB11_End.mp4"),
] as const

export default function Onboarding1() {
  const {goBack} = useNavigationHistory()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNextButton, setShowNextButton] = useState(false)

  const player = useVideoPlayer(videoFiles[currentIndex] as VideoSource, (player: any) => {
    player.play()
  })

  useEffect(() => {
    const subscription = player.addListener("playingChange", (status: any) => {
      if (!status.isPlaying && player.currentTime >= player.duration - 0.1) {
        setShowNextButton(true)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [player])

  const handleNext = useCallback(() => {
    if (currentIndex < videoFiles.length - 1) {
      setShowNextButton(false)
      setCurrentIndex(currentIndex + 1)
      player.replace(videoFiles[currentIndex + 1] as VideoSource)
      player.play()
    }
  }, [currentIndex, player])

  return (
    <Screen preset="fixed">
      <Header
        title="Onboarding"
        leftIcon="x"
        RightActionComponent={<MentraLogoStandalone />}
        onLeftPress={() => goBack()}
      />
      <View className="flex-1 items-center justify-center px-12">
        <VideoView player={player} className="w-full aspect-video mb-5" nativeControls={false} />
        {showNextButton && currentIndex < videoFiles.length - 1 && (
          <TouchableOpacity className="bg-blue-600 rounded px-6 py-3" onPress={handleNext}>
            <Text className="text-white font-bold text-sm text-center">Next Video</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  )
}
