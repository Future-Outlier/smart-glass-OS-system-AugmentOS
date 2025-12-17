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
import {useAppTheme} from "@/contexts/ThemeContext"

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

// NOTE: you can't have 2 transition videos in a row or things will break:
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
  // {
  //   source: require("../../../../assets/onboarding/live/ONB5_action_button_record.mp4"),
  //   name: "Action Button Record",
  //   loop: true,
  //   transition: false,
  //   title: translate("onboarding:liveStartRecording"),
  //   subtitle: translate("onboarding:livePressAndHold"),
  //   info: translate("onboarding:liveLedFlashWarning"),
  // },
  // {
  //   source: require("../../../../assets/onboarding/live/ONB5_action_button_record.mp4"),
  //   name: "Action Button Stop Recording",
  //   loop: true,
  //   transition: false,
  //   title: translate("onboarding:liveStopRecording"),
  //   subtitle: translate("onboarding:livePressAndHoldAgain"),
  //   info: translate("onboarding:liveLedFlashWarning"),
  // },
  {
    source: require("../../../../assets/onboarding/live/ONB6_transition_trackpad.mp4"),
    name: "Transition Trackpad",
    loop: false,
    transition: true,
    // show next slide's title and subtitle:
    title: translate("onboarding:livePlayMusic"),
    subtitle: translate("onboarding:liveDoubleTapTouchpad"),
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
    title: translate("onboarding:livePauseMusic"),
    subtitle: translate("onboarding:liveDoubleTapTouchpad"),
  },
  {
    source: require("../../../../assets/onboarding/live/ONB10_cord.mp4"),
    name: "Cord",
    loop: true,
    transition: false,
    title: translate("onboarding:liveConnectCable"),
    subtitle: translate("onboarding:liveCableDescription"),
    info: translate("onboarding:liveCableInfo"),
  },
  {
    source: require("../../../../assets/onboarding/live/ONB11_end.mp4"),
    name: "End",
    loop: true,
    transition: false,
    subtitle: translate("onboarding:liveEndTitle"),
    subtitle2: translate("onboarding:liveEndMessage"),
  },
]

export default function Onboarding1() {
  const {goBack} = useNavigationHistory()
  const {theme} = useAppTheme()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNextButton, setShowNextButton] = useState(false)
  const [showReplayButton, setShowReplayButton] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const [transitionCount, setTransitionCount] = useState(0)
  const [uiIndex, setUiIndex] = useState(1)

  const player1: VideoPlayer = useVideoPlayer(videoFiles[0].source, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })
  const player2: VideoPlayer = useVideoPlayer(videoFiles[1].source, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })
  const [currentPlayer, setCurrentPlayer] = useState(player1)

  // don't count transition videos:
  const nonTransitionVideoFiles = videoFiles.filter(video => !video.transition)
  const counter = `${uiIndex} / ${nonTransitionVideoFiles.length}`
  const video = videoFiles[currentIndex]

  const handleNext = useCallback(
    (manual: boolean = false) => {
      console.log(`ONBOARD: handleNext(${manual})`)

      if (manual) {
        setUiIndex(uiIndex + 1)
      }

      if (currentIndex == videoFiles.length - 1) {
        console.log("last video")
        return
      }

      const nextIndex = currentIndex < videoFiles.length - 1 ? currentIndex + 1 : 0
      const nextNextIndex = nextIndex < videoFiles.length - 1 ? nextIndex + 1 : 0
      console.log(`ONBOARD: current: ${currentIndex} next: ${nextIndex}`)
      console.log(`ONBOARD: currentPlayer: ${currentPlayer == player1 ? "player1" : "player2"}`)

      setShowNextButton(false)
      setShowReplayButton(false)

      if (currentPlayer === player1) {
        setCurrentPlayer(player2)
        player2.play()
        player1.replace(videoFiles[nextNextIndex].source)
        player1.pause()
      } else if (currentPlayer === player2) {
        setCurrentPlayer(player1)
        player1.play()
        player2.replace(videoFiles[nextNextIndex].source)
        player2.pause()
      }

      if (videoFiles[nextIndex].transition) {
        setTransitionCount(transitionCount + 1)
      }

      setCurrentIndex(nextIndex)
      setPlayCount(0)

      console.log(`ONBOARD: current is now ${nextIndex}`)
    },
    [currentIndex, currentPlayer],
  )

  const handleBack = useCallback(() => {
    setUiIndex(uiIndex - 1)
    setPlayCount(0)
    // if (currentIndex === 1) {
    //   setHasStarted(false)
    //   return
    // }

    // if the previous index is a transition, we need to go back two indices
    let prevIndex = currentIndex - 1
    if (videoFiles[prevIndex].transition) {
      prevIndex = currentIndex - 2
    }
    setCurrentIndex(prevIndex)
    let prevPrevIndex = prevIndex - 1

    if (prevIndex < 0) {
      prevIndex = 0
    }
    if (prevPrevIndex < 0) {
      prevPrevIndex = 0
    }

    if (prevPrevIndex === 0 && prevIndex === 0) {
      console.log("going back to start")
      setHasStarted(false)
    }

    if (currentPlayer === player1) {
      setCurrentPlayer(player2)
      player2.replace(videoFiles[prevIndex].source)
      player1.replace(videoFiles[prevPrevIndex].source)
      // player1.replace(videoFiles[currentIndex - 1].source)
      // player1.pause()
    } else if (currentPlayer === player2) {
      setCurrentPlayer(player1)
      player1.replace(videoFiles[prevIndex].source)
      player2.replace(videoFiles[prevPrevIndex].source)
      player2.pause()
    }

  }, [uiIndex])

  // useEffect(() => {
  //   const subscription = currentPlayer.addListener("statusChange", (status: any) => {
  //     console.log("statusChange", status)
  //     if (currentIndex === 0) {
  //       // we don't auto play the first video
  //       return
  //     }
  //     if (status.status === "readyToPlay") {
  //       currentPlayer.play()
  //     }
  //   })

  //   return () => subscription.remove()
  // }, [currentPlayer])

  useEffect(() => {
    const subscription = currentPlayer.addListener("playingChange", (status: any) => {
      console.log("playingChange", status)
      if (!status.isPlaying && currentPlayer.currentTime >= currentPlayer.duration - 0.1) {
        if (video.transition) {
          handleNext()
          return
        }
        if (playCount < 1 && false) {// TODO:
          // Play again
          setPlayCount(prev => prev + 1)
          currentPlayer.currentTime = 0
          currentPlayer.play()
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
  }, [currentPlayer, video, handleNext, playCount])

  const handleReplay = useCallback(() => {
    setShowReplayButton(false)
    setPlayCount(0)
    currentPlayer.currentTime = 0
    currentPlayer.play()
  }, [currentPlayer])

  const handleStart = useCallback(() => {
    setHasStarted(true)
    currentPlayer.play()
  }, [currentPlayer])

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
              <View className="flex-row">
                <VideoView player={currentPlayer} style={{flex: 1, aspectRatio: 1}} nativeControls={false} />
                {/* <VideoView
                  player={player1}
                  style={{flex: 1, aspectRatio: 1, borderWidth: isPlayer1 ? 3 : 0, borderColor: "red"}}
                  nativeControls={false}
                />
                <VideoView
                  player={player2}
                  style={{flex: 1, aspectRatio: 1, borderWidth: !isPlayer1 ? 3 : 0, borderColor: "red"}}
                  nativeControls={false}
                /> */}
              </View>

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
                <View className="flex flex-row gap-2 justify-center items-center px-12">
                  <Icon name="info" size={20} color={theme.colors.muted_foreground} />
                  <Text
                    className="text-center text-sm font-medium text-muted-foreground"
                    text={video.info}
                    numberOfLines={2}
                  />
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
              <Button
                flexContainer
                tx="common:continue"
                onPress={() => {
                  handleNext(true)
                }}
              />
            </View>
          )}
          {hasStarted && <Button flexContainer className="mt-8" preset="secondary" text="Back" onPress={handleBack} />}
        </View>
      </View>
    </Screen>
  )
}
