import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Button, Header, Icon, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useVideoPlayer, VideoView, VideoSource, VideoPlayer} from "expo-video"
import {useState, useCallback, useEffect} from "react"
import {View} from "react-native"
import {Text} from "@/components/ignite"
import Toast from "react-native-toast-message"
import {translate} from "@/i18n"
import {Spacer} from "@/components/ui"

interface OnboardingVideo {
  source: VideoSource
  loop: boolean
  name: string
  transition: boolean
  title?: string
  subtitle?: string
  subtitle2?: string
  info?: string
}

const videoFiles: OnboardingVideo[] = [
  {
    source: require("../../../../assets/onboarding/live/ONB0_start_onboarding.mp4"),
    name: "Start Onboarding",
    loop: false,
    transition: true,
    // title: "Welcome to Mentra Live",
    // info: "Learn the basics",
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
    title: translate("onboarding:liveTakeAPhoto"),
    subtitle: translate("onboarding:livePressActionButton"),
    info: translate("onboarding:liveLedFlashWarning"),
  },
  {
    source: require("../../../../assets/onboarding/live/ONB5_action_button_record.mp4"),
    name: "Action Button Record",
    loop: true,
    transition: false,
    title: translate("onboarding:liveStartRecording"),
    subtitle: translate("onboarding:livePressAndHold"),
    info: translate("onboarding:liveLedFlashWarning"),
  },
  {
    source: require("../../../../assets/onboarding/live/ONB5_action_button_record.mp4"),
    name: "Action Button Stop Recording",
    loop: true,
    transition: false,
    title: translate("onboarding:liveStopRecording"),
    subtitle: translate("onboarding:livePressAndHoldAgain"),
    info: translate("onboarding:liveLedFlashWarning"),
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
    title: translate("onboarding:livePlayMusic"),
    subtitle: translate("onboarding:liveDoubleTapTouchpad"),
  },
  // {
  //   source: require("../../../../assets/onboarding/live/ONB8_transition_trackpad2.mp4"),
  //   name: "Transition Trackpad 2",
  //   loop: false,
  //   transition: true,
  // },
  {
    source: require("../../../../assets/onboarding/live/ONB8_trackpad_slide.mp4"),
    name: "Trackpad Volume Slide",
    loop: true,
    transition: false,
    title: translate("onboarding:liveAdjustVolume"),
    subtitle: translate("onboarding:liveSwipeTouchpadUp"),
    subtitle2: translate("onboarding:liveSwipeTouchpadDown"),
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
  const [secondaryIndex, setSecondaryIndex] = useState(1)
  const [showNextButton, setShowNextButton] = useState(false)
  const [showReplayButton, setShowReplayButton] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [playCount, setPlayCount] = useState(0)

  const player: VideoPlayer = useVideoPlayer(videoFiles[currentIndex].source, (player: any) => {
    player.loop = false
  })
  const player2: VideoPlayer = useVideoPlayer(videoFiles[secondaryIndex].source, (player2: any) => {
    player2.loop = false
  })
  const [currentPlayer, setCurrentPlayer] = useState(player)

  const counter = `${currentIndex + 1} / ${videoFiles.length}`
  const video = videoFiles[currentIndex]

  const handleNext = useCallback(() => {
    const nextIndex = currentIndex < videoFiles.length - 1 ? currentIndex + 1 : 0
    setShowNextButton(false)
    setShowReplayButton(false)

    // special case for when the video files are the same:
    if (videoFiles[nextIndex].source == videoFiles[currentIndex].source) {
      // we didn't change the video, so we need to reset the current time
      player.currentTime = 0
      player.play()
      setCurrentIndex(nextIndex)
      setPlayCount(0)
      return
    }

    setCurrentIndex(nextIndex)
    setPlayCount(0)
    player.replace(videoFiles[nextIndex].source)
  }, [currentIndex, player])

  useEffect(() => {
    const subscription = player.addListener("statusChange", (status: any) => {
      console.log("statusChange", status)
      if (currentIndex === 0) {
        // we don't auto play the first video
        return
      }
      if (status.status === "readyToPlay") {
        player.play()
      }
    })

    return () => subscription.remove()
  }, [player])

  useEffect(() => {
    const subscription = player.addListener("playingChange", (status: any) => {
      console.log("playingChange", status)
      if (!status.isPlaying && player.currentTime >= player.duration - 0.1) {
        if (video.transition) {
          handleNext()
          return
        }
        if (playCount < 1) {
          // Play again
          setPlayCount(prev => prev + 1)
          player.currentTime = 0
          player.play()
        } else {
          // Played twice, now stop
          setShowReplayButton(true)
          setShowNextButton(true)
        }
      }
    })

    return () => {
      subscription.remove()
    }
  }, [player, video, handleNext, playCount])

  const handleReplay = useCallback(() => {
    setShowReplayButton(false)
    setPlayCount(0)
    player.currentTime = 0
    player.play()
  }, [player])

  const handleStart = useCallback(() => {
    setHasStarted(true)
    player.play()
  }, [player])

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <Header
        leftIcon="x"
        RightActionComponent={
          <View className="flex flex-row gap-2">
            {hasStarted && <Text className="text-center text-sm font-medium" text={counter} />}
            <MentraLogoStandalone />
          </View>
        }
        onLeftPress={() => goBack()}
      />
      <View id="main" className="flex flex-1">
        <View id="top" className="flex">
          {hasStarted && (
            <View className="flex">
              {video.title ? (
                <Text className="text-center text-2xl font-semibold" text={video.title} />
              ) : (
                <Text className="text-center text-2xl font-semibold" text="" />
              )}
            </View>
          )}

          <View className="-mx-6">
            <View className="relative">
              <VideoView player={currentPlayer} style={{width: "100%", aspectRatio: 1}} nativeControls={false} />
              

              {showReplayButton && (
                <View className="absolute bottom-8 left-0 right-0 items-center">
                  <Button preset="secondary" className="min-w-24" tx="onboarding:replay" onPress={handleReplay} />
                </View>
              )}
            </View>
          </View>

          {hasStarted && (
            <View className="flex flex-col gap-2 mt-4">
              {video.subtitle && <Text className="text-center text-xl font-semibold" text={video.subtitle} />}
              {video.subtitle2 && <Text className="text-center text-xl font-semibold" text={video.subtitle2} />}
              {video.info && (
                <View className="flex flex-row gap-2">
                  <Icon name="info" size={20} color="muted-foreground" />
                  <Text className="text-center text-sm font-medium text-muted-foreground" text={video.info} />
                </View>
              )}
            </View>
          )}
        </View>

        <View id="bottom" className="flex justify-end flex-grow">
          {/* <Button flexContainer preset="secondary" text="Replay" onPress={handleReplay} /> */}

          {!hasStarted && (
            <View className="flex flex-col gap-2">
              <Text className="text-center text-xl font-semibold" text="Welcome to Mentra Live" />
              <Text className="text-center text-sm font-medium" text="Learn the basics" />
            </View>
          )}

          {!hasStarted && (
            <View className="flex flex-col gap-4 mt-8">
              <Button flexContainer tx="onboarding:continueOnboarding" onPress={handleStart} />
              <Button
                flexContainer
                preset="secondary"
                tx="common:skip"
                onPress={() => {
                  Toast.show({
                    type: "info",
                    text1: "TODO",
                  })
                }}
              />
            </View>
          )}

          {hasStarted && showNextButton && (
            <View className="flex flex-col gap-2">
              <Button flexContainer tx="common:continue" onPress={handleNext} />
            </View>
          )}

          <Button
            flexContainer
            className="mt-8"
            preset="secondary"
            text="Play"
            onPress={() => {
              player.play()
            }}
          />
        </View>
      </View>
    </Screen>
  )
}
