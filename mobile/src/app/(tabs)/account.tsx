import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Button, Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useVideoPlayer, VideoView, VideoSource} from "expo-video"
import {useState, useCallback, useEffect} from "react"
import {Text, TouchableOpacity, View} from "react-native"

const videoFiles = [
  require("../../../assets/onboarding/live/ONB1_StartOnboarding.mp4"),
  require("../../../assets/onboarding/live/ONB1_PowerButton.mp4"),
  require("../../../assets/onboarding/live/ONB2_Pairing Successful.mp4"),
  require("../../../assets/onboarding/live/ONB4_ActionButtonClick.mp4"),
  require("../../../assets/onboarding/live/ONB5_ActionButtonRecord.mp4"),
  require("../../../assets/onboarding/live/ONB6_TransitionTrackpad.mp4"),
  require("../../../assets/onboarding/live/ONB7_TrackpadTap.mp4"),
  require("../../../assets/onboarding/live/ONB8_TransitionTrackpad2.mp4"),
  require("../../../assets/onboarding/live/ONB8_TrackpadSlide.mp4"),
  require("../../../assets/onboarding/live/ONB9_TrackpadPause.mp4"),
  require("../../../assets/onboarding/live/ONB10_Cord.mp4"),
  require("../../../assets/onboarding/live/ONB11_End.mp4"),
]

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
      {/* <View className="flex justify-center items-center px-12 h-full"> */}
        <VideoView player={player} style={{width: "100%", height: "100%"}} nativeControls={false} />
        {showNextButton && currentIndex < videoFiles.length - 1 && <Button text="Next Video" onPress={handleNext} />}
      {/* </View> */}
    </Screen>
  )
}
