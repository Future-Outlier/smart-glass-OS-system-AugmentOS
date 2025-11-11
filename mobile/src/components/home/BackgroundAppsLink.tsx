import {RouteButton} from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {useActiveBackgroundAppsCount} from "@/stores/applets"
import {ViewStyle} from "react-native"

export const BackgroundAppsLink = ({style}: {style?: ViewStyle}) => {
  // const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeCount = useActiveBackgroundAppsCount()

  const handlePress = () => {
    push("/home/background-apps")
  }

  const label = translate("home:backgroundApps") + ` (${activeCount} ${translate("home:backgroundAppsActive")})`
  return <RouteButton label={label} onPress={handlePress} style={style} />
}
