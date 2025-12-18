import {useVideoPlayer, VideoView, VideoSource, VideoPlayer} from "expo-video"
import {useState, useCallback, useEffect} from "react"
import {View} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Text} from "@/components/ignite"
import {Button, Header, Icon} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"

export interface OnboardingStep {
  source: VideoSource
//   loop: boolean
  playCount: number
  name: string
  transition: boolean
  title?: string
  subtitle?: string
  subtitle2?: string
  info?: string
  bullets?: string[]
}

interface OnboardingGuideProps {
  steps: OnboardingStep[]
  showSkipButton?: boolean
  autoStart?: boolean
}

export function OnboardingGuide({steps, showSkipButton = true, autoStart = false}: OnboardingGuideProps) {
  const {clearHistoryAndGoHome} = useNavigationHistory()
  const {theme} = useAppTheme()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNextButton, setShowNextButton] = useState(false)
  const [showReplayButton, setShowReplayButton] = useState(false)
  const [hasStarted, setHasStarted] = useState(autoStart)
  const [playCount, setPlayCount] = useState(0)
  const [transitionCount, setTransitionCount] = useState(0)
  const [uiIndex, setUiIndex] = useState(1)

  const player1: VideoPlayer = useVideoPlayer(steps[0].source, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })
  const player2: VideoPlayer = useVideoPlayer(steps[1].source, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })
  const [currentPlayer, setCurrentPlayer] = useState(player1)

  // don't count transition videos:
  const nonTransitionVideoFiles = steps.filter(step => !step.transition)
  const counter = `${uiIndex} / ${nonTransitionVideoFiles.length}`
  const video = steps[currentIndex]
  const isPlayer1 = currentPlayer == player1

  const handleNext = useCallback(
    (manual: boolean = false) => {
      console.log(`ONBOARD: handleNext(${manual})`)

      if (currentIndex == steps.length - 1) {
        // go back to home screen
        clearHistoryAndGoHome()
        return
      }

      if (manual) {
        setUiIndex(uiIndex + 1)
      }

      const nextIndex = currentIndex < steps.length - 1 ? currentIndex + 1 : 0
      const nextNextIndex = nextIndex < steps.length - 1 ? nextIndex + 1 : 0
      console.log(`ONBOARD: current: ${currentIndex} next: ${nextIndex}`)
      console.log(`ONBOARD: currentPlayer: ${currentPlayer == player1 ? "player1" : "player2"}`)

      setShowNextButton(false)
      setShowReplayButton(false)

      if (currentPlayer === player1) {
        setCurrentPlayer(player2)
        player2.play()
        player1.replace(steps[nextNextIndex].source)
        player1.pause()
      } else if (currentPlayer === player2) {
        setCurrentPlayer(player1)
        player1.play()
        player2.replace(steps[nextNextIndex].source)
        player2.pause()
      }

      if (steps[nextIndex].transition) {
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

    // the start is a special case:
    if (currentIndex === 0 || currentIndex === 1) {
      setHasStarted(false)
      setCurrentIndex(0)
      setCurrentPlayer(player1)
      setShowReplayButton(false)
      setShowNextButton(false)
      setUiIndex(1)
      player1.replace(steps[0].source)
      player1.currentTime = 0
      player1.pause()
      player2.replace(steps[1].source)
      player2.currentTime = 0
      player2.pause()
      return
    }

    // if the previous index is a transition, we need to go back two indices
    let prevIndex = currentIndex - 1
    let doubleBack = false
    if (steps[prevIndex].transition) {
      prevIndex = currentIndex - 2
      doubleBack = true
    }

    if (prevIndex < 0) {
      prevIndex = 0
    }
    let newCurrent = prevIndex + 1

    setCurrentIndex(prevIndex)
    setShowReplayButton(true)
    setShowNextButton(true)

    // if (prevIndex === 0) {
    //   console.log(`ONBOARD: going back to start`)
    //   setHasStarted(false)
    // }

    if (doubleBack) {
      if (currentPlayer === player1) {
        player1.replace(steps[prevIndex].source)
        player2.replace(steps[newCurrent].source)
        player1.pause()
      } else if (currentPlayer === player2) {
        player2.replace(steps[prevIndex].source)
        player1.replace(steps[newCurrent].source)
        player2.pause()
      }
      return
    }

    if (currentPlayer === player1) {
      setCurrentPlayer(player2)
      player2.replace(steps[prevIndex].source)
      player1.replace(steps[newCurrent].source)
      player2.pause()
    } else if (currentPlayer === player2) {
      setCurrentPlayer(player1)
      player1.replace(steps[prevIndex].source)
      player2.replace(steps[newCurrent].source)
      player1.pause()
    }
  }, [uiIndex])

  useEffect(() => {
    const subscription = currentPlayer.addListener("statusChange", (status: any) => {
      console.log("statusChange", status)
      if (currentIndex === 0 && !autoStart) {
        // we don't auto play the first video
        return
      }
      // console.log(`ONBOARD: auto playing@@@@@@@@@@@@@@@@@@@@@@@`)
      if (status.status === "readyToPlay") {
        currentPlayer.play()
      }
    })

    return () => subscription.remove()
  }, [currentPlayer])

  useEffect(() => {
    const subscription = currentPlayer.addListener("playingChange", (status: any) => {
      if (!status.isPlaying && currentPlayer.currentTime >= currentPlayer.duration - 0.1) {
        if (video.transition) {
          handleNext()
          return
        }
        if (playCount < (video.playCount - 1)) {
          setShowNextButton(true)
          setPlayCount(prev => prev + 1)
          currentPlayer.currentTime = 0
          currentPlayer.play()
        } else {
          // Played the last time, now stop
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


  const renderBullets = useCallback((bullets: string[]) => {
    return (
      <View className="flex flex-col gap-2 flex-1 px-2">
        <Text className="text-center text-xl self-start font-semibold" text={bullets[0]} />
        {bullets.slice(1).map((bullet, index) => (
          <View key={index} className="flex-row items-start gap-2 px-4">
            <Text className="text-sm font-medium">•</Text>
            <Text className="flex-1 text-sm font-medium" text={bullet} />
          </View>
        ))}
      </View>
    )
  }, [])

  return (
    <>
      <Header
        leftIcon="x"
        RightActionComponent={
          <View className="flex flex-row gap-2">
            {hasStarted && <Text className="text-center text-sm font-medium" text={counter} />}
            <MentraLogoStandalone />
          </View>
        }
        onLeftPress={() => clearHistoryAndGoHome()}
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
              <View className="relative" style={{width: "100%", aspectRatio: 1}}>
                <VideoView
                  player={player1}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: isPlayer1 ? 1 : 0,
                    // borderColor: theme.colors.chart_2,
                    // borderWidth: 3,
                    // borderRadius: 10,
                  }}
                  nativeControls={false}
                />
                <VideoView
                  player={player2}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: isPlayer1 ? 0 : 1,
                    // borderColor: theme.colors.chart_4,
                    // borderWidth: 3,
                    // borderRadius: 10,
                  }}
                  nativeControls={false}
                />
              </View>

              {showReplayButton && (
                <View className="absolute bottom-8 left-0 right-0 items-center z-10">
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

          {video.bullets && (renderBullets(video.bullets))}

          {!hasStarted && (
            <View className="flex flex-col gap-4 mt-8">
              <Button flexContainer tx="onboarding:continueOnboarding" onPress={handleStart} />
              <Button flexContainer preset="secondary" tx="common:skip" onPress={clearHistoryAndGoHome} />
            </View>
          )}

          {hasStarted && showNextButton && (
            <View className="flex flex-col gap-4">
              <Button
                flexContainer
                tx="common:continue"
                onPress={() => {
                  handleNext(true)
                }}
              />
              <Button flexContainer preset="secondary" text="Back" onPress={handleBack} />
            </View>
          )}
        </View>
      </View>
    </>
  )
}
