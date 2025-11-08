import {View} from "react-native"
import {Text} from "@/components/ignite"
import {useLocalSearchParams} from "expo-router"
import {Screen, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function VideoPlayer() {
  const {fileName} = useLocalSearchParams()
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]}>
      <Header title="Video Player" leftIcon="arrow-left" onLeftPress={() => goBack()} />
      <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
        <Text style={{color: theme.colors.text}}>Video player not implemented yet</Text>
        <Text style={{color: theme.colors.textDim, marginTop: 8}}>{fileName || "No file selected"}</Text>
      </View>
    </Screen>
  )
}
