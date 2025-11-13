import {useEffect} from "react"
import {useAuth} from "@/contexts/AuthContext"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {View} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"

export default function IndexPage() {
  const {loading} = useAuth()
  const {replace} = useNavigationHistory()
  const {theme} = useAppTheme()

  useEffect(() => {
    const initializeApp = async () => {
      replace("/init")
    }

    if (!loading) {
      initializeApp().catch(error => {
        console.error("Error initializing app:", error)
      })
    }
  }, [loading])

  // blank screen
  return <View style={{flex: 1, backgroundColor: theme.colors.background}}></View>
}
