import {useState, useEffect, useCallback} from "react"
import {View, Pressable, Text} from "react-native"
import {Asset} from "expo-asset"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import {GestureHandlerRootView} from "react-native-gesture-handler"

import {Screen, Header} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import AppSwitcher, {AppCard} from "@/components/home/AppSwitcher"

// Example apps with colors for visual variety
const INITIAL_APPS: AppCard[] = [
  {id: "1", name: "Messages", color: "#34C759"},
  {id: "2", name: "Safari", color: "#007AFF"},
  {id: "3", name: "Photos", color: "#FF9500"},
  {id: "4", name: "Settings", color: "#8E8E93"},
  {id: "5", name: "Music", color: "#FF2D55"},
  {id: "6", name: "Mail", color: "#5AC8FA"},
]

export default function MiniApp() {
  const {goBack} = useNavigationHistory()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [apps, setApps] = useState<AppCard[]>(INITIAL_APPS)

  // Animation values for the main content when switcher is open
  const contentScale = useSharedValue(1)
  const contentBorderRadius = useSharedValue(0)

  useEffect(() => {
    if (showSwitcher) {
      contentScale.value = withSpring(0.88, {damping: 20, stiffness: 120})
      contentBorderRadius.value = withTiming(40, {duration: 250})
    } else {
      contentScale.value = withSpring(1, {damping: 20, stiffness: 120})
      contentBorderRadius.value = withTiming(0, {duration: 200})
    }
  }, [showSwitcher])

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{scale: contentScale.value}],
    borderRadius: contentBorderRadius.value,
    overflow: "hidden",
  }))

  const handleOpenSwitcher = useCallback(() => {
    setShowSwitcher(true)
  }, [])

  const handleCloseSwitcher = useCallback(() => {
    setShowSwitcher(false)
  }, [])

  const handleAppSelect = useCallback((id: string) => {
    console.log("Selected app:", id)
    // Here you would navigate to the selected app
    // For demo, we just close the switcher
    setShowSwitcher(false)
  }, [])

  const handleAppDismiss = useCallback((id: string) => {
    setApps((prev) => prev.filter((app) => app.id !== id))
  }, [])

  return (
    <GestureHandlerRootView className="flex-1 bg-black">
      <Screen preset="fixed" safeAreaEdges={[]}>
        {/* Main Content - scales down when switcher opens */}
        <Animated.View style={[{flex: 1, backgroundColor: "#000"}, contentStyle]}>
          <View className="flex-1 bg-white">
            <Header
              title="MiniApp"
              titleMode="center"
              leftIcon="chevron-left"
              onLeftPress={() => goBack()}
              style={{height: 44}}
            />
          </View>

          {/* Home Indicator - tap to open switcher */}
          <Pressable
            onPress={handleOpenSwitcher}
            className="absolute bottom-2 left-0 right-0 items-center py-2"
          >
            <View className="w-32 h-1 rounded-full bg-gray-600" />
          </Pressable>
        </Animated.View>

        {/* Floating Action Button for easier access */}
        <Pressable
          onPress={handleOpenSwitcher}
          className="absolute bottom-24 right-5 w-14 h-14 rounded-full bg-gray-800 items-center justify-center"
          style={{
            shadowColor: "#000",
            shadowOffset: {width: 0, height: 4},
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 10,
          }}
        >
          {/* Grid icon representing app switcher */}
          <View className="items-center justify-center">
            <View className="flex-row mb-1">
              <View className="w-2.5 h-2.5 rounded-sm bg-white mr-1" />
              <View className="w-2.5 h-2.5 rounded-sm bg-white" />
            </View>
            <View className="flex-row">
              <View className="w-2.5 h-2.5 rounded-sm bg-white mr-1" />
              <View className="w-2.5 h-2.5 rounded-sm bg-white" />
            </View>
          </View>
        </Pressable>

        {/* App Switcher Overlay */}
        <AppSwitcher
          visible={showSwitcher}
          onClose={handleCloseSwitcher}
          apps={apps}
          onAppSelect={handleAppSelect}
          onAppDismiss={handleAppDismiss}
        />
      </Screen>
    </GestureHandlerRootView>
  )
}