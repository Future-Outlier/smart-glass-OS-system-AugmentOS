import {createContext, useContext, useEffect, useRef, useState} from "react"
import {View} from "react-native"
import {WebView} from "react-native-webview"

import restComms from "@/services/RestComms"
import {SETTINGS, useSettingsStore} from "@/stores/settings"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"

const STORE_PACKAGE_NAME = "org.augmentos.store"

interface AppStoreWebviewPrefetchContextType {
  appStoreUrl: string
  webviewLoading: boolean
  webViewRef: React.RefObject<WebView>
  reloadWebview: () => void
}

const AppStoreWebviewPrefetchContext = createContext<AppStoreWebviewPrefetchContextType | undefined>(undefined)

export const useAppStoreWebviewPrefetch = () => {
  const ctx = useContext(AppStoreWebviewPrefetchContext)
  if (!ctx) throw new Error("useAppStoreWebviewPrefetch must be used within AppStoreWebviewPrefetchProvider")
  return ctx
}

export const AppStoreWebviewPrefetchProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [appStoreUrl, setAppStoreUrl] = useState("")
  const [webviewLoading, setWebviewLoading] = useState(true)
  const webViewRef = useRef<WebView>(null)
  const {theme} = useAppTheme()

  // Prefetch logic
  const prefetchWebview = async () => {
    setWebviewLoading(true)

    try {
      const baseUrl = useSettingsStore.getState().getSetting(SETTINGS.store_url.key)
      const url = new URL(baseUrl)
      url.searchParams.set("theme", theme.isDark ? "dark" : "light")

      // Check if core token exists before trying to generate webview tokens
      if (!restComms.getCoreToken()) {
        console.log("AppStoreWebviewPrefetchProvider: No core token available yet, waiting for CORE_TOKEN_SET")
        // Don't set URL without tokens - keep loading state until tokens are ready
        return
      }

      const tempTokenResult = await restComms.generateWebviewToken(STORE_PACKAGE_NAME)
      if (tempTokenResult.is_error()) {
        console.error("AppStoreWebviewPrefetchProvider: Failed to generate temp token:", tempTokenResult.error)
        return
      }
      const tempToken = tempTokenResult.value

      let signedUserToken: string | undefined
      const signedUserTokenResult = await restComms.generateWebviewToken(
        STORE_PACKAGE_NAME,
        "generate-webview-signed-user-token",
      )
      if (signedUserTokenResult.is_error()) {
        console.warn(
          "AppStoreWebviewPrefetchProvider: Failed to generate signed user token:",
          signedUserTokenResult.error,
        )
        signedUserToken = undefined
      } else {
        signedUserToken = signedUserTokenResult.value
      }

      url.searchParams.set("aos_temp_token", tempToken)
      if (signedUserToken) {
        url.searchParams.set("aos_signed_user_token", signedUserToken)
      }

      // console.log("AppStoreWebviewPrefetchProvider: Final URL ready with tokens")
      setAppStoreUrl(url.toString())
    } catch (error) {
      console.error("AppStoreWebviewPrefetchProvider: Error during prefetch:", error)
      // Don't set URL without tokens - keep loading state and let user retry or wait for token
      // The store screen will show "Preparing App Store..." instead of signed-out state
    } finally {
      setWebviewLoading(false)
    }
  }

  useEffect(() => {
    // Check if we already have a core token
    if (restComms.getCoreToken()) {
      prefetchWebview().catch(error => {
        console.error("AppStoreWebviewPrefetchProvider: Error during initial prefetch:", error)
      })
    }

    // Listen for when core token is set
    const handleCoreTokenSet = () => {
      prefetchWebview().catch(error => {
        console.error("AppStoreWebviewPrefetchProvider: Error during core token prefetch:", error)
      })
    }

    GlobalEventEmitter.on("CORE_TOKEN_SET", handleCoreTokenSet)

    return () => {
      GlobalEventEmitter.removeListener("CORE_TOKEN_SET", handleCoreTokenSet)
    }
  }, [theme.isDark]) // Re-run when theme changes

  // Listen for logout events to clear WebView data
  useEffect(() => {
    const handleClearWebViewData = () => {
      console.log("AppStoreWebviewPrefetchProvider: Clearing WebView data on logout")

      // Clear WebView cache and data
      if (webViewRef.current) {
        webViewRef.current.clearCache?.(true)
        webViewRef.current.clearFormData?.()
        webViewRef.current.clearHistory?.()
      }

      // Reset the URL state to force fresh token generation
      setAppStoreUrl("")

      // Reload with fresh tokens after clearing
      setTimeout(() => {
        prefetchWebview().catch(error => {
          console.error("AppStoreWebviewPrefetchProvider: Error during clear webview data prefetch:", error)
        })
      }, 100)
    }

    GlobalEventEmitter.on("CLEAR_WEBVIEW_DATA", handleClearWebViewData)

    return () => {
      GlobalEventEmitter.removeListener("CLEAR_WEBVIEW_DATA", handleClearWebViewData)
    }
  }, [])

  // Expose a reload method (e.g., for logout/login)
  const reloadWebview = () => {
    prefetchWebview().catch(error => {
      console.error("AppStoreWebviewPrefetchProvider: Error during reload webview:", error)
    })
  }

  return (
    <AppStoreWebviewPrefetchContext.Provider value={{appStoreUrl, webviewLoading, webViewRef, reloadWebview}}>
      {/* Hidden WebView for prefetching */}
      {appStoreUrl ? (
        <View style={{width: 0, height: 0, position: "absolute", opacity: 0}} pointerEvents="none">
          <WebView
            ref={webViewRef}
            source={{uri: appStoreUrl}}
            style={{width: 0, height: 0}}
            onLoadStart={() => setWebviewLoading(true)}
            onLoadEnd={() => setWebviewLoading(false)}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={false}
            scalesPageToFit={false}
            cacheEnabled={true}
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
          />
        </View>
      ) : null}
      {children}
    </AppStoreWebviewPrefetchContext.Provider>
  )
}
