import {useRef, useEffect} from "react"
import {View, ViewStyle, TextStyle, ActivityIndicator} from "react-native"
import {WebView} from "react-native-webview"

import {Screen, Header, Text} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import miniComms, {SuperWebViewMessage} from "@/services/MiniComms"

interface LocalMiniAppProps {
  url: string
}

export default function LocalMiniApp(props: LocalMiniAppProps) {
  const {theme} = useAppTheme()
  const webViewRef = useRef<WebView>(null)

  // Set up SuperComms message handler to send messages to WebView
  useEffect(() => {
    const sendToWebView = (message: string) => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.receiveNativeMessage(${message});
          true;
        `)
      }
    }

    miniComms.setWebViewMessageHandler(sendToWebView)

    // Listen for messages from SuperComms
    const handleMessage = (message: SuperWebViewMessage) => {
      console.log(`SUPERAPP: Native received: ${message.type}`)
    }

    setInterval(() => {
      console.log("KEEPING ALIVE")
      webViewRef.current?.injectJavaScript(`
        typeof keepAlive === 'function' && keepAlive();
        true;
      `)
    }, 1000)

    miniComms.on("message", handleMessage)

    return () => {
      miniComms.off("message", handleMessage)
    }
  }, [])

  // Handle messages from WebView
  const handleWebViewMessage = (event: any) => {
    const data = event.nativeEvent.data
    miniComms.handleWebViewMessage(data)
  }

  return (
    <WebView
      ref={webViewRef}
      source={{uri: "https://lma-example.com"}}
      style={{flex: 1}}
      onMessage={handleWebViewMessage}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      renderLoading={() => (
        <View className="absolute inset-0 items-center bg-background justify-center">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text text="Loading Local Mini App..." className="text-foreground text-sm mt-2" />
        </View>
      )}
    />
  )
}
