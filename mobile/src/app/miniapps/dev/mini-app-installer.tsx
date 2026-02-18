import {useRef, useState} from "react"
import {ScrollView, TextInput, TouchableOpacity, View} from "react-native"

import {Button, Icon, Screen} from "@/components/ignite"
import {MiniAppDualButtonHeader} from "@/components/miniapps/DualButton"
import {Text} from "@/components/ignite"
import AppIcon from "@/components/home/AppIcon"
import composer from "@/services/Composer"
import Toast from "react-native-toast-message"
import {useLocalMiniApps} from "@/stores/applets"
import {useAppTheme} from "@/contexts/ThemeContext"

export default function MiniAppInstaller() {
  const viewShotRef = useRef<View>(null)
  const [url, setUrl] = useState("")
  const lmas = useLocalMiniApps()
  const {theme} = useAppTheme()

  const handleUninstall = async (packageName: string) => {
    // composer.uninstall(packageName)
  }

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

  const renderLmaList = () => {
    if (lmas.length === 0) {
      return <Text text="No local mini apps installed" />
    }
    return (
      <View className="gap-4 rounded-2xl bg-primary-foreground p-4">
        <Text className="text-xl font-semibold" text="Local Mini Apps" />
        {lmas.map((item, index) => (
          <View
            key={item.packageName ?? index}
            className="flex-row items-center bg-background px-4 py-3 rounded-xl gap-3">
            <AppIcon app={item} style={{width: 48, height: 48}} />
            <Text className="flex-1 text-base font-medium" text={item.name} numberOfLines={1} />
            <Button
              preset="secondary"
              compactIcon
              onPress={() => handleUninstall(item.packageName)}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <Icon name="trash" size={24} color={theme.colors.destructive} />
            </Button>
          </View>
        ))}
      </View>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} ref={viewShotRef}>
      <MiniAppDualButtonHeader packageName="com.mentra.lma_installer" viewShotRef={viewShotRef} />
      {/* <View className="h-24" /> */}

      <ScrollView className="pt-20" contentContainerClassName="flex-grow">
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

        <View className="h-20" />

        {/* local mini apps list */}
        {renderLmaList()}
      </ScrollView>
    </Screen>
  )
}
