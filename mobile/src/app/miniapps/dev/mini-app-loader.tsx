import {useRef, useState} from "react"
import {ScrollView, TextInput, View} from "react-native"

import {Button, Screen} from "@/components/ignite"
import {MiniAppDualButtonHeader} from "@/components/miniapps/DualButton"
import {Text} from "@/components/ignite"
import LocalMiniApp from "@/components/home/LocalMiniApp"

export default function MiniAppInstaller() {
  const viewShotRef = useRef<View>(null)
  const [url, setUrl] = useState("")

  const handleLoadMiniApp = async () => {
    console.log(`LMA_LOADER: Loading MiniApp: ${url}`)
    setUrl(url)
  }

  const renderLocalMiniApp = () => {
    if (!url) {
      return null
    }
    return (
      <View className="flex-1 -mx-6">
        <LocalMiniApp url={url} packageName="com.mentra.dev.mini_app_loader" />
      </View>
    )
  }

  const renderUrlInput = () => {
    if (url) {
      return null
    }
    return (
      <ScrollView className="pt-20" contentContainerClassName="flex-grow">
        <View className="gap-12 p-6 rounded-2xl bg-primary-foreground">
          <Text tx="lmaLoader:miniAppLoader" className="text-xl font-semibold" />
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
              autoFocus={false}
              keyboardType="url"
            />
          </View>
          <Button preset="primary" onPress={handleLoadMiniApp} text="Load Mini App" />
        </View>

        <View className="h-10" />
      </ScrollView>
    )
  }

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} ref={viewShotRef}>
      <MiniAppDualButtonHeader packageName="com.mentra.lma_loader" viewShotRef={viewShotRef} />
      {renderUrlInput()}
      {renderLocalMiniApp()}
    </Screen>
  )
}
