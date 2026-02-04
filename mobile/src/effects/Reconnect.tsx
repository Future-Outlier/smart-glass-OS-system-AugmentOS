import {useEffect} from "react"
import {AppState} from "react-native"

import {SETTINGS, useSettingsStore} from "@/stores/settings"
import {checkConnectivityRequirementsUI} from "@/utils/PermissionsUtils"
import CoreModule from "core"
import {useGlassesStore} from "@/stores/glasses"
import {useCoreStore} from "@/stores/core"

export function Reconnect() {
  const glassesConnected = useGlassesStore((state) => state.connected)
  const isSearching = useCoreStore((state) => state.searching)

  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: any) => {
      console.log("RECONNECT: App state changed to:", nextAppState)
      // If app comes back to foreground, hide the loading overlay
      if (nextAppState === "active") {
        const reconnectOnAppForeground = await useSettingsStore
          .getState()
          .getSetting(SETTINGS.reconnect_on_app_foreground.key)
        if (!reconnectOnAppForeground) {
          return
        }

        if (glassesConnected || isSearching) {
          return
        }

        // check if we have bluetooth perms in case they got removed:
        const requirementsCheck = await checkConnectivityRequirementsUI()
        if (!requirementsCheck) {
          return
        }
        await CoreModule.connectDefault()
      }
    }

    // Subscribe to app state changes
    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, [glassesConnected, isSearching])

  return null
}
