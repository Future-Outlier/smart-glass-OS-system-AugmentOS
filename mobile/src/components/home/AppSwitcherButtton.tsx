import {View} from "react-native"
import Animated, {SharedValue, useSharedValue, withSpring} from "react-native-reanimated"
import {Gesture, GestureDetector} from "react-native-gesture-handler"

import {Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {
  useActiveApps,
  useActiveBackgroundApps,
  useActiveForegroundApp,
} from "@/stores/applets"

interface AppSwitcherButtonProps {
  swipeProgress: SharedValue<number>
}

const SWIPE_DISTANCE_THRESHOLD = 100 // Distance needed to trigger open
const SWIPE_VELOCITY_THRESHOLD = 800 // Velocity threshold for quick swipes
const SWIPE_DISTANCE_MULTIPLIER = 0.5
const SWIPE_PERCENT_THRESHOLD = 0.5

export default function AppSwitcherButton({swipeProgress}: AppSwitcherButtonProps) {
  const {theme} = useAppTheme()
  const backgroundApps = useActiveBackgroundApps()
  const foregroundApp = useActiveForegroundApp()
  const apps = useActiveApps()
  const appsCount = apps.length

  const translateY = useSharedValue(0)

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only track upward swipes (negative Y)
      if (event.translationY < 0) {
        translateY.value = event.translationY * 1
        swipeProgress.value = Math.min(
          1,
          Math.abs(translateY.value) / (SWIPE_DISTANCE_THRESHOLD * SWIPE_DISTANCE_MULTIPLIER),
        )
      }
    })
    .onEnd((event) => {
      const swipeDistance = Math.abs(translateY.value)
      const swipeVelocity = Math.abs(event.velocityY)
      const normalizedVelocity = event.velocityY / (SWIPE_DISTANCE_THRESHOLD * SWIPE_DISTANCE_MULTIPLIER)

      const shouldOpen =
        swipeProgress.value > SWIPE_PERCENT_THRESHOLD ||
        swipeDistance > SWIPE_DISTANCE_THRESHOLD ||
        swipeVelocity > SWIPE_VELOCITY_THRESHOLD

      if (shouldOpen) {
        swipeProgress.value = withSpring(1, {
          damping: 20,
          stiffness: 300,
          overshootClamping: true,
          velocity: normalizedVelocity,
        })
      } else {
        swipeProgress.value = withSpring(0, {
          damping: 20,
          stiffness: 300,
          overshootClamping: true,
          velocity: normalizedVelocity,
        })
      }

      translateY.value = 0
    })

  const tapGesture = Gesture.Tap().onEnd(() => {
    swipeProgress.value = withSpring(1, {damping: 20, stiffness: 300, overshootClamping: true})
  })

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture)

  if (appsCount === 0) {
    // Show placeholder when no active app
    return (
      <GestureDetector gesture={composedGesture}>
        <Animated.View className="bg-primary-foreground py-1.5 pl-3 min-h-15 rounded-2xl flex-row justify-between items-center mt-4 mb-8">
          <View className="flex-row items-center justify-center flex-1">
            <Text className="text-muted-foreground text-lg" tx="home:appletPlaceholder2" />
          </View>
        </Animated.View>
      </GestureDetector>
    )
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View className="bg-primary-foreground py-1.5 pl-3 rounded-2xl flex-row justify-between items-center mt-4 mb-8">
        <View className="flex-row items-center gap-3 flex-1 px-2">
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
            {backgroundApps.slice(0, 3).map((app, index) => (
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
          {
            foregroundApp && (
              // <View className="border-2 border-primary rounded-2xl p-0.5">
              <AppIcon app={foregroundApp} className="w-12 h-12" />
            )
            // </View>
          }
        </View>
      </Animated.View>
    </GestureDetector>
  )
}
