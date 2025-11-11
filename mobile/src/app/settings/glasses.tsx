import {Header, Screen} from "@/components/ignite"
import {ScrollView} from "react-native"
import {ConnectDeviceButton} from "@/components/glasses/ConnectDeviceButton"

import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"
import {translate} from "@/i18n/translate"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Spacer} from "@/components/ui/Spacer"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {NotConnectedInfo} from "@/components/glasses/info/NotConnectedInfo"

export default function Glasses() {
  const {theme} = useAppTheme()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const {status} = useCoreStatus()
  const {goBack} = useNavigationHistory()

  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())
  let pageTitle

  if (defaultWearable) {
    pageTitle = formatGlassesTitle(defaultWearable)
  } else {
    pageTitle = translate("glasses:title")
  }

  let connected = Boolean(status.glasses_info?.model_name)
  // let features = getCapabilitiesForModel(defaultWearable)

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.s6}}>
      <Header title={pageTitle} leftIcon="chevron-left" onLeftPress={() => goBack()} />
      <ScrollView
        style={{marginRight: -theme.spacing.s4, paddingRight: theme.spacing.s4}}
        contentInsetAdjustmentBehavior="automatic">
        {/* <CloudConnection /> */}
        {/* {connected && features?.hasDisplay && <ConnectedSimulatedGlassesInfo />} */}
        {/* {connected && features?.hasDisplay && <ConnectedGlasses showTitle={false} />} */}
        {/* <Spacer height={theme.spacing.s6} /> */}
        {!connected && <Spacer height={theme.spacing.s6} />}
        {!connected && <ConnectDeviceButton />}
        {/* Show helper text if glasses are paired but not connected */}
        {!connected && defaultWearable && <NotConnectedInfo />}

        <Spacer height={theme.spacing.s6} />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
