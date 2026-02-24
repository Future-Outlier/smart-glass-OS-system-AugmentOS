import {Platform, View} from "react-native"
import Animated, {runOnJS, SharedValue, useSharedValue, withSpring} from "react-native-reanimated"
import {Gesture, GestureDetector} from "react-native-gesture-handler"

import {Button, Icon, Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {ClientAppletInterface, useActiveApps, useActiveBackgroundApps, useActiveForegroundApp} from "@/stores/applets"
import * as Haptics from "expo-haptics"
import {useEffect, useRef, useState} from "react"
import {scheduleOnRN} from "react-native-worklets"
import AllAppsGridButton from "@/components/home/AllAppsGridButton"
import {BlurView} from "expo-blur"
import {LinearGradient} from "expo-linear-gradient"

interface AppSwitcherButtonProps {
  swipeProgress: SharedValue<number>
}

const SWIPE_DISTANCE_THRESHOLD = 300 // Distance needed to trigger open
const SWIPE_DISTANCE_MULTIPLIER = 1
const SWIPE_PERCENT_THRESHOLD = 0.2
// const SWIPE_VELOCITY_THRESHOLD = 800 // Velocity threshold for quick swipes

export default function AppSwitcherButton({swipeProgress}: AppSwitcherButtonProps) {
  const {theme} = useAppTheme()
  const backgroundApps = useActiveBackgroundApps()
  const foregroundApp = useActiveForegroundApp()
  const apps = useActiveApps()
  const appsCount = apps.length
  const hasBuzzedRef = useRef(false)
  const [appsList, setAppsList] = useState<ClientAppletInterface[]>([])

  const translateY = useSharedValue(0)

  useEffect(() => {
    let list = [...backgroundApps]
    if (foregroundApp) {
      list.push(foregroundApp)
    }
    setAppsList(list)
  }, [backgroundApps, foregroundApp])

  const buzz = () => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap)
    }
  }

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only track upward swipes (negative Y)
      if (event.translationY < 0) {
        translateY.value = event.translationY
        let swipeValue = Math.min(
          1,
          Math.abs(translateY.value) / (SWIPE_DISTANCE_THRESHOLD * SWIPE_DISTANCE_MULTIPLIER),
        )

        // don't allow the swipe progress to be 1, until we have ended the swipe gesture:
        if (swipeValue > 0.9) {
          swipeProgress.value = 0.9
        } else {
          swipeProgress.value = swipeValue
        }

        const swipeDistance = Math.abs(translateY.value)

        const shouldOpen = swipeProgress.value > SWIPE_PERCENT_THRESHOLD || swipeDistance > SWIPE_DISTANCE_THRESHOLD

        if (shouldOpen && !hasBuzzedRef.current) {
          hasBuzzedRef.current = true
          scheduleOnRN(buzz)
          // runOnJS(buzz)()
        }
      }
    })
    .onEnd((event) => {
      const swipeDistance = Math.abs(translateY.value)
      // const normalizedVelocity = event.velocityY / (SWIPE_DISTANCE_THRESHOLD * SWIPE_DISTANCE_MULTIPLIER)
      // const velocity = event.velocityY / 100

      const shouldOpen = swipeProgress.value > SWIPE_PERCENT_THRESHOLD || swipeDistance > SWIPE_DISTANCE_THRESHOLD

      if (shouldOpen) {
        swipeProgress.value = withSpring(1, {
          damping: 20,
          stiffness: 2000,
          overshootClamping: true,
          // velocity: velocity,
        })
      } else {
        swipeProgress.value = withSpring(0, {
          damping: 20,
          stiffness: 500,
          overshootClamping: true,
          // velocity: velocity,
        })
      }
      hasBuzzedRef.current = false

      translateY.value = 0
    })

  const tapGesture = Gesture.Tap().onEnd(() => {
    swipeProgress.value = withSpring(1, {damping: 20, stiffness: 300, overshootClamping: true})
  })

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture)

  if (appsCount === 0) {
    // Show placeholder when no active app
    return (
      <View className="w-full flex-row justify-between items-center gap-4 mb-8 bottom-0 h-15 absolute">
        <View className="bg-primary-foreground flex-1 py-1.5 pl-3 min-h-15 rounded-2xl flex-row justify-between items-center">
          <GestureDetector gesture={composedGesture}>
            <View className="flex-row items-center justify-center flex-1">
              <Text className="text-muted-foreground text-md" tx="home:appletPlaceholder2" />
            </View>
          </GestureDetector>
        </View>
        <View className="bg-primary-foreground items-center p-2 rounded-2xl">
          <AllAppsGridButton />
        </View>
      </View>
    )
  }

  // base 15 height
  let bgAlpha = `${theme.colors.background}00`
  return (
    <View className="w-screen flex-row justify-between items-center gap-4 pb-6 pt-4 bottom-0 h-25 -ml-6 px-6 absolute">
      {/* <BlurView intensity={20} className="absolute inset-0" /> */}
      <LinearGradient
        colors={[bgAlpha, bgAlpha, bgAlpha, theme.colors.background]}
        locations={[0, 0, 0, 1]}
        start={{x: 0, y: 0}}
        end={{x: 0, y: 1}}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
        pointerEvents="none"
      />
      <View className="bg-primary-foreground flex-1 py-1.5 pl-3 rounded-2xl flex-row justify-between items-center">
        <View className="flex-row items-center gap-3 flex-1 px-2">
          <GestureDetector gesture={composedGesture}>
            <View className="flex-row flex-1">
              <View className="flex-col gap-1 flex-1">
                <Text
                  text={translate("home:running").toUpperCase()}
                  className="font-semibold text-secondary-foreground text-sm"
                />
                {/* {appsCount > 0 && <Badge text={`${translate("home:appsCount", {count: appsCount})}`} />} */}
                {appsCount > 0 && (
                  <Text
                    text={translate("home:appsCount", {count: appsCount})}
                    className="text-secondary-foreground text-xs"
                  />
                )}
              </View>

              <View className="flex-row items-center">
                {appsList.slice(0, 9).map((app, index) => (
                  <View
                    key={app.packageName}
                    style={{
                      zIndex: index,
                      marginLeft: index > 0 ? -theme.spacing.s8 : 0,
                    }}>
                    <AppIcon app={app} className="w-12 h-12" />
                  </View>
                ))}
              </View>
            </View>
          </GestureDetector>
          {/* {
            foregroundApp && (
              // <View className="border-2 border-primary rounded-2xl p-0.5">
              <AppIcon app={foregroundApp} className="w-12 h-12" />
              )
            // </View>
          } */}
        </View>
      </View>
      <View className="bg-primary-foreground items-center p-2 rounded-2xl">
        <AllAppsGridButton />
      </View>
    </View>
  )
}
