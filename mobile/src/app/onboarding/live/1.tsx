import {MentraLogoStandalone} from "@/components/brands/MentraLogoStandalone"
import {Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function Onboarding1() {
  const {goBack} = useNavigationHistory()

  return (
    <Screen preset="fixed">
      <Header
        title="Onboarding"
        leftIcon="x"
        RightActionComponent={<MentraLogoStandalone />}
        onLeftPress={() => goBack()}
      />
    </Screen>
  )
}
