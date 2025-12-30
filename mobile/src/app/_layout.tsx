import "@/utils/polyfills/event" // Must be before any livekit imports
import {useFonts} from "expo-font"
import {registerGlobals} from "@livekit/react-native-webrtc"
import * as Sentry from "@sentry/react-native"
import {Stack, SplashScreen, useNavigationContainerRef} from "expo-router"
import {useEffect, useState} from "react"
import {LogBox, View} from "react-native"

import {SentryNavigationIntegration, SentrySetup} from "@/effects/SentrySetup"
import {initI18n} from "@/i18n"
import {useSettingsStore} from "@/stores/settings"
import {customFontsToLoad} from "@/theme"
import {ConsoleLogger} from "@/utils/debug/console"
import {loadDateFnsLocale} from "@/utils/formatDate"
import {AllEffects} from "@/utils/structure/AllEffects"
import {AllProviders} from "@/utils/structure/AllProviders"
import {navigationRef} from "@/contexts/NavigationRef"
import {Text} from "@/components/ignite"
import "@/global.css"

// prevent the annoying warning box at the bottom of the screen from getting in the way:
LogBox.ignoreLogs([
  "Failed to open debugger. Please check that the dev server is running and reload the app.",
  "Require cycle:",
  "is missing the required default export.",
  "Attempted to import the module",
])

SentrySetup()

// initialize the settings store
useSettingsStore.getState().loadAllSettings()

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

function Root() {
  const [_fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [loaded, setLoaded] = useState(false)

  const loadAssets = async () => {
    try {
      await initI18n()
      await loadDateFnsLocale()
      // initialize webrtc
      await registerGlobals()
    } catch (error) {
      console.error("Error loading assets:", error)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  const ref = useNavigationContainerRef()
  useEffect(() => {
    if (ref) {
      SentryNavigationIntegration.registerNavigationContainer(ref)
    }
  }, [ref])

  if (!loaded) {
    return null
  }

  return (
    <AllProviders>
      <AllEffects />
      {/* small banner to show the state of getPreventBack() */}
      <View className="h-24 items-center justify-end bg-red-500">
        <Text className="text-white text-sm">{navigationRef.current?.getPreventBack() ? "true" : "false"}</Text>
      </View>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: !navigationRef.current?.getPreventBack(),
          gestureDirection: "horizontal",
          animation: "simple_push",
        }}
      />
      <ConsoleLogger />
    </AllProviders>
  )
}

export default Sentry.wrap(Root)
