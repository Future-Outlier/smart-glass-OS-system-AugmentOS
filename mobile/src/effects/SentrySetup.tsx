import * as Sentry from "@sentry/react-native"
import {useNavigationContainerRef} from "expo-router"
import {useEffect} from "react"

import {SETTINGS, useSettingsStore} from "@/stores/settings"

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  routeChangeTimeoutMs: 1_000, // default: 1_000
  ignoreEmptyBackNavigationTransactions: true, // default: true
})

export function SentrySetup() {
  const ref = useNavigationContainerRef()
  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref)
    }
  }, [ref])

  useEffect(() => {
    // Only initialize Sentry if DSN is provided
    const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
    const isChina = useSettingsStore.getState().getSetting(SETTINGS.china_deployment.key)

    if (!sentryDsn || sentryDsn === "secret" || sentryDsn.trim() === "") {
      return
    }
    if (isChina) {
      return
    }

    const release = `${process.env.EXPO_PUBLIC_MENTRAOS_VERSION}`
    const dist = `${process.env.EXPO_PUBLIC_BUILD_TIME}-${process.env.EXPO_PUBLIC_BUILD_COMMIT}`
    Sentry.init({
      dsn: sentryDsn,

      // Adds more context data to events (IP address, cookies, user, etc.)
      // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
      sendDefaultPii: true,

      // send 1/10th of events in prod:
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,

      // attachScreenshot: true,
      debug: true,
      _experiments: {
        enableUnhandledCPPExceptionsV2: true,
      },
      //   enableNativeCrashHandling: false,
      //   enableNativeNagger: false,
      //   enableNative: false,
      //   enableLogs: false,
      //   enabled: false,
      release: release,
      dist: dist,

      // Configure Session Replay
      // DISABLED: Mobile replay causes MediaCodec spam by recording screen every 5 seconds
      // replaysSessionSampleRate: 0.1,
      // replaysOnErrorSampleRate: 1,
      // integrations: [Sentry.mobileReplayIntegration()],

      // uncomment the line below to enable Spotlight (https://spotlightjs.com)
      // spotlight: __DEV__,

      // beforeSend(event, hint) {
      //   // console.log("Sentry.beforeSend", event, hint)
      //   console.log("Sentry.beforeSend", hint)
      //   return event
      // },

      integrations: [
        Sentry.feedbackIntegration({
          // Additional SDK configuration goes in here, for example:
          styles: {
            submitButton: {
              //   backgroundColor: theme.colors.primary,
            },
          },
          //   namePlaceholder: "Fullname",
        }),
      ],
    })

    return () => {}
  }, []) // subscribe only once

  return null
}
