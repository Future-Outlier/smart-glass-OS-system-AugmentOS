import {ScrollView} from "react-native"

import {DeviceInformation} from "@/components/glasses/info/DeviceInformation"
import {Header, Screen} from "@/components/ignite"
import {Spacer} from "@/components/ui"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {$styles} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

export default function DeviceInfoScreen() {
  const {theme, themed} = useAppTheme()
  const {goBack} = useNavigationHistory()

  return (
    <Screen preset="fixed" style={themed($styles.screen)}>
      <Header titleTx="deviceInfo:title" leftIcon="chevron-left" onLeftPress={goBack} />
      <Spacer height={theme.spacing.s6} />
      <ScrollView>
        <DeviceInformation />
      </ScrollView>
    </Screen>
  )
}
