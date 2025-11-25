import {useEffect} from "react"
import {View} from "react-native"

import {useAuth} from "@/contexts/AuthContext"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"

export default function IndexPage() {
  const {loading} = useAuth()
  const {replace} = useNavigationHistory()
  const {theme} = useAppTheme()

  useEffect(() => {
    if (!loading) {
      replace("/init")
    }
  }, [loading, replace])
  
  if (__DEV__) {
    return (
      <View style={{flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center"}}>
        <Text text="(DEV) Index Page" />
      </View>
    )
  }

  // blank screen
  return <View style={{flex: 1, backgroundColor: theme.colors.background}}></View>
}
