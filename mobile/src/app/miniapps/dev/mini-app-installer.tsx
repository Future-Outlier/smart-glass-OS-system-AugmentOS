import {useRef, useState} from "react"
import {TextInput, View} from "react-native"

import {Button, Screen} from "@/components/ignite"
import {MiniAppDualButtonHeader} from "@/components/miniapps/DualButton"
import {Text} from "@/components/ignite"
import composer from "@/services/Composer"
import Toast from "react-native-toast-message"

export default function MiniAppInstaller() {
  const viewShotRef = useRef<View>(null)
  const [url, setUrl] = useState("")

  const handleInstallMiniApp = async () => {
    console.log(`Installing MiniApp: ${url}`)
    let result = await composer.installMiniApp(url)
    console.log("result", result)
    if (result.is_ok()) {
        Toast.show({type: "success", text1: "Mini app installed successfully"})
    } else {
        Toast.show({type: "error", text1: "Failed to install mini app"})
    }
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} ref={viewShotRef}>
      <MiniAppDualButtonHeader packageName="com.mentra.lma_installer" viewShotRef={viewShotRef} />
      <View className="h-24" />

      <View className="gap-12 p-6 rounded-2xl bg-primary-foreground">
        <Text text="Mini App Installer" />
        {/* url text input */}
        <View className="w-full bg-background h-10 items-center justify-center rounded-xl px-3">
          <TextInput
            hitSlop={{top: 16, bottom: 16}}
            className="text-base text-foreground text-md"
            placeholder="Enter URL"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={true}
            keyboardType="url"
          />
        </View>
        <Button preset="primary" onPress={handleInstallMiniApp} text="Install Mini App" />
      </View>
    </Screen>
  )
}
