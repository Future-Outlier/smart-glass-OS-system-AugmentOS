import {Image, ImageSource} from "expo-image"
import {useVideoPlayer, VideoView, VideoSource, VideoPlayer} from "expo-video"
import {useState, useCallback, useEffect, useMemo, useRef} from "react"
import {View, ViewStyle, ActivityIndicator} from "react-native"

import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Text, Button, Header, Icon} from "@/components/ignite"
import {focusEffectPreventBack, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"

interface BaseStep {
  name: string
  transition: boolean
  title?: string
  subtitle?: string
  subtitle2?: string
  info?: string
  bullets?: string[]
}

interface VideoStep extends BaseStep {
  type: "video"
  source: VideoSource
  /** Optional poster/thumbnail image shown while video loads */
  poster?: ImageSource
  playCount: number
  containerStyle?: ViewStyle
  containerClassName?: string
}

interface ImageStep extends BaseStep {
  type: "image"
  source: ImageSource
  containerStyle?: ViewStyle
  containerClassName?: string
  //   imageComponent: React.ComponentType
  duration?: number // ms before showing next button, undefined = immediate
}

export type OnboardingStep = VideoStep | ImageStep

interface OnboardingGuideProps {
  steps: OnboardingStep[]
  showSkipButton?: boolean
  autoStart?: boolean
  mainTitle?: string
  mainSubtitle?: string
  endButtonText?: string
  endButtonFn?: () => void
  exitFn?: () => void
}

// Find next video step's source for preloading
const findNextVideoSource = (steps: OnboardingStep[], fromIndex: number): VideoSource | null => {
  for (let i = fromIndex; i < steps.length; i++) {
    if (steps[i].type === "video") {
      return steps[i].source
    }
  }
  return null
}

export function OnboardingGuide({
  steps,
  showSkipButton = true,
  autoStart = false,
  mainTitle,
  mainSubtitle,
  endButtonText = "Done",
  endButtonFn,
  exitFn,
}: OnboardingGuideProps) {
  const {clearHistoryAndGoHome} = useNavigationHistory()
  const {theme} = useAppTheme()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNextButton, setShowNextButton] = useState(false)
  const [showReplayButton, setShowReplayButton] = useState(false)
  const [hasStarted, setHasStarted] = useState(autoStart)
  const [playCount, setPlayCount] = useState(0)
  const [transitionCount, setTransitionCount] = useState(0)
  const [uiIndex, setUiIndex] = useState(1)
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1)
  // const [isVideoLoading, setIsVideoLoading] = useState(true)
  // const [showPoster, setShowPoster] = useState(true)
  const [player1Loading, setPlayer1Loading] = useState(true)
  const [player2Loading, setPlayer2Loading] = useState(true)
  const [showPoster, setShowPoster] = useState(false)
  focusEffectPreventBack()

  // Initialize players with first video sources found
  const initialSource1 = useMemo(() => findNextVideoSource(steps, 0), [steps])
  const initialSource2 = useMemo(() => findNextVideoSource(steps, 1), [steps])

  const player1: VideoPlayer = useVideoPlayer(initialSource1, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })
  const player2: VideoPlayer = useVideoPlayer(initialSource2, (player: any) => {
    player.loop = false
    player.audioMixingMode = "mixWithOthers"
  })

  const currentPlayer = activePlayer === 1 ? player1 : player2

  const nonTransitionVideoFiles = steps.filter((step) => !step.transition)
  const counter = `${uiIndex} / ${nonTransitionVideoFiles.length}`
  const step = steps[currentIndex]
  const isCurrentStepImage = step.type === "image"
  const isCurrentStepVideo = step.type === "video"

  // Handle image step timing
  useEffect(() => {
    if (!hasStarted || !isCurrentStepImage) return

    if (step.transition) {
      // Auto-advance transition images
      const timer = setTimeout(() => {
        handleNext(false)
      }, step.duration ?? 500)
      return () => clearTimeout(timer)
    }

    if (step.duration) {
      const timer = setTimeout(() => {
        setShowNextButton(true)
      }, step.duration)
      return () => clearTimeout(timer)
    } else {
      setShowNextButton(true)
    }
    return () => {}
  }, [currentIndex, hasStarted, isCurrentStepImage])

  const handleExit = useCallback(() => {
    if (exitFn) {
      exitFn()
    } else {
      clearHistoryAndGoHome()
    }
  }, [exitFn, clearHistoryAndGoHome])

  useEffect(() => {
    if (player1Loading && activePlayer === 1) {
      setShowPoster(true)
    } else if (player2Loading && activePlayer === 2) {
      setShowPoster(true)
    } else {
      setShowPoster(false)
    }
  }, [player1Loading, player2Loading, activePlayer])

  const handleNext = useCallback(
    (manual: boolean = false) => {
      console.log(`ONBOARD: handleNext(${manual})`)

      if (currentIndex === steps.length - 1) {
        handleExit()
        return
      }

      if (manual) {
        setUiIndex(uiIndex + 1)
      }

      const nextIndex = currentIndex < steps.length - 1 ? currentIndex + 1 : 0
      const nextStep = steps[nextIndex]

      console.log(`ONBOARD: current: ${currentIndex} next: ${nextIndex}`)

      setShowNextButton(false)
      setShowReplayButton(false)
      setCurrentIndex(nextIndex)
      setPlayCount(0)

      if (nextStep.transition) {
        setTransitionCount(transitionCount + 1)
      }

      // If next step is an image, just pause current player and preload next video
      if (nextStep.type === "image") {
        player1.pause()
        player2.pause()

        // Preload next video source into inactive player
        const nextVideoSource = findNextVideoSource(steps, nextIndex + 1)
        if (nextVideoSource) {
          if (activePlayer === 1) {
            player2.replace(nextVideoSource)
            setPlayer2Loading(true)
          } else {
            player1.replace(nextVideoSource)
            setPlayer1Loading(true)
          }
        }
        return
      }

      // Next step is a video - handle player swapping
      const nextNextVideoSource = findNextVideoSource(steps, nextIndex + 1)

      if (activePlayer === 1) {
        setActivePlayer(2)
        player2.replace(nextStep.source)
        player2.play()
        if (nextNextVideoSource) {
          player1.replace(nextNextVideoSource)
          setPlayer1Loading(true)
        }
        player1.pause()
      } else {
        setActivePlayer(1)
        player1.replace(nextStep.source)
        player1.play()
        if (nextNextVideoSource) {
          player2.replace(nextNextVideoSource)
          setPlayer2Loading(true)
        }
        player2.pause()
      }

      console.log(`ONBOARD: current is now ${nextIndex}`)
    },
    [currentIndex, activePlayer, uiIndex, steps, transitionCount, clearHistoryAndGoHome],
  )

  const handleBack = useCallback(() => {
    setUiIndex(uiIndex - 1)
    setPlayCount(0)

    // The start is a special case
    if (currentIndex === 0 || currentIndex === 1) {
      setHasStarted(false)
      setCurrentIndex(0)
      setActivePlayer(1)
      setShowReplayButton(false)
      setShowNextButton(false)
      setUiIndex(1)

      const firstVideoSource = findNextVideoSource(steps, 0)
      const secondVideoSource = findNextVideoSource(steps, 1)

      if (firstVideoSource) {
        player1.replace(firstVideoSource)
        player1.currentTime = 0
        player1.pause()
      }
      if (secondVideoSource) {
        player2.replace(secondVideoSource)
        player2.currentTime = 0
        player2.pause()
      }
      return
    }

    // If the previous index is a transition, go back two indices
    let prevIndex = currentIndex - 1
    let doubleBack = false
    if (steps[prevIndex].transition) {
      prevIndex = currentIndex - 2
      doubleBack = true
    }

    if (prevIndex < 0) {
      prevIndex = 0
    }

    const prevStep = steps[prevIndex]
    setCurrentIndex(prevIndex)
    setShowReplayButton(prevStep.type === "video")
    setShowNextButton(true)

    // If going back to an image, just pause players
    if (prevStep.type === "image") {
      player1.pause()
      player2.pause()
      return
    }

    // Going back to a video
    const nextVideoSource = findNextVideoSource(steps, prevIndex + 1)

    if (doubleBack) {
      if (activePlayer === 1) {
        player1.replace(prevStep.source)
        if (nextVideoSource) player2.replace(nextVideoSource)
        player1.pause()
      } else {
        player2.replace(prevStep.source)
        if (nextVideoSource) player1.replace(nextVideoSource)
        player2.pause()
      }
      return
    }

    if (activePlayer === 1) {
      setActivePlayer(2)
      player2.replace(prevStep.source)
      if (nextVideoSource) player1.replace(nextVideoSource)
      player2.pause()
    } else {
      setActivePlayer(1)
      player1.replace(prevStep.source)
      if (nextVideoSource) player2.replace(nextVideoSource)
      player1.pause()
    }
  }, [currentIndex, uiIndex, activePlayer, steps])

  // Video status change listener
  useEffect(() => {
    if (isCurrentStepImage) return

    const subscription = currentPlayer.addListener("statusChange", (status: any) => {
      console.log("ONBOARD: statusChange", status)

      if (currentIndex === 0 && !autoStart) {
        return
      }
      if (status.status === "readyToPlay") {
        currentPlayer.play()
      }
    })

    return () => subscription.remove()
  }, [currentPlayer, currentIndex, autoStart, isCurrentStepImage])

  useEffect(() => {
    const sub1 = player1.addListener("sourceLoad", (status: any) => {
      // console.log("ONBOARD: player1 statusChange", status)
      setPlayer1Loading(false)
    })

    const sub2 = player2.addListener("sourceLoad", (status: any) => {
      // console.log("ONBOARD: player2 statusChange", status)
      setPlayer2Loading(false)
    })

    return () => {
      sub1.remove()
      sub2.remove()
    }
  }, [player1])

  // Video playing change listener
  useEffect(() => {
    if (isCurrentStepImage) return

    const subscription = currentPlayer.addListener("playingChange", (status: any) => {
      if (!status.isPlaying && currentPlayer.currentTime >= currentPlayer.duration - 0.1) {
        if (step.transition) {
          handleNext(false)
          return
        }
        if (step.type === "video" && playCount < step.playCount - 1) {
          setShowNextButton(true)
          setPlayCount((prev) => prev + 1)
          currentPlayer.currentTime = 0
          currentPlayer.play()
        } else {
          setShowReplayButton(true)
          setShowNextButton(true)
        }
      }
    })

    return () => subscription.remove()
  }, [currentPlayer, step, handleNext, playCount, isCurrentStepImage])

  const handleReplay = useCallback(() => {
    if (isCurrentStepVideo) {
      setShowReplayButton(false)
      setPlayCount(0)
      currentPlayer.currentTime = 0
      currentPlayer.play()
    }
  }, [currentPlayer, isCurrentStepVideo])

  const handleStart = useCallback(() => {
    setHasStarted(true)
    if (isCurrentStepVideo) {
      currentPlayer.play()
    }
  }, [currentPlayer, isCurrentStepVideo])

  const handleSkip = useCallback(() => {
    if (exitFn) {
      exitFn()
    } else {
      clearHistoryAndGoHome()
    }
  }, [exitFn, clearHistoryAndGoHome])

  const renderBullets = useCallback((bullets: string[]) => {
    return (
      <View className="flex flex-col gap-2 flex-1 px-2 mt-6">
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

  const isLastStep = currentIndex === steps.length - 1
  const isFirstStep = currentIndex === 0

  const renderComposedVideo = () => {
    let s = step as VideoStep
    return (
      <>
        <View
          className={`absolute top-0 left-0 right-0 bottom-0 z-${activePlayer === 1 ? 1 : 0} ${s.containerClassName}`}>
          <VideoView
            player={player1}
            style={{
              width: "100%",
              height: "100%",
            }}
            nativeControls={false}
            onFirstFrameRender={() => {}}
          />
        </View>
        <View
          className={`absolute top-0 left-0 right-0 bottom-0 z-${activePlayer === 1 ? 0 : 1} ${s.containerClassName}`}>
          <VideoView
            player={player2}
            style={{
              width: "100%",
              height: "100%",
            }}
            nativeControls={false}
            onFirstFrameRender={() => {}}
          />
        </View>
        {/* Poster image overlay - shown until a video is loaded on a slow connection: */}
        {s.poster && showPoster && (
          <View className="absolute top-0 left-0 right-0 bottom-0 z-10">
            <Image source={s.poster} style={{width: "100%", height: "100%"}} contentFit="contain" />
          </View>
        )}
        {/* no poster, but still loading - show a loading indicator: */}
        {showPoster && !s.poster && (
          <View className="absolute top-0 left-0 right-0 bottom-0 z-10 items-center justify-center bg-background">
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}
      </>
    )
  }

  const renderDebugVideos = () => {
    let s = step as VideoStep
    let showPoster = false

    console.log("ONBOARD: player1Loading", player1Loading)
    console.log("ONBOARD: player2Loading", player2Loading)
    // console.log("ONBOARD: activePlayer", activePlayer)
    console.log("ONBOARD: showPoster", showPoster)
    return (
      <>
        <View className="relative flex-col w-full">
          <View className="relative w-full h-1/2">{renderComposedVideo()}</View>
          <View className="relative flex flex-row w-full">
            <VideoView
              player={player1}
              style={{
                width: s.poster ? "33%" : "50%",
                aspectRatio: 1,
                borderWidth: activePlayer === 1 && !showPoster ? 2 : 0,
                borderColor: "green",
              }}
              nativeControls={false}
              onFirstFrameRender={() => {
                console.log("ONBOARD: player1 first frame render")
              }}
            />
            <VideoView
              player={player2}
              style={{
                width: s.poster ? "33%" : "50%",
                aspectRatio: 1,
                borderWidth: activePlayer === 2 && !showPoster ? 2 : 0,
                borderColor: "green",
              }}
              nativeControls={false}
              onFirstFrameRender={() => {
                console.log("ONBOARD: player2 first frame render")
              }}
            />
            {s.poster && (
              <Image
                source={s.poster}
                style={{
                  width: "33%",
                  height: "100%",
                  borderWidth: showPoster ? 2 : 0,
                  borderColor: "green",
                }}
                contentFit="contain"
              />
            )}
            {!s.poster && (
              <View className="w-1/3 items-center justify-center bg-background">
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            )}
          </View>
        </View>
      </>
    )
  }

  const renderContent = () => {
    if (isCurrentStepImage) {
      return (
        <View style={step.containerStyle} className={step.containerClassName}>
          <Image
            source={step.source}
            style={{
              width: "100%",
              height: "100%",
            }}
            contentFit="contain"
          />
        </View>
      )
    }

    return (
      <>
        {/* <View className="relative" style={{width: "100%"}}> */}
        {/* {renderComposedVideo()} */}
        {/* </View> */}

        {__DEV__ ? renderDebugVideos() : renderComposedVideo()}

        {/* Poster image overlay - shown until first frame renders */}
        {/* {showPoster && step.poster && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
            }}>
            <Image
              source={step.poster}
              style={{
                width: "100%",
                height: "100%",
              }}
              contentFit="contain"
            />
          </View>
        )} */}

        {/* Loading indicator - shown while video is loading and no poster */}
        {/* {isVideoLoading && !step.poster && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: theme.colors.background,
            }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )} */}
      </>
    )
  }

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
        onLeftPress={handleExit}
      />
      <View id="main" className="flex flex-1">
        <View id="top" className="flex">
          {step.title && <Text className="text-center text-2xl font-semibold" text={step.title} />}

          <View className="-mx-6">
            <View className="relative" style={{width: "100%", aspectRatio: 1}}>
              {renderContent()}
            </View>

            {showReplayButton && isCurrentStepVideo && (
              <View className="absolute bottom-8 left-0 right-0 items-center z-10">
                <Button preset="secondary" className="min-w-24" tx="onboarding:replay" onPress={handleReplay} />
              </View>
            )}
          </View>

          {hasStarted && (
            <View className="flex flex-col gap-2 mt-4">
              {step.subtitle && <Text className="text-center text-xl font-semibold" text={step.subtitle} />}
              {step.subtitle2 && <Text className="text-center text-xl font-semibold" text={step.subtitle2} />}
              {step.info && (
                <View className="flex flex-row gap-2 justify-center items-center px-12">
                  <Icon name="info" size={20} color={theme.colors.muted_foreground} />
                  <Text
                    className="text-center text-sm font-medium text-muted-foreground"
                    text={step.info}
                    numberOfLines={2}
                  />
                </View>
              )}
            </View>
          )}
        </View>

        <View id="bottom" className="flex justify-end flex-grow">
          {!hasStarted && (mainTitle || mainSubtitle) && (
            <View className="flex flex-col gap-2">
              {mainTitle && <Text className="text-center text-xl font-semibold" text={mainTitle} />}
              {mainSubtitle && <Text className="text-center text-sm font-medium" text={mainSubtitle} />}
            </View>
          )}

          {step.bullets && renderBullets(step.bullets)}

          {!hasStarted && (
            <View className="flex flex-col gap-4 mt-8">
              <Button flexContainer tx="onboarding:continueOnboarding" onPress={handleStart} />
              {showSkipButton && <Button flexContainer preset="secondary" tx="common:skip" onPress={handleSkip} />}
            </View>
          )}

          {hasStarted && (showNextButton || showPoster) && (
            <View className="flex flex-col gap-4">
              {!isLastStep ? (
                <Button
                  flexContainer
                  tx="common:continue"
                  onPress={() => {
                    handleNext(true)
                  }}
                />
              ) : (
                <Button flexContainer text={endButtonText} onPress={endButtonFn} />
              )}
              {!isFirstStep && <Button flexContainer preset="secondary" text="Back" onPress={handleBack} />}
            </View>
          )}
        </View>
      </View>
    </>
  )
}
