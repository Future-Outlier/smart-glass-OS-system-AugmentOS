import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Button, Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useVideoPlayer, VideoView, VideoSource, VideoPlayer} from "expo-video"
import {useState, useCallback, useEffect} from "react"
import {View} from "react-native"
import {Text} from "@/components/ignite"

interface OnboardingVideo {
  source: VideoSource
  loop: boolean
  name: string
  transition: boolean
}

const videoFiles: OnboardingVideo[] = [
  {
    source: require("../../../../assets/onboarding/live/ONB0_start_onboarding.mp4"),
    name: "Start Onboarding",
    loop: false,
    transition: false,
  },
  // {
  //   source: require("../../../../assets/onboarding/live/ONB1_power_button.mp4"),
  //   name: "Power Button",
  //   loop: true,
  //   transition: false,
  // },
  // {
  //   source: require("../../../../assets/onboarding/live/ONB2_pairing_successful.mp4"),
  //   name: "Pairing Successful",
  //   loop: false,
  //   transition: false,
  // },
  {
    source: require("../../../../assets/onboarding/live/ONB4_action_button_click.mp4"),
    name: "Action Button Click",
    loop: true,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB5_action_button_record.mp4"),
    name: "Action Button Record",
    loop: true,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB6_transition_trackpad.mp4"),
    name: "Transition Trackpad",
    loop: false,
    transition: true,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB7_trackpad_tap.mp4"),
    name: "Trackpad Tap",
    loop: true,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB8_transition_trackpad2.mp4"),
    name: "Transition Trackpad 2",
    loop: false,
    transition: true,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB8_trackpad_slide.mp4"),
    name: "Trackpad Slide",
    loop: true,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB9_trackpad_pause.mp4"),
    name: "Trackpad Pause",
    loop: false,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB10_cord.mp4"),
    name: "Cord",
    loop: true,
    transition: false,
  },
  {
    source: require("../../../../assets/onboarding/live/ONB11_end.mp4"),
    name: "End",
    loop: true,
    transition: false,
  },
]

export default function Onboarding1() {
  const {goBack} = useNavigationHistory()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNextButton, setShowNextButton] = useState(false)

  const player: VideoPlayer = useVideoPlayer(videoFiles[currentIndex].source, (player: any) => {
    player.loop = videoFiles[currentIndex].loop
    player.play()
  })

  // useFocusEffect(
  //   useCallback(() => {
  //     player.play()
  //   }, [player]),
  // )

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
    const nextIndex = currentIndex < videoFiles.length - 1 ? currentIndex + 1 : 0
    setShowNextButton(false)
    setCurrentIndex(nextIndex)
    // player.loop = videoFiles[nextIndex].loop
    player.loop = false
    player.replace(videoFiles[nextIndex].source)
    player.play()
  }, [currentIndex, player])

  const handleReplay = useCallback(() => {
    player.currentTime = 0
    player.play()
  }, [player])

  return (
    <Screen preset="fixed">
      <Header
        title="Onboarding"
        leftIcon="x"
        RightActionComponent={<MentraLogoStandalone />}
        onLeftPress={() => goBack()}
      />
      <View className="flex h-full gap-8">
        <View className="-mx-6">
          <VideoView player={player} style={{width: "100%", aspectRatio: 1}} nativeControls={false} />
        </View>
        {/* {showNextButton ? (
          <Button flexContainer text="Next Video" onPress={handleNext} />
        ) : (
          <Button flexContainer text="Skip" style={{opacity: 0}} onPress={handleNext} />
        )} */}

        <Button flexContainer preset="secondary" text="Replay" onPress={handleReplay} />

        <View className="flex flex-col gap-2">
          <Text className="text-center text-md text-gray-500" text="Welcome to Mentra Live" />
          <Text className="text-center text-sm text-gray-500" text="Learn the basics" />
        </View>

        <View className="flex flex-col gap-2">
          <Button flexContainer tx="onboarding:continueOnboarding" onPress={handleNext} />
          <Button flexContainer preset="secondary" tx="common:skip" onPress={handleNext} />
        </View>

        {/* <Text className="text-center text-sm text-gray-500">
          Video {currentIndex + 1} of {videoFiles.length}
        </Text>
        <Text className="text-center text-sm text-gray-500">{videoFiles[currentIndex]?.name || "Unknown"}</Text> */}
      </View>
    </Screen>
  )
}
