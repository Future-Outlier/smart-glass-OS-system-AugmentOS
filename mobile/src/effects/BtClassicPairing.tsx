import {useEffect} from "react"
import {Platform} from "react-native"

import {SETTINGS, useSetting} from "@/stores/settings"
import {useGlassesStore} from "@/stores/glasses"
import {usePathname} from "expo-router"
import {DeviceTypes} from "@/../../cloud/packages/types/src"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export function BtClassicPairing() {
  const btcConnected = useGlassesStore((state) => state.btcConnected)
  const glassesConnected = useGlassesStore((state) => state.connected)
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const {push} = useNavigationHistory()

  const pathname = usePathname()

  // iOS only
  useEffect(() => {
    if (Platform.OS !== "ios") {
      return
    }

    if (pathname !== "/home" && pathname !== "/(tabs)/home") {
      return
    }

    if (defaultWearable !== DeviceTypes.LIVE) {
      return
    }

    if (glassesConnected && btcConnected) {
      return
    }

    if (glassesConnected && !btcConnected) {
      showAlert(
        "Glasses Bluetooth disconnected",
        "Your glasses are connected to the app, but the Bluetooth Classic device is not connected. Please pair the Bluetooth Classic device to continue.",
        [
          {text: translate("common:ignore"), onPress: () => {}},
          {
            text: translate("common:connect"),
            onPress: () => {
              push("/pairing/btclassic")
            },
          },
        ],
      )
    }
  }, [pathname, defaultWearable, glassesConnected, btcConnected])

  //   // Add a listener for app state changes to detect when the app comes back from background
  //   useEffect(() => {
  //     const handleAppStateChange = async (nextAppState: any) => {
  //       console.log("App state changed to:", nextAppState)
  //       // If app comes back to foreground, hide the loading overlay
  //       if (nextAppState === "active") {
  //         const reconnectOnAppForeground = await useSettingsStore
  //           .getState()
  //           .getSetting(SETTINGS.reconnect_on_app_foreground.key)
  //         if (!reconnectOnAppForeground) {
  //           return
  //         }
  //         // check if we have bluetooth perms in case they got removed:
  //         const requirementsCheck = await checkConnectivityRequirementsUI()
  //         if (!requirementsCheck) {
  //           return
  //         }
  //         await CoreModule.connectDefault()
  //       }
  //     }

  //     // Subscribe to app state changes
  //     const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

  //     return () => {
  //       appStateSubscription.remove()
  //     }
  //   }, []) // subscribe only once

  return null
}
